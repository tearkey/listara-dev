import { createFileRoute, Link } from "@tanstack/react-router";
import { Globe2 } from "lucide-react";
import { BRAND } from "@/lib/brand";

export const Route = createFileRoute("/not-available")({
  head: () => ({
    meta: [
      { title: `Not available in your region — ${BRAND.name}` },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NotAvailablePage,
});

function NotAvailablePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/40 px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/10 text-brand">
          <Globe2 className="h-8 w-8" />
        </div>
        <h1 className="mt-6 font-display text-3xl font-bold">
          {BRAND.name} isn't available in your region yet
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          We're currently serving cities inside the United States. We'll roll out to more
          countries soon — thanks for your patience.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="text-sm font-semibold text-brand hover:underline"
          >
            Go back home
          </Link>
        </div>
      </div>
    </div>
  );
}
