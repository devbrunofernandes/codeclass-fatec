import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { teacherReviewsOverview } from "@/lib/tasks.functions";
import { CheckCircle2, Clock, Sparkles, ClipboardCheck } from "lucide-react";

type Filter = "all" | "pending" | "corrected" | "auto";

export const Route = createFileRoute("/_authenticated/reviews/")({
  head: () => ({ meta: [{ title: "Correções — CodeClass" }] }),
  component: ReviewsPage,
});

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "pending", label: "Pendentes" },
  { key: "corrected", label: "Corrigidas" },
  { key: "auto", label: "Automáticas" },
];

function ReviewsPage() {
  const fn = useServerFn(teacherReviewsOverview);
  const { data: rows } = useSuspenseQuery({ queryKey: ["teacher-reviews-overview"], queryFn: () => fn() });
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(() => ({
    all: rows.length,
    pending: rows.filter(r => r.review_status === "pending").length,
    corrected: rows.filter(r => r.review_status === "corrected").length,
    auto: rows.filter(r => r.review_status === "auto").length,
  }), [rows]);

  const filtered = filter === "all" ? rows : rows.filter(r => r.review_status === filter);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Correções</h1>
          <p className="text-sm text-muted-foreground">Submissões dos alunos em suas salas.</p>
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
          <p className="font-medium text-foreground">Nenhuma submissão</p>
          <p className="mt-1 text-sm text-muted-foreground">Não há submissões neste filtro.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => <ReviewRow key={r.id} r={r} />)}
        </div>
      )}
    </div>
  );
}

function ReviewRow({ r }: { r: Awaited<ReturnType<typeof teacherReviewsOverview>>[number] }) {
  const task = r.task as any;
  const isAuto = r.review_status === "auto";
  return (
    <Link
      to={isAuto ? "/tasks/$taskId" : "/tasks/$taskId/submissions/$submissionId"}
      params={isAuto ? { taskId: task.id } : { taskId: task.id, submissionId: r.id }}
      className="flex items-center justify-between gap-4 rounded-lg border bg-card p-4 hover:bg-accent"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <StatusBadge status={r.review_status} />
          <div className="truncate font-medium text-foreground">{task?.title}</div>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {task?.classroom?.name} · {task?.type} · Aluno:{" "}
          <span className="text-foreground">{r.student?.full_name ?? "—"}</span>
        </div>
      </div>
      <div className="text-right text-xs text-muted-foreground">
        {r.grade != null && (
          <div className="text-sm font-semibold text-foreground">
            {r.grade}<span className="text-xs text-muted-foreground">/100</span>
          </div>
        )}
        Enviado: <span className="font-medium text-foreground">{new Date(r.submitted_at).toLocaleString("pt-BR")}</span>
      </div>
    </Link>
  );
}

function StatusBadge({ status }: { status: "pending" | "corrected" | "auto" }) {
  if (status === "corrected") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-3 w-3" /> Corrigida
      </span>
    );
  }
  if (status === "auto") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
        <Sparkles className="h-3 w-3" /> Automática
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
      <Clock className="h-3 w-3" /> Pendente
    </span>
  );
}
