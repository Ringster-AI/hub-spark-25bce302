import { useEffect, useState } from "react";
import { z } from "zod";
import { Loader2, MailCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ChangeEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentEmail: string;
}

const emailSchema = z
  .string()
  .trim()
  .email("Enter a valid email address")
  .max(255, "Email is too long");

const RESEND_SECONDS = 60;

export const ChangeEmailDialog = ({
  open,
  onOpenChange,
  currentEmail,
}: ChangeEmailDialogProps) => {
  const { toast } = useToast();
  const [newEmail, setNewEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!open) {
      setNewEmail("");
      setError(null);
      setSent(false);
      setCooldown(0);
      setSubmitting(false);
    }
  }, [open]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const submit = async () => {
    setError(null);
    const parsed = emailSchema.safeParse(newEmail);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    if (parsed.data.toLowerCase() === (currentEmail || "").toLowerCase()) {
      setError("That's already your current email.");
      return;
    }

    setSubmitting(true);
    const redirectTo = `${window.location.origin}/auth/email-change/callback`;
    const { error: updateError } = await supabase.auth.updateUser(
      { email: parsed.data },
      { emailRedirectTo: redirectTo },
    );
    setSubmitting(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSent(true);
    setCooldown(RESEND_SECONDS);
    toast({
      title: "Confirmation emails sent",
      description: "Check both inboxes to finish the change.",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change email address</DialogTitle>
          <DialogDescription>
            For your security, we'll email both your current and new address.
            Click the link in <strong>each</strong> message to complete the
            change.
          </DialogDescription>
        </DialogHeader>

        {!sent ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Current email</Label>
              <Input value={currentEmail} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-email">New email</Label>
              <Input
                id="new-email"
                type="email"
                autoComplete="email"
                placeholder="you@newdomain.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                disabled={submitting}
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button onClick={submit} disabled={submitting}>
                {submitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Send confirmation
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <Alert>
              <MailCheck className="h-4 w-4" />
              <AlertDescription>
                Check <strong>{currentEmail}</strong> and{" "}
                <strong>{newEmail}</strong>. Both must be confirmed before your
                sign-in email updates.
              </AlertDescription>
            </Alert>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                variant="outline"
                onClick={submit}
                disabled={submitting || cooldown > 0}
              >
                {submitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend emails"}
              </Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
