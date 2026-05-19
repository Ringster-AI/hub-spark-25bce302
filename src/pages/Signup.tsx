
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SignupFormValues } from "@/types/auth";
import { SignupHeader } from "@/components/auth/SignupHeader";
import { SignupStepOne } from "@/components/auth/SignupStepOne";
import { SignupStepTwo } from "@/components/auth/SignupStepTwo";
import { Seo } from "@/components/seo/Seo";

const Signup = () => {
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  
  const form = useForm<SignupFormValues>({
    defaultValues: {
      email: "",
      password: "",
      company: {
        name: "",
        size: "",
        workEmail: "",
        phone: "",
        additionalInfo: "",
      },
    },
  });

  const onSubmit = async (data: SignupFormValues) => {
    try {
      setIsLoading(true);
      
      // Create user account
      const { error: signUpError, data: authData } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            full_name: "", // Can be updated later in profile
          },
        },
      });

      if (signUpError) {
        if (signUpError.message.includes("already registered")) {
          toast.error("This email is already registered. Please sign in instead.");
          return;
        }
        throw signUpError;
      }

      // Create organization entry
      const { error: orgError } = await supabase
        .from('organizations')
        .insert({
          name: data.company.name,
          size: data.company.size,
          additional_info: data.company.additionalInfo,
          user_id: authData.user?.id,
        });

      if (orgError) throw orgError;

      // Track signup completion
      if (typeof (window as any).fbq === 'function') {
        (window as any).fbq('track', 'CompleteRegistration');
      }

      toast.success("Account created successfully!");
      navigate("/dashboard");
    } catch (error: any) {
      console.error("Signup error:", error);
      if (error.message) {
        toast.error(error.message);
      } else {
        toast.error("Failed to create account. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const nextStep = () => {
    const currentFields = step === 1 
      ? ['email', 'password']
      : ['company.name', 'company.size', 'company.workEmail'];
      
    const isValid = currentFields.every(field => form.getValues(field as any));
    
    if (isValid) {
      // Set work email to match the email from step 1
      form.setValue('company.workEmail', form.getValues('email'));
      setStep(step + 1);
    } else {
      toast.error("Please fill in all required fields");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800 p-4">
      <Seo
        title="Sign Up for Ringster — Try the AI Voice Receptionist"
        description="Create a Ringster account and launch an AI voice receptionist that books appointments and handles calls 24/7. Free credits to start."
      />
      <div className="w-full max-w-md space-y-8 bg-white p-8 rounded-xl shadow-2xl">
        <SignupHeader step={step} />

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {step === 1 ? (
            <SignupStepOne form={form} onNext={nextStep} />
          ) : (
            <SignupStepTwo 
              form={form} 
              isLoading={isLoading} 
              onBack={() => setStep(1)} 
            />
          )}
        </form>

        <p className="text-center text-sm text-gray-600">
          Already have an account?{" "}
          <Button
            variant="link"
            className="p-0 h-auto font-semibold"
            onClick={() => navigate("/login")}
          >
            Sign in
          </Button>
        </p>
      </div>
    </div>
  );
};

export default Signup;
