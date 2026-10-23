import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow, parseISO, startOfWeek, subWeeks, isAfter } from "date-fns";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Briefcase, Activity, CalendarCheck, Trophy, XCircle, Plus } from "lucide-react";
import { applicationsQuery, ACTIVE_STATUSES, STATUSES, deadlineState } from "@/lib/applications";
import { StatusBadge, DeadlineChip } from "@/components/StatusBadge";
import { ApplicationDialog } from "@/components/ApplicationDialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — ApplyTrack" },
      { name: "description", content: "Your application pipeline at a glance." },
      { property: "og:title", content: "Dashboard — ApplyTrack" },
      { property: "og:description", content: "Your application pipeline at a glance." },
    ],
  }),
  component: Dashboard,
});

const statusColor: Record<string, string> = {
  saved: "var(--status-saved)",
  applied: "var(--status-applied)",
  assessment: "var(--status-assessment)",
  interview: "var(--status-interview)",
  offer: "var(--status-offer)",
  rejected: "var(--status-rejected)",
};

function Dashboard() {
  const { data, isLoading, error } = useQuery(applicationsQuery);
  const [open, setOpen] = useState(false);
  const apps = data ?? [];

  const stats = useMemo(() => {
    const count = (fn: (s: string) => boolean) => apps.filter((a) => fn(a.status)).length;
    return [
      { label: "Total", value: apps.length, icon: Briefcase },
      { label: "Active", value: count((s) => ACTIVE_STATUSES.includes(s as never)), icon: Activity },
      { label: "Interviews", value: count((s) => s === "interview"), icon: CalendarCheck },
      { label: "Offers", value: count((s) => s === "offer"), icon: Trophy },
      { label: "Rejected", value: count((s) => s === "rejected"), icon: XCircle },
    ];
  }, [apps]);

  const pie = STATUSES.map((s) => ({ name: s.label, key: s.value, value: apps.filter((a) => a.status === s.value).length })).filter((d) => d.value > 0);

  const weekly = useMemo(() => {
    const weeks = Array.from({ length: 8 }, (_, i) => startOfWeek(subWeeks(new Date(), 7 - i), { weekStartsOn: 1 }));
    return weeks.map((w, i) => {
      const next = weeks[i + 1];
      const n = apps.filter((a) => {
        const d = parseISO(a.applied_date ?? a.created_at);
        return !isAfter(w, d) && (!next || d < next);
      }).length;
      return { week: format(w, "MMM d"), count: n };
    });
  }, [apps]);

  const upcoming = apps
    .filter((a) => a.deadline && a.status === "saved")
    .sort((a, b) => a.deadline!.localeCompare(b.deadline!))
    .slice(0, 5);
  const interviews = apps
    .filter((a) => a.interview_at && new Date(a.interview_at) >= new Date())
    .sort((a, b) => a.interview_at!.localeCompare(b.interview_at!))
    .slice(0, 3);
  const recent = apps.slice(0, 5);
  const overdue = apps.filter((a) => deadlineState(a).state === "overdue").length;

  if (error) return <p className="text-destructive">Couldn't load your data: {(error as Error).message}</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {overdue > 0 ? `${overdue} saved application${overdue > 1 ? "s are" : " is"} past the deadline.` : "Here's how your search is going."}
          </p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="size-4" /> Add application</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map(({ label, value, icon: Icon }, i) => (
          <div key={label} className="animate-rise rounded-xl border bg-card p-4 shadow-card" style={{ animationDelay: `${i * 40}ms` }}>
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
              <Icon className="size-4" aria-hidden />
            </div>
            {isLoading ? <Skeleton className="mt-2 h-8 w-12" /> : <p className="mt-2 font-display text-3xl font-bold">{value}</p>}
          </div>
        ))}
      </div>

      {!isLoading && apps.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
          <h2 className="text-lg font-semibold">No applications yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Add the first role you're interested in. Your charts, deadlines and stats will fill in automatically.
          </p>
          <Button className="mt-5" onClick={() => setOpen(true)}><Plus className="size-4" /> Add your first application</Button>
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-5">
            <Panel title="Status distribution" className="lg:col-span-2">
              {isLoading ? <Skeleton className="h-56" /> : (
                <div className="flex flex-col items-center gap-4 sm:flex-row">
                  <div className="h-52 w-52 shrink-0">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={pie} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2} stroke="none">
                          {pie.map((d) => <Cell key={d.key} fill={statusColor[d.key]} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="w-full space-y-1.5 text-sm">
                    {pie.map((d) => (
                      <li key={d.key} className="flex items-center justify-between">
                        <StatusBadge status={d.key} />
                        <span className="font-medium">{d.value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Panel>
            <Panel title="Applications per week" className="lg:col-span-3">
              {isLoading ? <Skeleton className="h-56" /> : (
                <div className="h-56">
                  <ResponsiveContainer>
                    <BarChart data={weekly}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="week" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={28} />
                      <Tooltip cursor={{ fill: "var(--muted)" }} />
                      <Bar dataKey="count" name="Applications" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Upcoming deadlines">
              <List empty="No deadlines on saved applications." items={upcoming.map((a) => ({
                id: a.id, title: a.company, sub: a.role,
                right: <div className="flex flex-col items-end gap-1"><span className="text-xs text-muted-foreground">{format(parseISO(a.deadline!), "MMM d")}</span><DeadlineChip app={a} /></div>,
              }))} />
            </Panel>
            <Panel title="Upcoming interviews">
              <List empty="No interviews scheduled." items={interviews.map((a) => ({
                id: a.id, title: a.company, sub: a.role,
                right: <span className="text-xs font-medium text-status-interview">{format(new Date(a.interview_at!), "MMM d, HH:mm")}</span>,
              }))} />
            </Panel>
            <Panel title="Recently updated" action={<Link to="/applications" className="text-xs font-medium text-primary hover:underline">View all</Link>}>
              <List empty="Nothing yet." items={recent.map((a) => ({
                id: a.id, title: a.company, sub: `Updated ${formatDistanceToNow(new Date(a.updated_at), { addSuffix: true })}`,
                right: <StatusBadge status={a.status} />,
              }))} />
            </Panel>
          </div>
        </>
      )}
      <ApplicationDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

function Panel({ title, children, className, action }: { title: string; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <section className={`rounded-xl border bg-card p-5 shadow-card ${className ?? ""}`}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function List({ items, empty }: { items: { id: string; title: string; sub: string; right: React.ReactNode }[]; empty: string }) {
  if (!items.length) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y">
      {items.map((i) => (
        <li key={i.id} className="flex items-center justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{i.title}</p>
            <p className="truncate text-xs text-muted-foreground">{i.sub}</p>
          </div>
          {i.right}
        </li>
      ))}
    </ul>
  );
}
