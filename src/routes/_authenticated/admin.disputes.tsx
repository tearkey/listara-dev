import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { toast } from "sonner";
import { AlertCircle, ChevronLeft, ChevronRight, CheckCircle, XCircle, Shield, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow, formatDate } from "date-fns";
import {
  listAdminDisputes,
  getDisputeDetail,
  resolveDisputeAdmin,
  exportDisputesCsv,
} from "@/lib/disputes.functions";

const searchSchema = z.object({
  page: fallback(z.number().int(), 1).default(1),
  status: fallback(z.enum(["all", "pending", "reviewing", "resolved"]), "pending").default("pending"),
});

type SearchState = z.infer<typeof searchSchema>;

export const Route = createFileRoute("/_authenticated/admin.disputes")({
  validateSearch: zodValidator(searchSchema),
  loaderDeps: ({ search }) => search,
  head: () => ({
    meta: [
      { title: "Dispute Management — Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminDisputesPage,
});

function AdminDisputesPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [selectedDispute, setSelectedDispute] = useState<string | null>(null);
  const [resolution, setResolution] = useState("approved");
  const [notes, setNotes] = useState("");

  const qc = useQueryClient();
  const getDisputes = useServerFn(listAdminDisputes);
  const getDetail = useServerFn(getDisputeDetail);
  const resolveDispute = useServerFn(resolveDisputeAdmin);
  const exportCsv = useServerFn(exportDisputesCsv);

  const { data: page } = useQuery({
    queryKey: ["admin", "disputes", search.status, search.page],
    queryFn: () => getDisputes({ data: { status: search.status, page: search.page } }),
  });

  const { data: detail } = useQuery({
    queryKey: ["admin", "dispute", selectedDispute],
    queryFn: () => getDetail(selectedDispute!),
    enabled: !!selectedDispute,
  });

  const resolveMutation = useMutation({
    mutationFn: ({ disputeId, decision, notes }: any) =>
      resolveDispute({ data: { disputeId, decision, notes } }),
    onSuccess: () => {
      toast.success("Dispute resolved");
      setSelectedDispute(null);
      setResolution("approved");
      setNotes("");
      qc.invalidateQueries({ queryKey: ["admin", "disputes"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to resolve dispute");
    },
  });

  const { disputes = [], total = 0, pageSize = 20 } = page || {};
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(search.page || 1, pageCount);

  function setSearch(patch: Partial<SearchState>) {
    navigate({
      to: ".",
      search: (prev: SearchState) => ({ ...prev, ...patch, page: patch.page ?? 1 }),
    });
  }

  async function downloadCsv() {
    try {
      const { csv, filename } = await exportCsv({ data: { status: search.status } });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e.message || "Export failed");
    }
  }

  const statusColors: Record<string, string> = {
    pending: "bg-yellow/10 text-yellow",
    reviewing: "bg-blue/10 text-blue",
    approved: "bg-green/10 text-green",
    denied: "bg-red/10 text-red",
    resolved: "bg-gray/10 text-gray",
  };

  return (
    <section className="space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-xl font-bold">
            <Shield className="h-5 w-5 text-brand" /> Dispute Management
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review and resolve escrow disputes. Decisions auto-update transaction status.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={downloadCsv}>
          <Download className="mr-1 h-3.5 w-3.5" /> Export CSV
        </Button>
      </header>

      <div className="flex flex-wrap gap-2">
        {(["all", "pending", "reviewing", "resolved"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSearch({ status: s })}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              search.status === s
                ? "border-brand bg-brand/10 text-brand"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Disputes Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Case ID</th>
                <th className="px-4 py-3 text-left font-semibold">Participants</th>
                <th className="px-4 py-3 text-right font-semibold">Amount</th>
                <th className="px-4 py-3 text-left font-semibold">Reason</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-left font-semibold">Created</th>
                <th className="px-4 py-3 text-center font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {disputes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No disputes match the selected filter.
                  </td>
                </tr>
              ) : (
                disputes.map((dispute: any) => (
                  <tr key={dispute.id} className="hover:bg-muted/50 transition">
                    <td className="px-4 py-3 font-mono text-xs">
                      {dispute.id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs">
                        <p className="font-medium">{dispute.profiles?.[0]?.display_name || "Buyer"}</p>
                        <p className="text-muted-foreground">vs {dispute.profiles?.[1]?.display_name || "Seller"}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      ${(dispute.escrow_transactions?.[0]?.amount_cents / 100).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {dispute.reason}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={statusColors[dispute.status] || ""}>
                        {dispute.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(dispute.created_at), { addSuffix: true })}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="outline" onClick={() => setSelectedDispute(dispute.id)}>
                            Review
                          </Button>
                        </DialogTrigger>
                        {detail && (
                          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>Dispute Resolution</DialogTitle>
                              <DialogDescription>
                                Review the conversation and make a decision.
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4">
                              {/* Message Thread */}
                              <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3 max-h-64 overflow-y-auto">
                                <p className="text-xs font-semibold text-muted-foreground mb-2">CONVERSATION</p>
                                {detail.messages?.map((msg: any, i: number) => (
                                  <div key={i} className="text-xs">
                                    <span className="font-medium">{msg.profiles?.display_name}:</span>
                                    <p className="text-muted-foreground mt-0.5">{msg.body}</p>
                                    <p className="text-[10px] text-muted-foreground/50 mt-1">
                                      {formatDate(new Date(msg.created_at), "PPpp")}
                                    </p>
                                  </div>
                                ))}
                              </div>

                              {/* Bot Analysis */}
                              {detail.dispute?.analysis && (
                                <div className="rounded-lg border border-border bg-blue/5 p-3">
                                  <p className="text-xs font-semibold mb-2">BOT ANALYSIS</p>
                                  <p className="text-xs text-muted-foreground">
                                    {detail.dispute.analysis.summary}
                                  </p>
                                </div>
                              )}

                              {/* Resolution */}
                              <div className="space-y-3 border-t border-border pt-4">
                                <div>
                                  <label className="text-sm font-medium">Decision</label>
                                  <Select value={resolution} onValueChange={setResolution}>
                                    <SelectTrigger className="mt-1.5">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="approved">Approved (Release to seller)</SelectItem>
                                      <SelectItem value="denied">Denied (Keep escrowed)</SelectItem>
                                      <SelectItem value="refund">Refund (Full refund to buyer)</SelectItem>
                                      <SelectItem value="partial_refund">Partial Refund</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <label className="text-sm font-medium">Resolution Notes</label>
                                  <Textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Document your reasoning for this decision..."
                                    className="mt-1.5 text-xs"
                                    rows={3}
                                  />
                                </div>
                                <div className="flex gap-2 justify-end pt-4">
                                  <Button
                                    variant="outline"
                                    onClick={() => setSelectedDispute(null)}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    onClick={() => {
                                      resolveMutation.mutate({
                                        disputeId: selectedDispute,
                                        decision: resolution,
                                        notes,
                                      });
                                    }}
                                    disabled={resolveMutation.isPending || !notes}
                                  >
                                    {resolveMutation.isPending ? "Resolving..." : "Submit Resolution"}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </DialogContent>
                        )}
                      </Dialog>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, total)} of {total}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              disabled={currentPage <= 1}
              onClick={() => setSearch({ page: currentPage - 1 })}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[40px] text-center text-xs">
              {currentPage} / {pageCount}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              disabled={currentPage >= pageCount}
              onClick={() => setSearch({ page: currentPage + 1 })}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
