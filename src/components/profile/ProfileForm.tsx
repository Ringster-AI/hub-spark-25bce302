import { useState } from "react";
import { useForm } from "react-hook-form";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { ChangeEmailDialog } from "./ChangeEmailDialog";

export interface ProfileFormValues {
  full_name: string;
  username: string;
  phone: string;
  website: string;
  bio: string;
}

interface ProfileFormProps {
  defaultValues: ProfileFormValues;
  currentEmail: string;
  onSubmit: (values: ProfileFormValues) => void;
  isSubmitting?: boolean;
}

export const ProfileForm = ({
  defaultValues,
  currentEmail,
  onSubmit,
  isSubmitting,
}: ProfileFormProps) => {
  const form = useForm<ProfileFormValues>({ defaultValues });
  const [changeEmailOpen, setChangeEmailOpen] = useState(false);

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="full_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Full Name</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="username"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Username</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormItem>
            <FormLabel>Email</FormLabel>
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 rounded-md border border-input bg-muted/40 px-3 py-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{currentEmail || "—"}</span>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setChangeEmailOpen(true)}
              >
                Change email
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Your email is used to sign in. Changing it requires confirmation
              from both your current and new address.
            </p>
          </FormItem>

          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone</FormLabel>
                <FormControl>
                  <Input {...field} type="tel" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="website"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Website</FormLabel>
                <FormControl>
                  <Input {...field} type="url" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="bio"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Bio</FormLabel>
                <FormControl>
                  <Textarea {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </form>
      </Form>

      <ChangeEmailDialog
        open={changeEmailOpen}
        onOpenChange={setChangeEmailOpen}
        currentEmail={currentEmail}
      />
    </>
  );
};
