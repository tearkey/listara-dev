# Plugin & Theme Architecture

> Stack: TanStack Start (React 19 + Vite 7) on Cloudflare Workers, Lovable Cloud (Postgres + RLS).
> Runtime constraint: the Worker bundle is sealed at build time — no `require()` at runtime, no filesystem `fs.watch`, no child processes, no dynamic `import()` of user-uploaded code. Any "WordPress-like uploadable plugin" is therefore rejected as a security and platform violation. This design gives the same **extension surface** (hooks, filters, view injection, endpoint override) using a compile-time module registry + runtime hook bus + DB-backed activation flags.

---

## 1. Concepts

| WordPress term        | Our equivalent                            | Where it lives                        |
| --------------------- | ----------------------------------------- | ------------------------------------- |
| `add_action`          | `hooks.on(event, handler, priority)`      | `src/lib/hooks/registry.ts`           |
| `do_action`           | `hooks.emit(event, ctx)`                  | called from core code                 |
| `add_filter`          | `hooks.addFilter(name, fn, priority)`     | same registry                         |
| `apply_filters`       | `hooks.applyFilters(name, value, ctx)`    | called from core code                 |
| Plugin activation     | `modules` row: `is_active = true`         | Postgres, gated by feature flag       |
| Plugin file           | `src/modules/<slug>/index.ts` (in-repo)   | shipped in the Worker bundle          |
| Theme                 | `src/themes/<slug>/` (components + CSS)   | shipped in the Worker bundle          |
| View override         | Slot component + `<Slot name="…">`        | React render tree                     |
| Endpoint override     | Route handler consults `modules` registry | `src/routes/api/**`                   |

---

## 2. Hook / Event Bus

```ts
// src/lib/hooks/registry.ts
type Handler<C = unknown> = (ctx: C) => void | Promise<void>;
type Filter<V, C = unknown> = (value: V, ctx: C) => V | Promise<V>;

interface Entry { module: string; priority: number; fn: Function; }

const actions = new Map<string, Entry[]>();
const filters = new Map<string, Entry[]>();

function insert(map: Map<string, Entry[]>, key: string, e: Entry) {
  const list = map.get(key) ?? [];
  list.push(e);
  list.sort((a, b) => a.priority - b.priority); // lower = earlier, WP-style
  map.set(key, list);
}

export const hooks = {
  on(event: string, fn: Handler, opts: { module: string; priority?: number }) {
    insert(actions, event, { module: opts.module, priority: opts.priority ?? 10, fn });
  },
  async emit<C>(event: string, ctx: C) {
    const list = actions.get(event); if (!list) return;
    for (const e of list) {
      if (!(await isModuleActive(e.module))) continue;
      try { await e.fn(ctx); }
      catch (err) { console.error(`[hook ${event}] ${e.module}`, err); }
    }
  },
  addFilter(name: string, fn: Filter<any>, opts: { module: string; priority?: number }) {
    insert(filters, name, { module: opts.module, priority: opts.priority ?? 10, fn });
  },
  async applyFilters<V, C>(name: string, value: V, ctx: C): Promise<V> {
    const list = filters.get(name); if (!list) return value;
    let v = value;
    for (const e of list) {
      if (!(await isModuleActive(e.module))) continue;
      v = await e.fn(v, ctx);
    }
    return v;
  },
};
```

`isModuleActive(slug)` reads a request-scoped, memoized snapshot of the `modules` table so a toggle in the admin panel takes effect on the next request without redeploying.

### Core emission points (examples already in this project)

| Event                        | When                                    | Payload                          |
| ---------------------------- | --------------------------------------- | -------------------------------- |
| `ad.before_publish`          | in `publishAd` server fn                | `{ userId, adId, cities[] }`     |
| `ad.after_publish`           | after row insert                        | `{ ad }`                         |
| `credits.topup.confirmed`    | NowPayments IPN webhook, after credit   | `{ userId, invoiceId, cents }`   |
| `moderation.review`          | admin approves/rejects                  | `{ adId, decision, reviewerId }` |
| `user.registered`            | `handle_new_user` companion server fn   | `{ userId, email }`              |

### Core filter points

| Filter                    | Purpose                                            |
| ------------------------- | -------------------------------------------------- |
| `ad.price_cents`          | Modules can adjust per-city posting price          |
| `ad.search_query`         | Rewrite the tsvector query before it hits Postgres |
| `nav.header_links`        | Inject/remove header nav items                     |
| `dashboard.widgets`       | Add cards to `/admin`                              |
| `invoice.line_items`      | Add discount / tax lines                           |

---

## 3. Database Schema

```sql
-- Registry of every installable module shipped in the bundle.
CREATE TABLE public.modules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT NOT NULL UNIQUE,           -- 'promotions', 'blog', 'adult-section'
  kind            TEXT NOT NULL CHECK (kind IN ('plugin','theme')),
  name            TEXT NOT NULL,
  description     TEXT,
  version         TEXT NOT NULL,                  -- semver of the shipped code
  min_core_version TEXT NOT NULL DEFAULT '0.0.0', -- gate against core upgrades
  entry_path      TEXT NOT NULL,                  -- 'src/modules/promotions/index.ts'
  is_active       BOOLEAN NOT NULL DEFAULT false,
  activated_at    TIMESTAMPTZ,
  activated_by    UUID REFERENCES auth.users(id),
  config          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.modules TO authenticated;
GRANT ALL    ON public.modules TO service_role;
ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read modules (any signed-in user)"
  ON public.modules FOR SELECT TO authenticated USING (true);

CREATE POLICY "admins manage modules"
  ON public.modules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Version history (rollback + audit)
CREATE TABLE public.module_versions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id     UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  version       TEXT NOT NULL,
  changelog     TEXT,
  released_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (module_id, version)
);

-- Which core hooks/filters/endpoints a module claims to touch.
-- Populated at build time from each module's manifest; used by admin UI
-- to show "what does activating this actually change?".
CREATE TABLE public.module_bindings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id    UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  binding_type TEXT NOT NULL CHECK (binding_type IN ('action','filter','route_override','slot')),
  target       TEXT NOT NULL,   -- e.g. 'ad.after_publish' or '/api/public/health'
  priority     INT NOT NULL DEFAULT 10
);
```

Activation is idempotent and audited via the existing `audit_log` table (`action='module_activate'`).

---

## 4. Secure Directory Structure

```
src/
├── core/                       # NEVER modified by modules
│   ├── ads/                    # ads engine
│   ├── credits/
│   └── moderation/
├── lib/
│   └── hooks/
│       ├── registry.ts         # the bus (above)
│       └── slots.tsx           # <Slot name="header.right" /> React component
├── modules/                    # first-party + vetted plugins (in-repo only)
│   ├── promotions/
│   │   ├── manifest.ts         # { slug, version, bindings, minCore }
│   │   ├── index.ts            # registers hooks; NO top-level side effects
│   │   ├── server/             # server-only handlers (name ends .server.ts)
│   │   ├── ui/                 # React components mounted into slots
│   │   └── migrations/         # SQL migrations shipped with the module
│   └── blog/
│       └── …
├── themes/                     # visual layer only — no server code allowed
│   ├── default/
│   │   ├── manifest.ts
│   │   ├── tokens.css          # CSS variables (colors, radius, fonts)
│   │   └── components/         # optional overrides for Slot components
│   └── dark-classified/
└── routes/
    ├── api/                    # core endpoints
    │   └── public/             # /api/public/* — auth-bypassed, verify per handler
    └── _authenticated/
        └── admin.modules.tsx   # activate / deactivate UI
```

### Enforcement rules (checked in CI, not at runtime)

1. **No cross-module imports.** ESLint rule: `src/modules/<a>/**` may not import from `src/modules/<b>/**`. Communication is hook-only.
2. **No module writes to `core/`.** ESLint rule: `src/modules/**` cannot import from `src/core/**` except through the public `src/core/index.ts` barrel.
3. **Themes are presentation-only.** ESLint rule: `src/themes/**` cannot import `@tanstack/react-start` server APIs, `supabase/client.server`, or anything under `src/modules/*/server/`.
4. **Server code isolation.** File-name protection (already active in this project) blocks `*.server.ts` and `src/server/**` from the client bundle. Modules must follow the same pattern.
5. **Bundle is sealed.** No dynamic `import()` of paths derived from DB rows. The registry loads all modules statically; the DB only flips `is_active`.

---

## 5. Module Manifest & Registration

```ts
// src/modules/promotions/manifest.ts
export const manifest = {
  slug: 'promotions',
  kind: 'plugin' as const,
  version: '1.2.0',
  minCore: '1.0.0',
  bindings: [
    { type: 'filter', target: 'ad.price_cents',    priority: 20 },
    { type: 'action', target: 'ad.after_publish',  priority: 10 },
    { type: 'slot',   target: 'dashboard.widgets' },
  ],
};

// src/modules/promotions/index.ts
import { hooks } from '@/lib/hooks/registry';
import { manifest } from './manifest';

export function register() {
  hooks.addFilter('ad.price_cents', (cents, { tier }) => {
    return tier === 'featured' ? cents + 500 : cents;
  }, { module: manifest.slug, priority: 20 });

  hooks.on('ad.after_publish', async ({ ad }) => {
    // e.g. schedule a bump job
  }, { module: manifest.slug });
}
```

```ts
// src/lib/hooks/bootstrap.ts — imported once from the app entry
import { register as promotions } from '@/modules/promotions';
import { register as blog }       from '@/modules/blog';

// Static, deterministic — the bundler sees every module.
// Activation state is checked per-invocation inside the bus.
promotions();
blog();
```

---

## 6. View Injection (Slots)

```tsx
// src/lib/hooks/slots.tsx
export function Slot({ name, ctx }: { name: string; ctx?: unknown }) {
  const nodes = useSlot(name, ctx); // reads from a React registry populated by modules
  return <>{nodes}</>;
}

// Core layout
<header>
  <Logo />
  <Nav />
  <Slot name="header.right" />
</header>
```

A module contributes UI by calling `registerSlot('header.right', <PromoBadge />, { module: 'promotions' })` in its `register()`. The `<Slot>` component filters by `isModuleActive` on render.

---

## 7. Endpoint Override

Core endpoints stay under `src/routes/api/**` and remain the source of truth. Modules extend behavior via filter hooks called **inside** the core handler:

```ts
// src/routes/api/public/health.ts (core)
export const Route = createFileRoute('/api/public/health')({
  server: { handlers: { GET: async () => {
    const payload = await hooks.applyFilters('health.payload', { ok: true }, {});
    return Response.json(payload);
  }}}
});
```

Full endpoint replacement is deliberately **not** supported — it would let a module silently break auth or billing. If a module needs a new endpoint, it ships its own file under `src/routes/api/modules/<slug>/…` and the admin toggle simply gates the handler body with `if (!(await isModuleActive('<slug>'))) return new Response('Not Found', { status: 404 });`.

---

## 8. Security Posture (summary)

- **No arbitrary code upload.** Modules are code-reviewed in-repo; the admin panel only flips activation flags. This eliminates the WordPress plugin-supply-chain attack surface.
- **All privileged server fns** stay behind `requireSupabaseAuth` + `has_role('admin')` checks. Modules cannot bypass this — they call the same middleware.
- **RLS is unchanged** by modules. New tables shipped in a module's `migrations/` must include GRANTs + RLS following the project's standard four-step pattern.
- **Rate limiting** on hook-driven side effects uses the existing `consume_rate_limit` SQL function.
- **Audit trail** — every activation, deactivation, and admin action lands in `audit_log`.

---

## 9. What's next

If you want, I can now:
1. Land migration for `modules` / `module_versions` / `module_bindings`.
2. Implement `src/lib/hooks/registry.ts` + `Slot` + a `bootstrap.ts`.
3. Wire the admin `/admin/modules` page (activate / deactivate, with audit).
4. Refactor one existing feature (e.g. `promotions`) into `src/modules/promotions/` as the reference implementation.

Say the word and I'll ship them in that order.