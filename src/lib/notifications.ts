import { queryOptions } from "@tanstack/react-query";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { Application } from "./applications";

export type AppNotification = Database["public"]["Tables"]["notifications"]["Row"];
export type NotificationPreferences = Database["public"]["Tables"]["notification_preferences"]["Row"];
export type NotificationKind = AppNotification["kind"];

export const notificationsQuery = queryOptions({
  queryKey: ["notifications"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .is("dismissed_at", null)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return data;
  },
});

export const preferencesQuery = queryOptions({
  queryKey: ["notification-preferences"],
  queryFn: async () => {
    const { data, error } = await supabase.from("notification_preferences").select("*").maybeSingle();
    if (error) throw error;
    return data;
  },
});

export interface ReminderCandidate {
  event_key: string;
  kind: NotificationKind;
  title: string;
  body: string;
  application_id: string;
}

/** Today's date (yyyy-mm-dd) in the user's timezone. */
export function localDateInTimezone(tz: string, now: Date): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(now);
  }
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/**
 * Pure reminder computation — mirrors the database generate_reminders() function.
 * Deadline reminders only apply to saved applications; interview reminders to
 * interviews in the next 24 hours. Event keys make every reminder idempotent.
 */
export function computeReminders(
  apps: Application[],
  prefs: Pick<
    NotificationPreferences,
    "deadline_reminders" | "interview_reminders" | "overdue_reminders" | "timezone"
  > | null,
  now: Date = new Date(),
): ReminderCandidate[] {
  const p = prefs ?? {
    deadline_reminders: true,
    interview_reminders: true,
    overdue_reminders: false,
    timezone: "UTC",
  };
  const tz = p.timezone || "UTC";
  const today = parseISO(localDateInTimezone(tz, now));
  const out: ReminderCandidate[] = [];

  for (const a of apps) {
    if (p.deadline_reminders && a.deadline && a.status === "saved") {
      const days = differenceInCalendarDays(parseISO(a.deadline), today);
      let kind: NotificationKind | null = null;
      let title = "";
      if (days === 3) { kind = "deadline_3d"; title = "Deadline in 3 days"; }
      else if (days === 1) { kind = "deadline_1d"; title = "Deadline tomorrow"; }
      else if (days === 0) { kind = "deadline_today"; title = "Deadline today"; }
      else if (days < 0 && days >= -7 && p.overdue_reminders) { kind = "deadline_overdue"; title = "Deadline passed"; }
      if (kind) {
        out.push({
          event_key: `${kind}:${a.id}:${a.deadline}`,
          kind,
          title,
          body: `${a.role} at ${a.company} — deadline ${fmtDate(a.deadline)}`,
          application_id: a.id,
        });
      }
    }
    if (p.interview_reminders && a.interview_at && a.status === "interview") {
      const at = new Date(a.interview_at);
      if (at > now && at.getTime() - now.getTime() <= 24 * 60 * 60 * 1000) {
        const hourKey = at.toISOString().slice(0, 13);
        out.push({
          event_key: `interview_24h:${a.id}:${hourKey}`,
          kind: "interview_24h",
          title: "Interview within 24 hours",
          body: `${a.role} at ${a.company} — ${at.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`,
          application_id: a.id,
        });
      }
    }
  }
  return out;
}

/**
 * Inserts any new reminders for the signed-in user (deduped by event key) and
 * optionally shows a browser notification for each newly created one.
 * Returns the reminders that were newly inserted.
 */
export async function syncReminders(
  apps: Application[],
  prefs: NotificationPreferences | null,
): Promise<ReminderCandidate[]> {
  const candidates = computeReminders(apps, prefs);
  if (!candidates.length) return [];
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];

  const { data: existing } = await supabase
    .from("notifications")
    .select("event_key")
    .in("event_key", candidates.map((c) => c.event_key));
  const have = new Set((existing ?? []).map((e) => e.event_key));
  const fresh = candidates.filter((c) => !have.has(c.event_key));
  if (!fresh.length) return [];

  const { error } = await supabase.from("notifications").insert(
    fresh.map((c) => ({ ...c, user_id: userData.user!.id })),
  );
  if (error) throw error;

  if (prefs?.browser_enabled && typeof Notification !== "undefined" && Notification.permission === "granted") {
    for (const c of fresh) {
      try {
        const n = new Notification(c.title, { body: c.body, tag: c.event_key, icon: "/favicon.ico" });
        n.onclick = () => { window.focus(); window.location.href = "/applications"; };
      } catch {
        // Browser blocked the notification — ignore gracefully.
      }
    }
  }
  return fresh;
}
