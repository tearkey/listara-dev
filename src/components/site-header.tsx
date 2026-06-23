import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, Plus, Search, User } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function SiteHeader() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/auth", replace: true });
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4">
        <Link to="/" className="flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground font-display font-bold text-lg shadow-sm ring-2 ring-brand/40">
            L
          </span>
          <span className="font-display text-xl font-bold tracking-tight">{BRAND.name}</span>
        </Link>

        <div className="hidden md:flex flex-1 max-w-md items-center gap-2 rounded-full border border-border bg-secondary/50 px-4 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search listings…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const q = (e.target as HTMLInputElement).value.trim();
                if (q) navigate({ to: "/search", search: { q } });
              }
            }}
          />
        </div>

        <nav className="flex items-center gap-2">
          <Button asChild size="sm" className="hidden sm:inline-flex bg-brand text-brand-foreground hover:bg-brand/90">
            <Link to="/post">
              <Plus className="h-4 w-4" /> Post Ad
            </Link>
          </Button>
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full">
                  <User className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5 text-xs text-muted-foreground truncate">{user.email}</div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/my-ads">My ads</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/post">Post a new ad</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="h-4 w-4 mr-2" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button asChild variant="ghost" size="sm">
              <Link to="/auth">Sign in</Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}