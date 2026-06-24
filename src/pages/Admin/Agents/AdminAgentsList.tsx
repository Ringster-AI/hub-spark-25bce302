import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Search, MoreHorizontal, Power, Trash2, Eye, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type AdminAgentRow = {
  id: string;
  name: string;
  status: string;
  agent_type: string;
  phone_number: string | null;
  vapi_assistant_id: string | null;
  twilio_sid: string | null;
  user_id: string;
  minutes_used: number | null;
  total_minutes_used: number | null;
  created_at: string | null;
  updated_at: string | null;
  owner_email?: string | null;
  owner_name?: string | null;
};

export const AdminAgentsList = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [pendingDelete, setPendingDelete] = useState<AdminAgentRow | null>(null);

  const { data: agents, isLoading } = useQuery({
    queryKey: ["admin-agents"],
    queryFn: async (): Promise<AdminAgentRow[]> => {
      const { data: agentRows, error } = await supabase
        .from("agent_configs")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const userIds = Array.from(new Set((agentRows || []).map((a) => a.user_id).filter(Boolean)));
      let profilesById: Record<string, { email?: string | null; full_name?: string | null }> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, email, full_name")
          .in("id", userIds);
        profilesById = Object.fromEntries(
          (profiles || []).map((p) => [p.id, { email: p.email, full_name: p.full_name }])
        );
      }

      return (agentRows || []).map((a: any) => ({
        ...a,
        owner_email: profilesById[a.user_id]?.email ?? null,
        owner_name: profilesById[a.user_id]?.full_name ?? null,
      }));
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (agent: AdminAgentRow) => {
      const next = agent.status === "active" ? "inactive" : "active";
      const { error } = await supabase
        .from("agent_configs")
        .update({ status: next })
        .eq("id", agent.id);
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => {
      toast({ title: "Status updated", description: `Agent is now ${next}.` });
      queryClient.invalidateQueries({ queryKey: ["admin-agents"] });
    },
    onError: (e: any) =>
      toast({ title: "Failed to update", description: e.message, variant: "destructive" }),
  });

  const [deleteStatus, setDeleteStatus] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async (agent: AdminAgentRow) => {
      const progressToast = toast({
        title: `Deleting ${agent.name}…`,
        description: "Cleaning up Vapi assistant and tools.",
      });
      setDeleteStatus("Cleaning up Vapi assistant and tools…");

      // Best-effort: tell the Netlify function to delete the Vapi assistant
      // and its tools before we drop the DB row. Failure here is logged but
      // doesn't block the delete — the orphan sweep can clean up later.
      let vapiWarning: string | null = null;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const { getNetlifyFunctionsUrl } = await import("@/utils/netlifyFunctions");
          const res = await fetch(getNetlifyFunctionsUrl("manage-vapi-assistant"), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ agentId: agent.id, action: "delete" }),
          });
          if (!res.ok) {
            vapiWarning = `Vapi cleanup returned ${res.status}; orphan sweep will retry.`;
            console.warn(vapiWarning);
          }
        }
      } catch (err: any) {
        vapiWarning = `Vapi cleanup failed: ${err?.message ?? "unknown error"}. Orphan sweep will retry.`;
        console.warn(vapiWarning, err);
      }

      progressToast.update({
        id: progressToast.id,
        title: `Deleting ${agent.name}…`,
        description: "Removing database records and cascading dependencies.",
      });
      setDeleteStatus("Removing database records…");

      const { error } = await supabase.from("agent_configs").delete().eq("id", agent.id);
      if (error) throw error;

      progressToast.dismiss();
      return { vapiWarning };
    },
    onSuccess: (result, agent) => {
      setDeleteStatus(null);
      if (result.vapiWarning) {
        toast({
          title: `Agent "${agent.name}" deleted`,
          description: result.vapiWarning,
        });
      } else {
        toast({
          title: `Agent "${agent.name}" deleted`,
          description: "Vapi, Twilio links, and all dependent records cleaned up.",
        });
      }
      setPendingDelete(null);
      queryClient.invalidateQueries({ queryKey: ["admin-agents"] });
    },
    onError: (e: any, agent) => {
      setDeleteStatus(null);
      toast({
        title: `Failed to delete "${agent.name}"`,
        description: e?.message ?? "Unknown error",
        variant: "destructive",
      });
    },
  });

  const filtered = useMemo(() => {
    if (!agents) return [];
    const q = search.trim().toLowerCase();
    return agents.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (typeFilter !== "all" && a.agent_type !== typeFilter) return false;
      if (!q) return true;
      return (
        a.name?.toLowerCase().includes(q) ||
        a.owner_email?.toLowerCase().includes(q) ||
        a.owner_name?.toLowerCase().includes(q) ||
        a.phone_number?.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q)
      );
    });
  }, [agents, search, statusFilter, typeFilter]);

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-2xl font-semibold">All Agents</h1>
        <p className="text-sm text-muted-foreground">
          Manage every agent across all users, including their Vapi and Twilio resources.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-3 md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, owner, phone, ID…"
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="inbound">Inbound</SelectItem>
            <SelectItem value="outbound">Outbound</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Agent</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Vapi</TableHead>
              <TableHead>Twilio</TableHead>
              <TableHead className="text-right">Minutes</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                  Loading agents…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                  No agents match your filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <Link
                      to={`/admin/agents/${a.id}`}
                      className="font-medium hover:underline"
                    >
                      {a.name}
                    </Link>
                    <div className="text-xs text-muted-foreground font-mono">{a.id.slice(0, 8)}…</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{a.owner_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{a.owner_email || a.user_id.slice(0, 8)}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">{a.agent_type}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={a.status === "active" ? "default" : "secondary"} className="capitalize">
                      {a.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{a.phone_number || "—"}</TableCell>
                  <TableCell>
                    {a.vapi_assistant_id ? (
                      <Badge variant="outline" className="text-xs">linked</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {a.twilio_sid ? (
                      <Badge variant="outline" className="text-xs">linked</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {a.total_minutes_used ?? 0}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link to={`/admin/agents/${a.id}`}>
                            <Eye className="h-4 w-4 mr-2" /> View / edit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleMutation.mutate(a)}>
                          <Power className="h-4 w-4 mr-2" />
                          {a.status === "active" ? "Deactivate" : "Activate"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setPendingDelete(a)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(o) => {
          if (!o && !deleteMutation.isPending) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this agent?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes <strong>{pendingDelete?.name}</strong> for{" "}
              <strong>{pendingDelete?.owner_email || "its owner"}</strong>. Vapi and Twilio resources
              must be cleaned up separately. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteMutation.isPending && deleteStatus && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground border rounded-md p-3 bg-muted/40">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{deleteStatus}</span>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (pendingDelete) deleteMutation.mutate(pendingDelete);
              }}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete agent"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminAgentsList;
