import { cn } from "@/lib/utils";
import { STATUS_LABEL, deadlineState, type Application, type ApplicationStatus, type ApplicationPriority } from "@/lib/applications";
import { AlertTriangle, Clock } from "lucide-react";

const statusStyles: Record<ApplicationStatus, string> = {
  saved: "bg-status-saved/12 text-status-saved border-status-saved/25",
  applied: "bg-status-applied/12 text-status-applied border-status-applied/25",
  assessment: "bg-status-assessment/15 text-status-assessment border-status-assessment/30",
  interview: "bg-status-interview/12 text-status-interview border-status-interview/25",
  offer: "bg-status-offer/12 text-status-offer border-status-offer/25",
  rejected: "bg-status-rejected/12 text-status-rejected border-status-rejected/25",
};
export const statusDot: Record<ApplicationStatus, string> = {
  saved: "bg-status-saved",
  applied: "bg-status-applied",
  assessment: "bg-status-assessment",
  interview: "bg-status-interview",
  offer: "bg-status-offer",
  rejected: "bg-status-rejected",
};

export function StatusBadge({ status, className }: { status: ApplicationStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        statusStyles[status],
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", statusDot[status])} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

const prioStyles: Record<ApplicationPriority, string> = {
  high: "text-destructive",
  medium: "text-warning",
  low: "text-muted-foreground",
};
export function PriorityLabel({ priority }: { priority: ApplicationPriority }) {
  return (
    <span className={cn("text-xs font-medium capitalize", prioStyles[priority])}>{priority}</span>
  );
}

export function DeadlineChip({ app }: { app: Pick<Application, "deadline" | "status"> }) {
  const { state, days } = deadlineState(app);
  if (!state || days === null) return null;
  if (state === "overdue")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
        <AlertTriangle className="size-3" aria-hidden /> Overdue {Math.abs(days)}d
      </span>
    );
  if (state === "soon")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
        <Clock className="size-3" aria-hidden /> {days === 0 ? "Due today" : `Due in ${days}d`}
      </span>
    );
  return null;
}
