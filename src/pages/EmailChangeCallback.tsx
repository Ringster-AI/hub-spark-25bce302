import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type Status = "loading" | "success" | "error";

const EmailChangeCallback = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState<string>("");
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    let mounted = true;
    const params = new URLSearchParams(
      window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : window.location.search.slice(1),
    );
    const errorDescription =
      params.get("error_description") || params.get("error");

    if (errorDescription) {
      setStatus("error");
      setMessage(errorDescription.replace(/\+/g, " "));
      return;
    }

    // Supabase auto-processes the token in the URL when detectSessionInUrl is on.
    const check = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!mounted) return;
      if (error || !data.user) {
        setStatus("error");
        setMessage(
          error?.message ||
            "We couldn't verify this link. It may have expired or already been used.",
        );
        return;
      }
      setEmail(data.user.email ?? "");
      setStatus("success");
    };
    check();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-lg border bg-card p-8 text-center shadow-sm">
        {status === "loading" && (
          <>
            <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-muted-foreground" />
            <h1 className="text-xl font-semibold">Confirming your email…</h1>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-primary" />
            <h1 className="text-xl font-semibold">Confirmation received</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your email change is one step closer. Both your current and new
              addresses must be confirmed before sign-in updates to{" "}
              <strong>{email}</strong>.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <Button onClick={() => navigate("/dashboard/profile")}>
                Back to profile
              </Button>
              <Button asChild variant="ghost">
                <Link to="/dashboard">Go to dashboard</Link>
              </Button>
            </div>
          </>
        )}
        {status === "error" && (
          <>
            <AlertCircle className="mx-auto mb-4 h-12 w-12 text-destructive" />
            <h1 className="text-xl font-semibold">Couldn't confirm</h1>
            <p className="mt-2 text-sm text-muted-foreground">{message}</p>
            <div className="mt-6 flex flex-col gap-2">
              <Button onClick={() => navigate("/dashboard/profile")}>
                Back to profile
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default EmailChangeCallback;
