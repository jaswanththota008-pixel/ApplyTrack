import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Bell, Check, CheckCheck, X, AlertTriangle, CalendarClock, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { notificationsQuery, type AppNotification } from "@/lib/notifications";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const kindIcon: Record<string, typeof Bell> = {
  deadline_3d: Clock,
  deadline_1d: Clock,
  deadline_today: AlertTriangle,
  deadline_overdue: AlertTriangle,
  interview_24h: CalendarClock,
  status_change: Bell,
};

export function NotificationBell() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data, isLoading, error } = useQuery(notificationsQuery);
  const items = data ?? [];
  const unread = items.filter((n) => !n.read_at).length;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["notifications"] });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const markAll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .is("read_at", null)
        .is("dismissed_at", null);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const dismiss = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications").update({ dismissed_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
          <Bell className="size-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid min-size-4.5 size-4.5 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 max-w-[calc(100vw-2rem)] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Notifications</h2>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
              <CheckCheck className="size-3.5" /> Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : error ? (
            <p className="p-4 text-sm text-destructive">Couldn't load notifications.</p>
          ) : items.length === 0 ? (
            <div className="p-8 text-center">
              <Bell className="mx-auto size-6 text-muted-foreground" aria-hidden />
              <p className="mt-2 text-sm text-muted-foreground">You're all caught up. Deadline and interview reminders will appear here.</p>
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((n) => (
                <NotificationRow
                  key={n.id}
                  n={n}
                  onRead={() => markRead.mutate(n.id)}
                  onDismiss={() => dismiss.mutate(n.id)}
                  onOpen={() => setOpen(false)}
                />
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NotificationRow({ n, onRead, onDismiss, onOpen }: { n: AppNotification; onRead: () => void; onDismiss: () => void; onOpen: () => void }) {
  const Icon = kindIcon[n.kind] ?? Bell;
  const urgent = n.kind === "deadline_today" || n.kind === "deadline_overdue";
  return (
    <li className={cn("flex gap-3 px-4 py-3", !n.read_at && "bg-accent/40")}>
      <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-full", urgent ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary")}>
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{n.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>
        <div className="mt-1.5 flex items-center gap-3">
          <span className="text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</span>
          {n.application_id && (
            <Link to="/applications" onClick={onOpen} className="text-[11px] font-medium text-primary hover:underline">
              View application
            </Link>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-1">
        {!n.read_at && (
          <button onClick={onRead} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Mark as read">
            <Check className="size-3.5" />
          </button>
        )}
        <button onClick={onDismiss} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Dismiss notification">
          <X className="size-3.5" />
        </button>
      </div>
    </li>
  );
}
