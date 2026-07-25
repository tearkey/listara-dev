import { useMemo, useState, useEffect } from "react";
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { MessageCircle, ChevronLeft, ChevronRight, Search, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { messageThreadsQueryOpts, useGetOrCreateThread } from "@/lib/messages.hooks";
import { formatDistanceToNow } from "date-fns";

const searchSchema = z.object({
  page: z.number().int().default(1),
  q: z.string().default(""),
});

type SearchState = z.infer<typeof searchSchema>;

export const Route = createFileRoute("/_authenticated/messages")({
  validateSearch: zodValidator(searchSchema),
  loaderDeps: ({ search }) => search,
  head: () => ({
    meta: [
      { title: "Messages" },
    ],
  }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(messageThreadsQueryOpts(deps.page, 20)),
  component: MessagesInboxPage,
});

function MessagesInboxPage() {
  const search = useSearch({ from: Route.id });
  const navigate = Route.useNavigate();
  const [query, setQuery] = useState(search.q);
  const qc = useQueryClient();
  
  const { data: threadsPage } = useSuspenseQuery(messageThreadsQueryOpts(search.page, 20));
  const { threads = [], total = 0 } = threadsPage || {};
  
  const pageCount = Math.max(1, Math.ceil(total / 20));
  const currentPage = Math.min(search.page || 1, pageCount);

  // Realtime subscription for new messages
  useEffect(() => {
    // Subscribe to new messages to refresh thread list
    const subscription = supabase
      .channel("messages_all_threads")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        () => {
          // Invalidate thread list and unread count on new message
          qc.invalidateQueries({ queryKey: ["messages", "threads"] });
          qc.invalidateQueries({ queryKey: ["messages", "unread-count"] });
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [qc]);

  // Filter threads by search query
  const filteredThreads = useMemo(() => {
    if (!query) return threads;
    const q = query.toLowerCase();
    return threads.filter(
      (t: any) =>
        t.ads?.title?.toLowerCase().includes(q) ||
        (t.profiles?.display_name || "").toLowerCase().includes(q)
    );
  }, [threads, query]);

  const from = total === 0 ? 0 : (currentPage - 1) * 20 + 1;
  const to = Math.min(currentPage * 20, total);

  function setSearch(patch: Partial<SearchState>) {
    navigate({
      to: ".",
      search: (prev: SearchState) => ({ ...prev, ...patch, page: 1 }),
    });
  }

  return (
    <section className="space-y-5">
      <header>
        <h1 className="flex items-center gap-2 font-display text-xl font-bold">
          <MessageCircle className="h-5 w-5 text-brand" /> Messages
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Communicate with buyers and sellers. All conversations are private and secure.
        </p>
      </header>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearch({ q: e.target.value });
            }}
            placeholder="Search by item or person…"
            className="pl-9"
          />
        </div>
      </div>

      <div className="space-y-3">
        {filteredThreads.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <MessageCircle className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {threads.length === 0 ? "No conversations yet. Start by messaging a seller!" : "No results for your search."}
            </p>
          </div>
        ) : (
          <ul className="space-y-2 rounded-lg border border-border bg-card divide-y divide-border">
            {filteredThreads.map((thread: any) => {
              const otherUser = thread.seller_id === (thread.buyerId || "") ? thread.profiles : thread.profiles;
              const unreadCount = thread.messages?.filter((m: any) => !m.read_at).length || 0;

              return (
                <li
                  key={thread.id}
                  onClick={() => navigate({ to: `/messages/${thread.id}` })}
                  className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-muted/50 transition"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className={`text-sm font-medium truncate ${unreadCount > 0 ? "text-foreground font-semibold" : "text-foreground"}`}>
                          {thread.ads?.title || "Unknown Item"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {otherUser?.[0]?.display_name || "Unknown User"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground whitespace-nowrap">
                          {thread.last_message_at ? formatDistanceToNow(new Date(thread.last_message_at), { addSuffix: true }) : "No messages"}
                        </p>
                        {unreadCount > 0 && (
                          <div className="mt-1 inline-flex items-center rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand">
                            {unreadCount}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            {from}–{to} of {total}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              disabled={currentPage <= 1}
              onClick={() => setSearch({ page: Math.max(1, currentPage - 1) })}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[40px] text-center text-xs text-muted-foreground">
              {currentPage} / {pageCount}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              disabled={currentPage >= pageCount}
              onClick={() => setSearch({ page: Math.min(pageCount, currentPage + 1) })}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
