import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface FormActionsProps {
  onCancel: () => void;
  disabled?: boolean;
  isSubmitting?: boolean;
  submitLabel?: string;
  submittingLabel?: string;
}

export const FormActions = ({
  onCancel,
  disabled,
  isSubmitting = false,
  submitLabel = "Create Agent",
  submittingLabel,
}: FormActionsProps) => {
  return (
    <div className="flex justify-end space-x-2 sticky bottom-0 bg-background py-4 border-t">
      <Button variant="outline" onClick={onCancel} type="button" disabled={isSubmitting}>
        Cancel
      </Button>
      <Button type="submit" disabled={disabled || isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {submittingLabel || `${submitLabel.replace(/e?$/, "")}ing...`}
          </>
        ) : (
          submitLabel
        )}
      </Button>
    </div>
  );
};
