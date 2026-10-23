import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import { Plus, Search, List as ListIcon, KanbanSquare, Pencil, Trash2, ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  applicationsQuery, STATUSES, TYPES, PRIORITIES, STATUS_LABEL, TYPE_LABEL,
  type Application, type ApplicationStatus,
} from "@/lib/applications";
import { StatusBadge, PriorityLabel, DeadlineChip, statusDot } from "@/components/StatusBadge";
import { ApplicationDialog } from "@/components/ApplicationDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/applications")({
  head: () => ({
    meta: [
      { title: "Applications — ApplyTrack" },
      { name: "description", content: "Search, filter and manage your job and internship applications." },
      { property: "og:title", content: "Applications — ApplyTrack" },
      { property: "og:description", content: "Search, filter and manage your applications." },
    ],
  }),
  component: ApplicationsPage,
});

type Sort = "updated" | "deadline" | "company" | "applied" | "priority";
const prioRank = { high: 0, medium: 1, low: 2 };

function ApplicationsPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery(applicationsQuery);
  const [view, setView] = useState<"list" | "board">("list");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [prio, setPrio] = useState("all");
  const [sort, setSort] = useState<Sort>("updated");
  const [editing, setEditing] = useState<Application | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<Application | null>(null);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const rows = (data ?? []).filter(
      (a) =>
        (!term || a.company.toLowerCase().includes(term) || a.role.toLowerCase().includes(term) || (a.notes ?? "").toLowerCase().includes(term)) &&
        (status === "all" || a.status === status) &&
        (type === "all" || a.type === type) &&
        (prio === "all" || a.priority === prio),
    );
    const s = [...rows];
    const nullLast = (x: string | null, y: string | null) => (x ? (y ? x.localeCompare(y) : -1) : y ? 1 : 0);
    if (sort === "company") s.sort((a, b) => a.company.localeCompare(b.company));
    if (sort === "deadline") s.sort((a, b) => nullLast(a.deadline, b.deadline));
    if (sort === "applied") s.sort((a, b) => nullLast(b.applied_date, a.applied_date));
    if (sort === "priority") s.sort((a, b) => prioRank[a.priority] - prioRank[b.priority]);
    return s;
  }, [data, q, status, type, prio, sort]);

  const moveStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ApplicationStatus }) => {
      const { error } = await supabase.from("applications").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ["applications"] });
      const prev = qc.getQueryData<Application[]>(["applications"]);
      qc.setQueryData<Application[]>(["applications"], (old) => old?.map((a) => (a.id === id ? { ...a, status } : a)));
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      qc.setQueryData(["applications"], ctx?.prev);
      toast.error("Couldn't change status", { description: e.message });
    },
    onSuccess: (_d, v) => toast.success(`Moved to ${STATUS_LABEL[v.status]}`),
    onSettled: () => qc.invalidateQueries({ queryKey: ["applications"] }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("applications").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Application deleted");
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ["applications"] });
    },
    onError: (e: Error) => toast.error("Couldn't delete", { description: e.message }),
  });

  const openNew = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (a: Application) => { setEditing(a); setDialogOpen(true); };
  const hasFilters = q || status !== "all" || type !== "all" || prio !== "all";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Applications</h1>
          <p className="text-sm text-muted-foreground">{data ? `${filtered.length} of ${data.length} shown` : "Loading…"}</p>
        </div>
        <div className="flex gap-2">
          <div className="flex rounded-lg border bg-card p-0.5" role="group" aria-label="View">
            <Button size="sm" variant={view === "list" ? "secondary" : "ghost"} onClick={() => setView("list")} aria-pressed={view === "list"}><ListIcon className="size-4" /> List</Button>
            <Button size="sm" variant={view === "board" ? "secondary" : "ghost"} onClick={() => setView("board")} aria-pressed={view === "board"}><KanbanSquare className="size-4" /> Board</Button>
          </div>
          <Button onClick={openNew}><Plus className="size-4" /> Add</Button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input placeholder="Search company, role or notes" className="bg-card pl-9" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        </div>
        <Filter label="Status" value={status} onChange={setStatus} opts={STATUSES} />
        <Filter label="Type" value={type} onChange={setType} opts={TYPES} />
        <Filter label="Priority" value={prio} onChange={setPrio} opts={PRIORITIES} />
        <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
          <SelectTrigger className="bg-card lg:w-44" aria-label="Sort"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="updated">Recently updated</SelectItem>
            <SelectItem value="deadline">Deadline (soonest)</SelectItem>
            <SelectItem value="applied">Applied (newest)</SelectItem>
            <SelectItem value="priority">Priority</SelectItem>
            <SelectItem value="company">Company A–Z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <p className="text-destructive">Couldn't load applications: {(error as Error).message}</p>
      ) : isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : data!.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
          <h2 className="text-lg font-semibold">Start your pipeline</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Save roles you're interested in, then move them forward as you apply and interview.</p>
          <Button className="mt-5" onClick={openNew}><Plus className="size-4" /> Add application</Button>
        </div>
      ) : view === "list" ? (
        filtered.length === 0 ? (
          <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
            No applications match your filters.{" "}
            {hasFilters && <button className="font-medium text-primary hover:underline" onClick={() => { setQ(""); setStatus("all"); setType("all"); setPrio("all"); }}>Clear filters</button>}
          </div>
        ) : (
          <ListView rows={filtered} onEdit={openEdit} onDelete={setDeleting} />
        )
      ) : (
        <Board rows={filtered} onEdit={openEdit} onMove={(id, s) => moveStatus.mutate({ id, status: s })} />
      )}

      <ApplicationDialog open={dialogOpen} onOpenChange={setDialogOpen} application={editing} />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && !del.isPending && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this application?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.role} at {deleting?.company} will be permanently removed. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={del.isPending}
              onClick={(e) => { e.preventDefault(); if (deleting) del.mutate(deleting.id); }}
            >
              {del.isPending && <Loader2 className="size-4 animate-spin" />} Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Filter({ label, value, onChange, opts }: { label: string; value: string; onChange: (v: string) => void; opts: { value: string; label: string }[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="bg-card lg:w-36" aria-label={`Filter by ${label.toLowerCase()}`}><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All {label.toLowerCase()}{label === "Status" ? "es" : label === "Priority" ? "" : "s"}</SelectItem>
        {opts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function ListView({ rows, onEdit, onDelete }: { rows: Application[]; onEdit: (a: Application) => void; onDelete: (a: Application) => void }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-card">
      <ul className="divide-y">
        {rows.map((a) => (
          <li key={a.id} className="flex flex-col gap-3 p-4 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{a.company}</p>
                <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-secondary-foreground">{TYPE_LABEL[a.type]}</span>
                <DeadlineChip app={a} />
              </div>
              <p className="truncate text-sm text-muted-foreground">{a.role}</p>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <span>Applied: {a.applied_date ? format(parseISO(a.applied_date), "MMM d, yyyy") : "—"}</span>
              <span>Deadline: {a.deadline ? format(parseISO(a.deadline), "MMM d, yyyy") : "—"}</span>
              <PriorityLabel priority={a.priority} />
              <StatusBadge status={a.status} />
              <div className="flex gap-1">
                {a.posting_url && (
                  <Button size="icon" variant="ghost" asChild>
                    <a href={a.posting_url} target="_blank" rel="noopener noreferrer" aria-label={`Open job posting for ${a.company}`}><ExternalLink className="size-4" /></a>
                  </Button>
                )}
                <Button size="icon" variant="ghost" onClick={() => onEdit(a)} aria-label={`Edit ${a.company}`}><Pencil className="size-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => onDelete(a)} aria-label={`Delete ${a.company}`}><Trash2 className="size-4 text-destructive" /></Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Board({ rows, onEdit, onMove }: { rows: Application[]; onEdit: (a: Application) => void; onMove: (id: string, s: ApplicationStatus) => void }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  function onDragEnd(e: DragEndEvent) {
    const to = e.over?.id as ApplicationStatus | undefined;
    const app = rows.find((r) => r.id === e.active.id);
    if (to && app && app.status !== to) onMove(app.id, to);
  }
  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <p className="text-xs text-muted-foreground">Drag cards between columns to change their status.</p>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
        {STATUSES.map((s) => (
          <Column key={s.value} status={s.value} label={s.label} items={rows.filter((r) => r.status === s.value)} onEdit={onEdit} />
        ))}
      </div>
    </DndContext>
  );
}

function Column({ status, label, items, onEdit }: { status: ApplicationStatus; label: string; items: Application[]; onEdit: (a: Application) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div ref={setNodeRef} className={cn("flex w-64 shrink-0 flex-col rounded-xl border bg-muted/50 p-2 transition-colors", isOver && "border-primary bg-accent")}>
      <div className="flex items-center gap-2 px-2 py-2 text-sm font-semibold">
        <span className={cn("size-2 rounded-full", statusDot[status])} /> {label}
        <span className="ml-auto text-xs font-normal text-muted-foreground">{items.length}</span>
      </div>
      <div className="flex min-h-24 flex-col gap-2">
        {items.map((a) => <Card key={a.id} app={a} onEdit={onEdit} />)}
      </div>
    </div>
  );
}

function Card({ app, onEdit }: { app: Application; onEdit: (a: Application) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: app.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={cn("cursor-grab touch-none rounded-lg border bg-card p-3 shadow-card active:cursor-grabbing", isDragging && "z-50 opacity-80 ring-2 ring-primary")}
      aria-label={`${app.company}, ${app.role}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold">{app.company}</p>
        <button onPointerDown={(e) => e.stopPropagation()} onClick={() => onEdit(app)} className="text-muted-foreground hover:text-foreground" aria-label={`Edit ${app.company}`}>
          <Pencil className="size-3.5" />
        </button>
      </div>
      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{app.role}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <PriorityLabel priority={app.priority} />
        <span className="text-[11px] text-muted-foreground">{TYPE_LABEL[app.type]}</span>
        <DeadlineChip app={app} />
      </div>
    </div>
  );
}
