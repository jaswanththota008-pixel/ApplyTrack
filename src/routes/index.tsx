import { createFileRoute, Link } from "@tanstack/react-router";
import { BarChart3, KanbanSquare, CalendarClock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { STATUSES } from "@/lib/applications";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ApplyTrack — Job & Internship Application Tracker" },
      { name: "description", content: "Track job and internship applications from saved to offer with a Kanban board, deadlines and dashboard charts." },
      { property: "og:title", content: "ApplyTrack — Job & Internship Application Tracker" },
      { property: "og:description", content: "Track every application from saved to offer. Kanban, deadlines and insights." },
    ],
  }),
  component: Landing,
});

const features = [
  { icon: KanbanSquare, title: "Kanban & list views", text: "Drag cards between stages or scan a sortable, filterable list." },
  { icon: CalendarClock, title: "Deadline alerts", text: "See what's due soon and what's already overdue at a glance." },
  { icon: BarChart3, title: "Live dashboard", text: "Status distribution and weekly activity from your own data." },
  { icon: ShieldCheck, title: "Private by design", text: "Every record is locked to your account at the database level." },
];

function Landing() {
  return (
    <div className="min-h-screen bg-hero">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Logo />
        <div className="flex gap-2">
          <Button variant="ghost" asChild><Link to="/auth">Sign in</Link></Button>
          <Button asChild><Link to="/dashboard">Open app</Link></Button>
        </div>
      </header>
      <section className="mx-auto max-w-6xl px-6 pb-16 pt-12 sm:pt-20">
        <div className="max-w-3xl animate-rise">
          <h1 className="text-4xl font-bold leading-[1.05] sm:text-6xl">
            Your job hunt, <span className="text-primary">organised.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            ApplyTrack keeps every job and internship application — deadlines, interviews, notes and outcomes — in one clear pipeline.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" asChild><Link to="/auth">Get started free</Link></Button>
          </div>
          <div className="mt-10 flex flex-wrap gap-2">
            {STATUSES.map((s) => <StatusBadge key={s.value} status={s.value} />)}
          </div>
        </div>
        <div className="mt-20 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, text }, i) => (
            <div key={title} className="animate-rise rounded-2xl border bg-card p-6 shadow-card" style={{ animationDelay: `${i * 60}ms` }}>
              <Icon className="size-5 text-primary" aria-hidden />
              <h2 className="mt-4 font-semibold">{title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
