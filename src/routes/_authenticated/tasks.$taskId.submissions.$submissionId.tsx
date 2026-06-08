import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { getTask, listSubmissionsForTask, returnSubmission } from "@/lib/tasks.functions";
import { aiReviewCode } from "@/lib/code.functions";
import { ArrowLeft, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/tasks/$taskId/submissions/$submissionId")({
  head: () => ({ meta: [{ title: "Correção — CodeClass" }, { name: "description", content: "Corrigir submissão de tarefa." }] }),
  component: ReviewPage,
});

function ReviewPage() {
  const { taskId, submissionId } = Route.useParams();
  const navigate = useNavigate();
  const getFn = useServerFn(getTask);
  const listFn = useServerFn(listSubmissionsForTask);
  const { data: taskData } = useSuspenseQuery({ queryKey: ["task", taskId], queryFn: () => getFn({ data: { id: taskId } }) });
  const { data: subs } = useSuspenseQuery({ queryKey: ["submissions", taskId], queryFn: () => listFn({ data: { task_id: taskId } }) });
  const task = taskData.task;
  const sub = subs.find(s => s.id === submissionId);

  if (!sub) {
    return (
      <div className="space-y-3">
        <Link to="/tasks/$taskId" params={{ taskId }} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Voltar para a tarefa</Link>
        <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">Submissão não encontrada.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link to="/tasks/$taskId" params={{ taskId }} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar para a tarefa
      </Link>
      <div className="rounded-xl border bg-card p-6">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Corrigindo</div>
        <h1 className="mt-1 text-2xl font-bold text-foreground">{task.title}</h1>
        <div className="mt-2 text-sm text-muted-foreground">Aluno: <strong className="text-foreground">{sub.student?.full_name}</strong> · Enviado {new Date(sub.submitted_at).toLocaleString("pt-BR")}</div>
      </div>
      <ReviewPanel sub={sub} task={task} onSaved={() => navigate({ to: "/tasks/$taskId", params: { taskId } })} />
    </div>
  );
}

function QuizReview({ task, answers }: { task: any; answers: any[] }) {
  const questions = (task.config?.questions ?? []) as Array<any>;
  return (
    <div className="space-y-3">
      {questions.map((q, qi) => {
        const studentAnswer = answers?.[qi];
        if (q.kind === "multiple") {
          const studentIdx = typeof studentAnswer === "number" ? studentAnswer : -1;
          const isCorrect = studentIdx === q.correct_index;
          return (
            <div key={qi} className="rounded-lg border bg-card p-4">
              <div className="mb-1 text-xs text-muted-foreground">Questão {qi + 1} · Alternativa — {isCorrect ? "✅ Correta" : "❌ Incorreta"}</div>
              <div className="mb-3 font-medium">{q.prompt}</div>
              <div className="space-y-1">
                {q.options.map((opt: string, oi: number) => {
                  const isStudent = studentIdx === oi;
                  const isRight = q.correct_index === oi;
                  const cls = isRight
                    ? "border-emerald-500 bg-emerald-500/10"
                    : isStudent
                      ? "border-destructive bg-destructive/10"
                      : "border-border";
                  return (
                    <div key={oi} className={`rounded-md border px-3 py-2 text-sm ${cls}`}>
                      <span>{opt}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {isStudent && isRight && "(aluno — correta)"}
                        {isStudent && !isRight && "(resposta do aluno)"}
                        {!isStudent && isRight && "(resposta correta)"}
                      </span>
                    </div>
                  );
                })}
                {studentIdx === -1 && <div className="text-xs text-muted-foreground">Aluno não respondeu.</div>}
              </div>
            </div>
          );
        }
        return (
          <div key={qi} className="rounded-lg border bg-card p-4">
            <div className="mb-1 text-xs text-muted-foreground">Questão {qi + 1} · Dissertativa</div>
            <div className="mb-2 font-medium">{q.prompt}</div>
            <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Resposta do aluno</div>
            <div className="whitespace-pre-wrap rounded-md border bg-muted p-3 text-sm">
              {typeof studentAnswer === "string" && studentAnswer.trim() ? studentAnswer : <span className="text-muted-foreground">Sem resposta.</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TriviaReview({ task, answers }: { task: any; answers: number[] }) {
  const questions = (task.config?.questions ?? []) as Array<{ prompt: string; options: string[]; correct_index: number }>;
  return (
    <div className="space-y-3">
      {questions.map((q, qi) => {
        const raw = answers?.[qi];
        const studentIdx = typeof raw === "number" ? raw : -1;
        const isCorrect = studentIdx === q.correct_index;
        return (
          <div key={qi} className="rounded-lg border bg-card p-4">
            <div className="mb-1 text-xs text-muted-foreground">Pergunta {qi + 1} — {studentIdx === -1 ? "Sem resposta" : isCorrect ? "✅ Correta" : "❌ Incorreta"}</div>
            <div className="mb-3 font-medium">{q.prompt}</div>
            <div className="space-y-1">
              {q.options.map((opt, oi) => {
                const isStudent = studentIdx === oi;
                const isRight = q.correct_index === oi;
                const cls = isRight
                  ? "border-emerald-500 bg-emerald-500/10"
                  : isStudent
                    ? "border-destructive bg-destructive/10"
                    : "border-border";
                return (
                  <div key={oi} className={`rounded-md border px-3 py-2 text-sm ${cls}`}>
                    <span>{opt}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {isStudent && isRight && "(aluno — correta)"}
                      {isStudent && !isRight && "(resposta do aluno)"}
                      {!isStudent && isRight && "(resposta correta)"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AiFeedback({ fb }: { fb: any }) {
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div><div className="text-xs font-semibold uppercase text-muted-foreground">{title}</div><div>{children}</div></div>
  );
  const List = ({ items }: { items?: string[] }) => {
    if (!items?.length) return <span className="text-muted-foreground">—</span>;
    return <ul className="list-disc pl-5">{items.map((i, idx) => <li key={idx}>{i}</li>)}</ul>;
  };
  return (
    <div className="space-y-3 text-sm">
      <Section title="Resumo">{fb.summary}</Section>
      <Section title="Pontos fortes"><List items={fb.strengths} /></Section>
      <Section title="Melhorias"><List items={fb.improvements} /></Section>
      <Section title="Complexidade">{fb.complexity}</Section>
      <Section title="Sugestões"><List items={fb.suggestions} /></Section>
    </div>
  );
}

function ReviewPanel({ sub, task, onSaved }: { sub: any; task: any; onSaved: () => void }) {
  const fn = useServerFn(returnSubmission);
  const aiFn = useServerFn(aiReviewCode);
  const qc = useQueryClient();
  const [grade, setGrade] = useState<string>(sub.grade?.toString() ?? "");
  const [feedback, setFeedback] = useState(sub.teacher_feedback ?? "");
  const [saving, setSaving] = useState(false);
  const [askingAi, setAskingAi] = useState(false);
  const [aiFb, setAiFb] = useState<any>(sub.ai_feedback);

  const source = (sub.content as { source?: string })?.source ?? null;
  const answers = (sub.content as { answers?: any[] })?.answers ?? [];

  const save = async () => {
    setSaving(true);
    try {
      await fn({ data: { submission_id: sub.id, grade: grade === "" ? null : Number(grade), feedback } });
      toast.success("Devolutiva enviada");
      qc.invalidateQueries({ queryKey: ["submissions", task.id] });
      onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
    finally { setSaving(false); }
  };

  const askAi = async () => {
    if (!source) { toast.error("Sem código para analisar"); return; }
    setAskingAi(true);
    try {
      const fb = await aiFn({ data: { task_statement: "", language: sub.language ?? "javascript", source, submission_id: sub.id } });
      setAiFb(fb);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
    finally { setAskingAi(false); }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4">
        <div className="mb-3 text-sm font-medium">Resposta do aluno</div>
        {task.type === "coding" && source && (
          <pre className="overflow-auto rounded-md bg-muted p-3 font-mono text-xs">{source}</pre>
        )}
        {task.type === "quiz" && <QuizReview task={task} answers={answers} />}
        {task.type === "trivia" && <TriviaReview task={task} answers={answers as number[]} />}
        {!source && task.type === "coding" && (
          <pre className="overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(sub.content, null, 2)}</pre>
        )}
      </div>

      {source && (
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium"><Sparkles className="h-4 w-4 text-primary" /> Análise da IA</div>
            <button onClick={askAi} disabled={askingAi} className="rounded-md border px-2 py-1 text-xs hover:bg-accent">{askingAi ? "Analisando..." : "Rodar IA"}</button>
          </div>
          {aiFb && <div className="mt-2"><AiFeedback fb={aiFb} /></div>}
        </div>
      )}

      <div className="rounded-lg border bg-card p-4 space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Nota (0-100, opcional)</span>
          <input type="number" min={0} max={100} value={grade} onChange={(e) => setGrade(e.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Comentário</span>
          <textarea required value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={5} className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
        </label>
        <button onClick={save} disabled={saving} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
          {saving ? "Enviando..." : "Enviar devolutiva"}
        </button>
      </div>
    </div>
  );
}
