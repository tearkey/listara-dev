import { useQuery } from "@tanstack/react-query";
import { listActiveModules } from "@/lib/modules.functions";

const EMPTY: ReadonlySet<string> = new Set();

/** Active plugin slugs, cached for a minute. Empty set while loading/on error. */
export function useActiveModules(): ReadonlySet<string> {
  const { data } = useQuery({
    queryKey: ["modules", "active"],
    queryFn: () => listActiveModules(),
    staleTime: 60_000,
  });
  return data ? new Set(data) : EMPTY;
}
