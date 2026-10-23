import { z } from "zod";
import { queryOptions } from "@tanstack/react-query";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Application = Database["public"]["Tables"]["applications"]["Row"];
export type ApplicationStatus = Database["public"]["Enums"]["application_status"];
export type ApplicationType = Database["public"]["Enums"]["application_type"];
export type ApplicationPriority = Database["public"]["Enums"]["application_priority"];

export const STATUSES: { value: ApplicationStatus; label: string }[] = [
  { value: "saved", label: "Saved" },
  { value: "applied", label: "Applied" },
  { value: "assessment", label: "Assessment" },
  { value: "interview", label: "Interview" },
  { value: "offer", label: "Offer" },
  { value: "rejected", label: "Rejected" },
];
export const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.value, s.label])) as Record<
  ApplicationStatus,
  string
>;
export const TYPES: { value: ApplicationType; label: string }[] = [
  { value: "job", label: "Full-time" },
  { value: "internship", label: "Internship" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "other", label: "Other" },
];
export const TYPE_LABEL = Object.fromEntries(TYPES.map((t) => [t.value, t.label])) as Record<
  ApplicationType,
  string
>;
export const PRIORITIES: { value: ApplicationPriority; label: string }[] = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

/** Statuses that count as "still in progress". */
export const ACTIVE_STATUSES: ApplicationStatus[] = ["saved", "applied", "assessment", "interview"];

const optionalUrl = z
  .string()
  .trim()
  .max(500, "URL is too long")
  .refine((v) => v === "" || /^https?:\/\/[^\s]+\.[^\s]+/i.test(v), "Must start with http:// or https://");

// Mirrors the CHECK constraints in the database so errors show before submit.
export const applicationSchema = z.object({
    company: z.string().trim().min(1, "Company is required").max(120),
    role: z.string().trim().min(1, "Role is required").max(120),
    type: z.enum(["job", "internship", "part_time", "contract", "other"]),
    status: z.enum(["saved", "applied", "assessment", "interview", "offer", "rejected"]),
    priority: z.enum(["low", "medium", "high"]),
    company_website: optionalUrl,
    posting_url: optionalUrl,
    notes: z.string().max(5000, "Notes must be under 5000 characters"),
    applied_date: z.string(),
    deadline: z.string(),
    interview_at: z.string(),
  });

export type ApplicationFormValues = z.infer<typeof applicationSchema>;

export function toRow(v: ApplicationFormValues) {
  const n = (s: string) => (s.trim() === "" ? null : s.trim());
  return {
    company: v.company.trim(),
    role: v.role.trim(),
    type: v.type,
    status: v.status,
    priority: v.priority,
    company_website: n(v.company_website),
    posting_url: n(v.posting_url),
    notes: n(v.notes),
    applied_date: n(v.applied_date),
    deadline: n(v.deadline),
    interview_at: v.interview_at ? new Date(v.interview_at).toISOString() : null,
  };
}

export const applicationsQuery = queryOptions({
  queryKey: ["applications"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("applications")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data;
  },
});

export type DeadlineState = "overdue" | "soon" | "upcoming" | null;
export function deadlineState(app: Pick<Application, "deadline" | "status">): {
  state: DeadlineState;
  days: number | null;
} {
  if (!app.deadline) return { state: null, days: null };
  const days = differenceInCalendarDays(parseISO(app.deadline), new Date());
  // Deadlines only matter before you've applied / moved forward.
  if (app.status !== "saved") return { state: null, days };
  if (days < 0) return { state: "overdue", days };
  if (days <= 3) return { state: "soon", days };
  return { state: "upcoming", days };
}
