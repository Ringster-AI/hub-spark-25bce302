import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Users } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { TransferHours } from "./TransferHours";
import { NewTransferEntryFormProps } from "./types";

interface TransferableTeamMember {
  id: string;
  email: string;
  display_name: string | null;
  phone_number: string | null;
}

export const NewTransferEntryForm = ({ onAdd, disabled }: NewTransferEntryFormProps) => {
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [keywords, setKeywords] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");

  const { data: teamMembers = [] } = useQuery({
    queryKey: ["team-members-transferable"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase
        .from("team_members" as any)
        .select("id, email, display_name, phone_number")
        .eq("owner_user_id", user.id)
        .neq("status", "revoked")
        .order("display_name", { ascending: true });
      if (error) return [];
      return ((data ?? []) as unknown as TransferableTeamMember[]).filter(m => !!m.phone_number);
    },
  });

  const handleSelectTeamMember = (memberId: string) => {
    setSelectedTeamId(memberId);
    const m = teamMembers.find(t => t.id === memberId);
    if (!m) return;
    setName(m.display_name?.trim() || m.email);
    setNumber(m.phone_number ?? "");
  };

  const handleAdd = () => {
    if (!name || !number || disabled) return;

    onAdd(name, {
      keywords: keywords.split(',').map(k => k.trim()).filter(k => k),
      number,
      transfer_message: "I'll transfer you right away",
      transfer_hours: {
        start: startTime,
        end: endTime,
      },
    });

    setName("");
    setNumber("");
    setKeywords("");
    setStartTime("09:00");
    setEndTime("17:00");
    setSelectedTeamId("");
  };

  return (
    <div className="space-y-3 p-4 border rounded-lg">
      <Label>Add transfer destination</Label>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground flex items-center gap-1">
          <Users className="h-3.5 w-3.5" /> Pick from your team
        </Label>
        {teamMembers.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No teammates with a phone number yet.{" "}
            <Link to="/dashboard/team" className="underline">Invite or edit team members</Link>.
          </p>
        ) : (
          <Select value={selectedTeamId} onValueChange={handleSelectTeamMember} disabled={disabled}>
            <SelectTrigger>
              <SelectValue placeholder="Select a team member…" />
            </SelectTrigger>
            <SelectContent>
              {teamMembers.map(m => (
                <SelectItem key={m.id} value={m.id}>
                  {(m.display_name?.trim() || m.email)} · {m.phone_number}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="relative my-2">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t" /></div>
        <div className="relative flex justify-center"><span className="bg-card px-2 text-xs text-muted-foreground">or enter manually</span></div>
      </div>

      <div className="space-y-2">
        <Input
          placeholder="Department or person name"
          value={name}
          onChange={(e) => { setName(e.target.value); setSelectedTeamId(""); }}
          disabled={disabled}
        />
        <Input
          placeholder="Phone Number (E.164, e.g. +16475235895)"
          value={number}
          onChange={(e) => { setNumber(e.target.value); setSelectedTeamId(""); }}
          disabled={disabled}
        />
        <Input
          placeholder="Keywords (comma-separated)"
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          disabled={disabled}
        />
        <TransferHours
          start={startTime}
          end={endTime}
          onChange={(start, end) => {
            setStartTime(start);
            setEndTime(end);
          }}
          disabled={disabled}
        />
        <Button
          onClick={handleAdd}
          className="w-full"
          disabled={disabled || !name || !number}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add destination
        </Button>
      </div>
    </div>
  );
};
