import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Lock, Mail, Plus, Smartphone, Trash2, UserPlus, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTeamAccess } from "@/hooks/useTeamAccess";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

type Role = "admin" | "listener" | "transfer_only" | "viewer";

interface TeamMember {
  id: string;
  email: string;
  role: Role;
  status: "pending" | "active" | "revoked";
  can_listen: boolean;
  can_transfer: boolean;
  receives_notifications: boolean;
  invited_at: string;
  accepted_at: string | null;
  member_user_id: string | null;
}

interface PushDevice {
  id: string;
  user_id: string;
  platform: string;
  app_version: string | null;
  last_seen_at: string;
}

const Team = () => {
  const qc = useQueryClient();
  const { seatsLimit, seatsUsed, devicesLimit, canInvite, isLocked, planName, isLoading } = useTeamAccess();
  const [inviteOpen, setInviteOpen] = useState(false);

  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ["team-members"],
    enabled: !isLocked,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase
        .from("team_members" as any)
        .select("*")
        .eq("owner_user_id", user.id)
        .neq("status", "revoked")
        .order("invited_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as TeamMember[];
    },
  });

  const { data: devices = [] } = useQuery({
    queryKey: ["team-push-devices"],
    enabled: !isLocked,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const memberUserIds = members.map(m => m.member_user_id).filter(Boolean) as string[];
      const userIds = [user.id, ...memberUserIds];
      const { data, error } = await supabase
        .from("push_devices" as any)
        .select("id, user_id, platform, app_version, last_seen_at")
        .in("user_id", userIds);
      if (error) throw error;
      return (data ?? []) as unknown as PushDevice[];
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("team_members" as any)
        .update({ status: "revoked", revoked_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Team member revoked");
      qc.invalidateQueries({ queryKey: ["team-members"] });
      qc.invalidateQueries({ queryKey: ["team-members-count"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to revoke"),
  });

  const updateCapability = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<TeamMember> }) => {
      const { error } = await supabase
        .from("team_members" as any)
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team-members"] }),
    onError: (e: any) => toast.error(e.message ?? "Update failed"),
  });

  if (isLoading) {
    return (
      <div className="p-4 md:p-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded mb-6" />
        <div className="h-64 bg-muted/50 animate-pulse rounded-lg" />
      </div>
    );
  }

  // Free plan upgrade gate
  if (isLocked) {
    return (
      <div className="p-4 md:p-6">
        <div className="max-w-2xl mx-auto text-center py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-6">
            <Lock className="w-8 h-8 text-muted-foreground" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold mb-3">Team management is a paid feature</h1>
          <p className="text-muted-foreground mb-8">
            Your <span className="font-medium text-foreground">{planName}</span> plan doesn't include
            team seats. Upgrade to invite teammates, share live call notifications, and let your team
            listen in or transfer calls from the Ringster mobile app.
          </p>
          <Button asChild size="lg">
            <Link to="/dashboard/subscription">Upgrade to invite teammates</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Users className="w-7 h-7" /> Team
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage who can view live calls, listen in, and transfer from the Ringster mobile app.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{seatsUsed}</span> / {seatsLimit} seats used
          </div>
          <Button onClick={() => setInviteOpen(true)} disabled={!canInvite}>
            <UserPlus className="w-4 h-4 mr-2" /> Invite member
          </Button>
        </div>
      </div>

      {!canInvite && seatsLimit > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex items-center justify-between py-4">
            <p className="text-sm">You've used all {seatsLimit} seats on the {planName} plan.</p>
            <Button asChild variant="outline" size="sm">
              <Link to="/dashboard/subscription">Upgrade for more seats</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Members table */}
      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            Toggle per-member capabilities. Listen-in and transfer require the mobile app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {membersLoading ? (
            <div className="h-32 bg-muted/30 animate-pulse rounded" />
          ) : members.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Mail className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p>No team members yet. Invite your first teammate to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center">Listen</TableHead>
                    <TableHead className="text-center">Transfer</TableHead>
                    <TableHead className="text-center">Notify</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map(m => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.email}</TableCell>
                      <TableCell className="capitalize">{m.role.replace("_", " ")}</TableCell>
                      <TableCell>
                        <Badge variant={m.status === "active" ? "default" : "secondary"}>
                          {m.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={m.can_listen}
                          onCheckedChange={(v) => updateCapability.mutate({ id: m.id, patch: { can_listen: v } })}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={m.can_transfer}
                          onCheckedChange={(v) => updateCapability.mutate({ id: m.id, patch: { can_transfer: v } })}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={m.receives_notifications}
                          onCheckedChange={(v) => updateCapability.mutate({ id: m.id, patch: { receives_notifications: v } })}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm(`Revoke access for ${m.email}?`)) revokeMutation.mutate(m.id);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mobile devices */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="w-5 h-5" /> Mobile devices
          </CardTitle>
          <CardDescription>
            Devices registered to your team for push notifications and the Ringster mobile app.
            Limit: {devicesLimit} per user.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {devices.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No mobile devices registered yet. Devices appear here when team members sign in to
              the Ringster mobile app.
            </p>
          ) : (
            <div className="space-y-2">
              {devices.map(d => (
                <div key={d.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <Smartphone className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium capitalize">{d.platform}</p>
                      <p className="text-xs text-muted-foreground">
                        {d.app_version ? `v${d.app_version} · ` : ""}
                        Last seen {new Date(d.last_seen_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
};

interface InviteDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const InviteDialog = ({ open, onOpenChange }: InviteDialogProps) => {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [canListen, setCanListen] = useState(false);
  const [canTransfer, setCanTransfer] = useState(false);
  const [notify, setNotify] = useState(true);

  const inviteMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("invite-team-member", {
        body: {
          email: email.trim().toLowerCase(),
          display_name: displayName.trim() || null,
          phone_number: phoneNumber.trim() || null,
          role,
          can_listen: canListen,
          can_transfer: canTransfer,
          receives_notifications: notify,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      toast.success(`Invite sent to ${email}`);
      qc.invalidateQueries({ queryKey: ["team-members"] });
      qc.invalidateQueries({ queryKey: ["team-members-count"] });
      setEmail("");
      setDisplayName("");
      setPhoneNumber("");
      setRole("viewer");
      setCanListen(false);
      setCanTransfer(false);
      setNotify(true);
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to send invite"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a team member</DialogTitle>
          <DialogDescription>
            They'll receive an email with a link to join your team on Ringster.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="invite-name">Name</Label>
            <Input
              id="invite-name"
              placeholder="Jane Smith"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="teammate@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-phone">Phone (E.164, optional)</Label>
            <Input
              id="invite-phone"
              type="tel"
              placeholder="+16475235895"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Required to use this teammate as a transfer destination on an agent.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin — full control</SelectItem>
                <SelectItem value="listener">Listener — listen live + view</SelectItem>
                <SelectItem value="transfer_only">Transfer-only — receive & transfer</SelectItem>
                <SelectItem value="viewer">Viewer — read only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-3 pt-2 border-t">
            <Label className="text-sm">Capabilities</Label>
            <div className="flex items-center justify-between">
              <span className="text-sm">Listen live to calls</span>
              <Switch checked={canListen} onCheckedChange={setCanListen} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Transfer calls from the app</span>
              <Switch checked={canTransfer} onCheckedChange={setCanTransfer} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Receive push notifications</span>
              <Switch checked={notify} onCheckedChange={setNotify} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => inviteMutation.mutate()}
            disabled={!email || inviteMutation.isPending}
          >
            <Plus className="w-4 h-4 mr-2" />
            {inviteMutation.isPending ? "Sending..." : "Send invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default Team;
