import { useEffect, useRef } from "react";
import { useActiveModules } from "@/lib/hooks/use-active-modules";

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
  }
}

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SCRIPT_SRC;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Failed to load Turnstile"));
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

/**
 * Cloudflare Turnstile challenge. Renders nothing (and reports no token)
 * unless the turnstile plugin is active AND VITE_TURNSTILE_SITE_KEY is set,
 * so the site keeps working with the plugin off or unconfigured.
 */
export function TurnstileWidget({ onToken }: { onToken: (token: string | null) => void }) {
  const active = useActiveModules().has("turnstile");
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active || !siteKey || !ref.current) return;
    let widgetId: string | null = null;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return;
        widgetId = window.turnstile.render(ref.current, {
          sitekey: siteKey,
          callback: (token: string) => onToken(token),
          "expired-callback": () => onToken(null),
          "error-callback": () => onToken(null),
        });
      })
      .catch(() => onToken(null));
    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, siteKey]);

  if (!active || !siteKey) return null;
  return <div ref={ref} className="my-2" />;
}
