import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  applicationSchema,
  toRow,
  STATUSES,
  TYPES,
  PRIORITIES,
  type Application,
  type ApplicationFormValues,
} from "@/lib/applications";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const empty: ApplicationFormValues = {
  company: "",
  role: "",
  type: "internship",
  status: "saved",
  priority: "medium",
  company_website: "",
  posting_url: "",
  notes: "",
  applied_date: "",
  deadline: "",
  interview_at: "",
};

function fromApp(a: Application): ApplicationFormValues {
  return {
    company: a.company,
    role: a.role,
    type: a.type,
    status: a.status,
    priority: a.priority,
    company_website: a.company_website ?? "",
    posting_url: a.posting_url ?? "",
    notes: a.notes ?? "",
    applied_date: a.applied_date ?? "",
    deadline: a.deadline ?? "",
    interview_at: a.interview_at ? format(new Date(a.interview_at), "yyyy-MM-dd'T'HH:mm") : "",
  };
}

export function ApplicationDialog({
  open,
  onOpenChange,
  application,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  application?: Application | null;
}) {
  const qc = useQueryClient();
  const isEdit = !!application;
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<ApplicationFormValues>({ resolver: zodResolver(applicationSchema), defaultValues: empty });

  useEffect(() => {
    if (open) reset(application ? fromApp(application) : empty);
  }, [open, application, reset]);

  const mutation = useMutation({
    mutationFn: async (values: ApplicationFormValues) => {
      const row = toRow(values);
      if (isEdit) {
        const { error } = await supabase.from("applications").update(row).eq("id", application!.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("applications").insert(row);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "Application updated" : "Application added");
      qc.invalidateQueries({ queryKey: ["applications"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error("Could not save application", { description: e.message }),
  });

  const field = (name: keyof ApplicationFormValues) =>
    errors[name] ? <p className="mt-1 text-xs text-destructive">{errors[name]?.message}</p> : null;

  const sel = (name: "type" | "status" | "priority", label: string, opts: { value: string; label: string }[]) => (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Controller
        control={control}
        name={name}
        render={({ field: f }) => (
          <Select value={f.value} onValueChange={f.onChange}>
            <SelectTrigger id={name} className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {opts.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !mutation.isPending && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit application" : "New application"}</DialogTitle>
          <DialogDescription>Fields marked * are required.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="grid gap-4 sm:grid-cols-2" noValidate>
          <div>
            <Label htmlFor="company">Company *</Label>
            <Input id="company" className="mt-1.5" {...register("company")} aria-invalid={!!errors.company} />
            {field("company")}
          </div>
          <div>
            <Label htmlFor="role">Role / title *</Label>
            <Input id="role" className="mt-1.5" {...register("role")} aria-invalid={!!errors.role} />
            {field("role")}
          </div>
          <div className="grid grid-cols-3 gap-3 sm:col-span-2">
            {sel("type", "Type", TYPES)}
            {sel("status", "Status", STATUSES)}
            {sel("priority", "Priority", PRIORITIES)}
          </div>
          <div>
            <Label htmlFor="company_website">Company website</Label>
            <Input id="company_website" placeholder="https://" className="mt-1.5" {...register("company_website")} />
            {field("company_website")}
          </div>
          <div>
            <Label htmlFor="posting_url">Job posting URL</Label>
            <Input id="posting_url" placeholder="https://" className="mt-1.5" {...register("posting_url")} />
            {field("posting_url")}
          </div>
          <div>
            <Label htmlFor="applied_date">Application date</Label>
            <Input id="applied_date" type="date" className="mt-1.5" {...register("applied_date")} />
          </div>
          <div>
            <Label htmlFor="deadline">Deadline</Label>
            <Input id="deadline" type="date" className="mt-1.5" {...register("deadline")} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="interview_at">Interview date & time</Label>
            <Input id="interview_at" type="datetime-local" className="mt-1.5" {...register("interview_at")} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="notes">Job description / notes</Label>
            <Textarea id="notes" rows={4} className="mt-1.5" {...register("notes")} />
            {field("notes")}
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
              {isEdit ? "Save changes" : "Add application"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
