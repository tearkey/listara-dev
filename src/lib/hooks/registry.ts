// WordPress-style hook bus + module manifest registry.
// Client-safe: no server imports here. Activation state is passed in by the
// caller (server code reads it from the modules table, client code from the
// listActiveModules server fn) so the same bus works in both bundles.
//
// See docs/architecture/plugin-system.md for the full design.

export type ModuleNavLink = { to: string; label: string };

export type ModuleManifest = {
  slug: string;
  kind: "plugin" | "theme";
  name: string;
  version: string;
  /** Links injected into the public site header when the module is active. */
  navLinks?: ModuleNavLink[];
  /** Entries appended to the admin sidebar when the module is active. */
  adminNav?: ModuleNavLink[];
};

type Handler<C = unknown> = (ctx: C) => void | Promise<void>;
type Filter<V = unknown, C = unknown> = (value: V, ctx: C) => V | Promise<V>;

interface Entry {
  module: string;
  priority: number;
  fn: (...args: any[]) => any;
}

const actions = new Map<string, Entry[]>();
const filters = new Map<string, Entry[]>();
const manifests = new Map<string, ModuleManifest>();

function insert(map: Map<string, Entry[]>, key: string, e: Entry) {
  const list = map.get(key) ?? [];
  list.push(e);
  list.sort((a, b) => a.priority - b.priority); // lower runs earlier, WP-style
  map.set(key, list);
}

export const hooks = {
  on<C>(event: string, fn: Handler<C>, opts: { module: string; priority?: number }) {
    insert(actions, event, { module: opts.module, priority: opts.priority ?? 10, fn });
  },
  /** Run every active module's handlers for an event. Handler errors are logged, not fatal. */
  async emit<C>(event: string, ctx: C, activeSlugs: ReadonlySet<string>) {
    const list = actions.get(event);
    if (!list) return;
    for (const e of list) {
      if (!activeSlugs.has(e.module)) continue;
      try {
        await e.fn(ctx);
      } catch (err) {
        console.error(`[hook ${event}] ${e.module}`, err);
      }
    }
  },
  addFilter<V, C>(name: string, fn: Filter<V, C>, opts: { module: string; priority?: number }) {
    insert(filters, name, { module: opts.module, priority: opts.priority ?? 10, fn });
  },
  /** Pipe a value through every active module's filters. Filter errors are fatal by design. */
  async applyFilters<V, C>(name: string, value: V, ctx: C, activeSlugs: ReadonlySet<string>): Promise<V> {
    const list = filters.get(name);
    if (!list) return value;
    let v = value;
    for (const e of list) {
      if (!activeSlugs.has(e.module)) continue;
      v = await e.fn(v, ctx);
    }
    return v;
  },
};

export function registerModule(manifest: ModuleManifest) {
  manifests.set(manifest.slug, manifest);
}

export function getRegisteredModules(): ModuleManifest[] {
  return [...manifests.values()];
}

export function getModuleNavLinks(activeSlugs: ReadonlySet<string>): ModuleNavLink[] {
  return getRegisteredModules()
    .filter((m) => activeSlugs.has(m.slug))
    .flatMap((m) => m.navLinks ?? []);
}

export function getModuleAdminNav(activeSlugs: ReadonlySet<string>): ModuleNavLink[] {
  return getRegisteredModules()
    .filter((m) => activeSlugs.has(m.slug))
    .flatMap((m) => m.adminNav ?? []);
}
