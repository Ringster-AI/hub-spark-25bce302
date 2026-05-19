import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AuthError, AuthApiError } from "@supabase/supabase-js";
import { Seo } from "@/components/seo/Seo";

export default function Login() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        setError(getErrorMessage(sessionError));
      }
      if (session) {
        navigate("/dashboard", { replace: true });
      }
      setIsLoading(false);
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        navigate("/dashboard", { replace: true });
      }
      if (event === 'SIGNED_OUT') {
        setError(null);
      }
      // Handle auth errors through the state change event
      if (event === 'USER_UPDATED' && !session) {
        const checkError = async () => {
          const { error: authError } = await supabase.auth.getSession();
          if (authError) {
            setError(getErrorMessage(authError));
          }
        };
        checkError();
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const getErrorMessage = (error: AuthError) => {
    if (error instanceof AuthApiError) {
      switch (error.status) {
        case 400:
          if (error.message.includes('Invalid login credentials')) {
            return 'Invalid email or password. Please check your credentials and try again.';
          }
          if (error.message.includes('Email not confirmed')) {
            return 'Please verify your email address before signing in.';
          }
          break;
        case 422:
          return 'Invalid email format. Please check your email address.';
        case 429:
          return 'Too many login attempts. Please try again later.';
      }
    }
    return error.message;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Welcome to Ringster</CardTitle>
          <CardDescription>
            Sign in to manage your AI agents and subscription
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Auth
            supabaseClient={supabase}
            appearance={{
              theme: ThemeSupa,
              variables: {
                default: {
                  colors: {
                    brand: '#2563eb',
                    brandAccent: '#1d4ed8',
                  },
                },
              },
            }}
            theme="light"
            providers={[]}
          />
        </CardContent>
      </Card>
    </div>
  );
}