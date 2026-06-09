import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { myTasksOverview } from "@/lib/tasks.functions";
import { CheckCircle2, AlertTriangle, Clock, ListChecks } from "lucide-react";

type Filter = "all" | "delivered" | "overdue" | "on_time";

export const Route = createFileRoute("/_authenticated/tasks/")({
  head: () => ({ meta: [{ title: "Minhas tarefas — CodeClass" }] }),
  component: MyTasksPage,
});

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "on_time", label: "No prazo" },
  { key: "overdue", label: "Atrasadas" },
  { key: "delivered", label: "Entregues" },
];

function MyTasksPage() {
  const fn = useServerFn(myTasksOverview);
  const { data: tasks } = useSuspenseQuery({ queryKey: ["my-tasks-overview"], queryFn: () => fn() });
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(() => ({
    all: tasks.length,
    delivered: tasks.filter(t => t.my_status === "delivered").length,
    overdue: tasks.filter(t => t.my_status === "overdue").length,
    on_time: tasks.filter(t => t.my_status === "on_time").length,
  }), [tasks]);

  const filtered = filter === "all" ? tasks : tasks.filter(t => t.my_status === filter);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ListChecks className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Minhas tarefas</h1>
          <p className="text-sm text-muted-foreground">Todas as tarefas recebidas em suas salas.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full border px-3 py-1.5 text-sm transition ${
              filter === f.key
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card text-foreground hover:bg-accent"
            }`}
          >
            {f.label} <span className="ml-1 opacity-70">({counts[f.key]})</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-10 text-center">
          <p className="font-medium text-foreground">Nenhuma tarefa</p>
          <p className="mt-1 text-sm text-muted-foreground">Não há tarefas neste filtro.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(t => <TaskRow key={t.id} t={t} />)}
        </div>
      )}
    </div>
  );
}

function TaskRow({ t }: { t: Awaited<ReturnType<typeof myTasksOverview>>[number] }) {
  return (
    <Link
      to="/tasks/$taskId"
      params={{ taskId: t.id }}
      className="flex items-center justify-between gap-4 rounded-lg border bg-card p-4 hover:bg-accent"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <StatusBadge status={t.my_status} />
          <div className="truncate font-medium text-foreground">{t.title}</div>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {t.classroom?.name} · {t.type}
        </div>
      </div>
      <div className="text-right text-xs text-muted-foreground">
        {t.my_status === "delivered" && t.submission?.grade != null && (
          <div className="text-sm font-semibold text-foreground">
            {t.submission.grade}<span className="text-xs text-muted-foreground">/100</span>
          </div>
        )}
        {t.due_at ? (
          <>Entrega: <span className="font-medium text-foreground">{new Date(t.due_at).toLocaleString("pt-BR")}</span></>
        ) : "Sem prazo"}
      </div>
    </Link>
  );
}

function StatusBadge({ status }: { status: "delivered" | "overdue" | "on_time" }) {
  if (status === "delivered") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-3 w-3" /> Entregue
      </span>
    );
  }
  if (status === "overdue") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">
        <AlertTriangle className="h-3 w-3" /> Atrasada
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
      <Clock className="h-3 w-3" /> No prazo
    </span>
  );
}
