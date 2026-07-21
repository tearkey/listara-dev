import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "age-gate-confirmed";

// Full-screen 18+ interstitial for adult categories. Confirmation is
// remembered per browser; declining routes back to the homepage.
export function AgeGate({ children }: { children: ReactNode }) {
  // Start unconfirmed on both server and client so SSR and first client
  // render agree; the stored confirmation applies right after hydration.
  const [confirmed, setConfirmed] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setConfirmed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      setConfirmed(false);
    }
  }, []);

  if (confirmed) return <>{children}</>;

  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <ShieldAlert className="mx-auto h-12 w-12 text-brand" />
      <h1 className="mt-4 font-display text-2xl font-bold">Adults only (18+)</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This section contains personals listings intended for adults. By continuing you confirm
        that you are at least 18 years old and agree to the site rules.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Button asChild variant="outline">
          <Link to="/">Take me back</Link>
        </Button>
        <Button
          className="bg-brand text-brand-foreground hover:bg-brand/90"
          disabled={confirmed === null}
          onClick={() => {
            try {
              localStorage.setItem(STORAGE_KEY, "1");
            } catch {
              /* private mode — session-only confirmation still works */
            }
            setConfirmed(true);
          }}
        >
          I am 18 or older — enter
        </Button>
      </div>
    </div>
  );
}
