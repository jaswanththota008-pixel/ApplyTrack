import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Bell, BellOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { preferencesQuery, type NotificationPreferences } from "@/lib/notifications";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TIMEZONES = [
  "UTC", "Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London",
  "Europe/Berlin", "America/New_York", "America/Chicago", "America/Los_Angeles",
  "Australia/Sydney",
];

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — ApplyTrack" },
      { name: "description", content: "Manage your ApplyTrack profile and password." },
      { property: "og:title", content: "Settings — ApplyTrack" },
      { property: "og:description", content: "Manage your ApplyTrack profile." },
    ],
  }),
  component: Settings,
});

const profileSchema = z.object({
  full_name: z.string().trim().max(100, "Max 100 characters"),
  university: z.string().trim().max(150, "Max 150 characters"),
  target_role: z.string().trim().max(100, "Max 100 characters"),
});

function Settings() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["profile", user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const [form, setForm] = useState({ full_name: "", university: "", target_role: "" });
  const [err, setErr] = useState<Record<string, string>>({});
  useEffect(() => {
    if (data) setForm({ full_name: data.full_name ?? "", university: data.university ?? "", target_role: data.target_role ?? "" });
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const p = profileSchema.safeParse(form);
      if (!p.success) {
        setErr(Object.fromEntries(p.error.issues.map((i) => [i.path[0], i.message])));
        throw new Error("Please fix the highlighted fields");
      }
      setErr({});
      const { error } = await supabase.from("profiles").upsert({ id: user.id, ...p.data });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Profile saved"); qc.invalidateQueries({ queryKey: ["profile", user.id] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [pw, setPw] = useState({ current: "", next: "" });
  const changePw = useMutation({
    mutationFn: async () => {
      if (pw.next.length < 8) throw new Error("New password must be at least 8 characters");
      const { error } = await supabase.auth.updateUser({ password: pw.next, current_password: pw.current } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Password updated"); setPw({ current: "", next: "" }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Settings</h1>
        <p className="text-sm text-muted-foreground">Signed in as {user.email}</p>
      </div>
      <section className="rounded-xl border bg-card p-6 shadow-card">
        <h2 className="font-semibold">Profile</h2>
        {isLoading ? <Skeleton className="mt-4 h-40" /> : (
          <form className="mt-4 space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }} noValidate>
            {([["full_name", "Full name"], ["university", "University / college"], ["target_role", "Target role"]] as const).map(([k, l]) => (
              <div key={k}>
                <Label htmlFor={k}>{l}</Label>
                <Input id={k} className="mt-1.5" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} aria-invalid={!!err[k]} />
                {err[k] && <p className="mt-1 text-xs text-destructive">{err[k]}</p>}
              </div>
            ))}
            <Button type="submit" disabled={save.isPending}>{save.isPending && <Loader2 className="size-4 animate-spin" />} Save profile</Button>
          </form>
        )}
      </section>
      <section className="rounded-xl border bg-card p-6 shadow-card">
        <h2 className="font-semibold">Change password</h2>
        <form className="mt-4 space-y-4" onSubmit={(e) => { e.preventDefault(); changePw.mutate(); }}>
          <div>
            <Label htmlFor="cur">Current password</Label>
            <Input id="cur" type="password" autoComplete="current-password" className="mt-1.5" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="new">New password</Label>
            <Input id="new" type="password" autoComplete="new-password" className="mt-1.5" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          </div>
          <Button type="submit" variant="outline" disabled={changePw.isPending || !pw.next}>{changePw.isPending && <Loader2 className="size-4 animate-spin" />} Update password</Button>
        </form>
      </section>
      <NotificationSettings userId={user.id} />
    </div>
  );
}

function NotificationSettings({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery(preferencesQuery);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );

  const save = useMutation({
    mutationFn: async (patch: Partial<NotificationPreferences>) => {
      const { error } = await supabase
        .from("notification_preferences")
        .upsert({ user_id: userId, ...patch });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notification-preferences"] }),
    onError: (e: Error) => toast.error("Couldn't save preferences", { description: e.message }),
  });

  const enableBrowser = async () => {
    if (typeof Notification === "undefined") return;
    const p = await Notification.requestPermission();
    setPerm(p);
    if (p === "granted") {
      save.mutate({ browser_enabled: true });
      toast.success("Browser notifications enabled");
    } else if (p === "denied") {
      toast.error("Notifications are blocked", {
        description: "Click the lock icon in your browser's address bar, allow notifications for this site, then try again.",
      });
    }
  };

  const toggle = (key: keyof NotificationPreferences, label: string) => (
    <div className="flex items-center justify-between gap-4 py-2">
      <Label htmlFor={key} className="font-normal">{label}</Label>
      <Switch
        id={key}
        checked={!!data?.[key]}
        onCheckedChange={(v) => save.mutate({ [key]: v })}
        disabled={isLoading || save.isPending}
      />
    </div>
  );

  return (
    <section className="rounded-xl border bg-card p-6 shadow-card">
      <h2 className="font-semibold">Notifications</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Choose which reminders you get. Email reminders are sent by the scheduled job once email is configured.
      </p>
      {isLoading ? <Skeleton className="mt-4 h-48" /> : (
        <div className="mt-4 space-y-1 divide-y">
          <div className="flex items-center justify-between gap-4 py-2">
            <div>
              <Label className="font-normal">Browser notifications</Label>
              <p className="text-xs text-muted-foreground">
                {perm === "unsupported"
                  ? "This browser doesn't support notifications."
                  : perm === "denied"
                    ? "Blocked by your browser — allow them in the address-bar lock menu."
                    : perm === "granted"
                      ? "Permission granted."
                      : "You'll be asked for permission when you enable this."}
              </p>
            </div>
            {data?.browser_enabled && perm === "granted" ? (
              <Button variant="outline" size="sm" onClick={() => save.mutate({ browser_enabled: false })} disabled={save.isPending}>
                <BellOff className="size-4" /> Disable
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={enableBrowser} disabled={perm === "denied" || perm === "unsupported" || save.isPending}>
                <Bell className="size-4" /> Enable
              </Button>
            )}
          </div>
          {toggle("email_enabled", "Email reminders")}
          {toggle("deadline_reminders", "Deadline reminders (3 days, 1 day, same day)")}
          {toggle("interview_reminders", "Interview reminders (within 24 hours)")}
          {toggle("overdue_reminders", "Overdue deadline reminders")}
          <div className="flex items-center justify-between gap-4 py-2">
            <Label htmlFor="tz" className="font-normal">Your timezone</Label>
            <Select
              value={data?.timezone ?? "UTC"}
              onValueChange={(v) => save.mutate({ timezone: v })}
              disabled={isLoading || save.isPending}
            >
              <SelectTrigger id="tz" className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => <SelectItem key={tz} value={tz}>{tz.replace("_", " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </section>
  );
}
