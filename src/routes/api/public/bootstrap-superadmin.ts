import { createFileRoute } from "@tanstack/react-router";
import { bootstrapSuperadmin } from "@/lib/dashboard.functions";

// Public, self-locking bootstrap endpoint. Becomes a no-op once a superadmin exists.
export const Route = createFileRoute("/api/public/bootstrap-superadmin")({
  server: {
    handlers: {
      GET: async () => {
        const result = await bootstrapSuperadmin();
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
      POST: async () => {
        const result = await bootstrapSuperadmin();
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});