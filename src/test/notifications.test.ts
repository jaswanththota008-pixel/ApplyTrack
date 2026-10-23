import { describe, expect, it } from "vitest";
import { computeReminders, localDateInTimezone } from "@/lib/notifications";
import type { Application } from "@/lib/applications";

const NOW = new Date("2026-10-15T12:00:00Z");

function app(overrides: Partial<Application>): Application {
  return {
    id: "a1",
    user_id: "u1",
    company: "Acme",
    role: "SDE Intern",
    type: "internship",
    status: "saved",
    priority: "medium",
    company_website: null,
    posting_url: null,
    notes: null,
    applied_date: null,
    deadline: null,
    interview_at: null,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    ...overrides,
  };
}

const prefs = {
  deadline_reminders: true,
  interview_reminders: true,
  overdue_reminders: false,
  timezone: "UTC",
};

describe("localDateInTimezone", () => {
  it("returns the date in the given timezone", () => {
    expect(localDateInTimezone("UTC", NOW)).toBe("2026-10-15");
    // 12:00 UTC is 17:30 in Kolkata — same day
    expect(localDateInTimezone("Asia/Kolkata", NOW)).toBe("2026-10-15");
    // 22:30 UTC is 04:00 next day in Kolkata
    expect(localDateInTimezone("Asia/Kolkata", new Date("2026-10-15T22:30:00Z"))).toBe("2026-10-16");
  });
  it("falls back to UTC for invalid timezones", () => {
    expect(localDateInTimezone("Not/AZone", NOW)).toBe("2026-10-15");
  });
});

describe("computeReminders", () => {
  it("creates 3-day, 1-day and same-day deadline reminders for saved applications", () => {
    const apps = [
      app({ id: "d3", deadline: "2026-10-18" }),
      app({ id: "d1", deadline: "2026-10-16" }),
      app({ id: "d0", deadline: "2026-10-15" }),
    ];
    const r = computeReminders(apps, prefs, NOW);
    expect(r.map((x) => x.kind).sort()).toEqual(["deadline_1d", "deadline_3d", "deadline_today"]);
    expect(r.find((x) => x.application_id === "d0")?.event_key).toBe("deadline_today:d0:2026-10-15");
  });

  it("ignores deadlines on applications already applied to", () => {
    const r = computeReminders([app({ deadline: "2026-10-15", status: "applied" })], prefs, NOW);
    expect(r).toEqual([]);
  });

  it("only creates overdue reminders when enabled, within 7 days", () => {
    const late = app({ id: "late", deadline: "2026-10-13" });
    expect(computeReminders([late], prefs, NOW)).toEqual([]);
    const on = computeReminders([late], { ...prefs, overdue_reminders: true }, NOW);
    expect(on).toHaveLength(1);
    expect(on[0]!.kind).toBe("deadline_overdue");
    const stale = app({ id: "stale", deadline: "2026-10-01" });
    expect(computeReminders([stale], { ...prefs, overdue_reminders: true }, NOW)).toEqual([]);
  });

  it("creates interview reminders only within the next 24 hours and for interview status", () => {
    const soon = app({ id: "iv", status: "interview", interview_at: "2026-10-16T10:00:00Z" });
    const r = computeReminders([soon], prefs, NOW);
    expect(r).toHaveLength(1);
    expect(r[0]!.kind).toBe("interview_24h");

    const later = app({ id: "iv2", status: "interview", interview_at: "2026-10-18T10:00:00Z" });
    expect(computeReminders([later], prefs, NOW)).toEqual([]);

    const past = app({ id: "iv3", status: "interview", interview_at: "2026-10-15T10:00:00Z" });
    expect(computeReminders([past], prefs, NOW)).toEqual([]);

    const wrongStatus = app({ id: "iv4", status: "applied", interview_at: "2026-10-16T10:00:00Z" });
    expect(computeReminders([wrongStatus], prefs, NOW)).toEqual([]);
  });

  it("respects disabled preferences and missing dates", () => {
    const apps = [app({ deadline: "2026-10-15" }), app({ status: "interview", interview_at: "2026-10-16T10:00:00Z" })];
    expect(computeReminders(apps, { ...prefs, deadline_reminders: false, interview_reminders: false }, NOW)).toEqual([]);
    expect(computeReminders([app({})], prefs, NOW)).toEqual([]);
  });

  it("produces stable event keys so repeated runs dedupe", () => {
    const apps = [app({ deadline: "2026-10-16" })];
    const a = computeReminders(apps, prefs, NOW);
    const b = computeReminders(apps, prefs, new Date("2026-10-15T18:00:00Z"));
    expect(a[0]!.event_key).toBe(b[0]!.event_key);
  });
});
