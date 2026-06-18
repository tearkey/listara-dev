import { Link } from "@tanstack/react-router";
import { BRAND } from "@/lib/brand";

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-border bg-secondary/40">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-brand-foreground font-display font-bold text-lg">L</span>
            <span className="font-display text-xl font-bold">{BRAND.name}</span>
          </div>
          <p className="mt-3 max-w-sm text-sm text-muted-foreground">{BRAND.tagline}</p>
        </div>
        <div>
          <h4 className="font-display text-sm font-semibold">Browse</h4>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li><Link to="/" className="hover:text-foreground">All cities</Link></li>
            <li><Link to="/post" className="hover:text-foreground">Post an ad</Link></li>
            <li><Link to="/search" search={{ q: "" }} className="hover:text-foreground">Search</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="font-display text-sm font-semibold">Trust & Safety</h4>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li><Link to="/safety" className="hover:text-foreground">Safety tips</Link></li>
            <li><Link to="/terms" className="hover:text-foreground">Terms</Link></li>
            <li><Link to="/privacy" className="hover:text-foreground">Privacy</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border/60 py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} {BRAND.name}. Built with care for local communities.
      </div>
    </footer>
  );
}