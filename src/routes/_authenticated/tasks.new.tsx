import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { createTask } from "@/lib/tasks.functions";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/tasks/new")({
  validateSearch: z.object({ classroomId: z.string().uuid() }),
  head: () => ({ meta: [{ title: "Nova tarefa — CodeClass" }, { name: "description", content: "Criar uma nova tarefa para a turma." }] }),
  component: NewTaskPage,
});

const LANGS = ["javascript", "python", "java", "c", "cpp"] as const;

function NewTaskPage() {
  const { classroomId } = Route.useSearch();
  const navigate = useNavigate();
  const fn = useServerFn(createTask);
  const [type, setType] = useState<"coding" | "trivia" | "quiz">("coding");
  const [title, setTitle] = useState("");
  const [statement, setStatement] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [starter, setStarter] = useState("");
  const [allowedLangs, setAllowedLangs] = useState<string[]>([...LANGS]);
  const [trivia, setTrivia] = useState<{ prompt: string; options: string[]; correct_index: number; time_limit_sec: number }[]>([
    { prompt: "", options: ["", ""], correct_index: 0, time_limit_sec: 30 },
  ]);
  const [quiz, setQuiz] = useState<Array<{ kind: "multiple"; prompt: string; options: string[]; correct_index: number } | { kind: "essay"; prompt: string }>>([
    { kind: "essay", prompt: "" },
  ]);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      let payload;
      if (type === "coding") {
        payload = { type: "coding" as const, classroom_id: classroomId, title, statement, due_at: dueAt ? new Date(dueAt).toISOString() : null, config: { starter_code: starter, allowed_languages: allowedLangs as ("javascript"|"python"|"java"|"c"|"cpp")[] } };
      } else if (type === "trivia") {
        payload = { type: "trivia" as const, classroom_id: classroomId, title, statement, due_at: dueAt ? new Date(dueAt).toISOString() : null, config: { questions: trivia } };
      } else {
        payload = { type: "quiz" as const, classroom_id: classroomId, title, statement, due_at: dueAt ? new Date(dueAt).toISOString() : null, config: { questions: quiz } };
      }
      const created = await fn({ data: payload });
      toast.success("Tarefa criada");
      navigate({ to: "/tasks/$taskId", params: { taskId: created.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally { setLoading(false); }
  };

  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-2xl font-bold">Nova tarefa</h1>

      <div className="grid grid-cols-3 gap-2">
        {(["coding", "trivia", "quiz"] as const).map(t => (
          <button key={t} type="button" onClick={() => setType(t)}
            className={`rounded-md border px-3 py-2 text-sm font-medium ${type === t ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent"}`}>
            {t === "coding" ? "Codificação" : t === "trivia" ? "Trivia" : "Questionário"}
          </button>
        ))}
      </div>

      <Field label="Título"><input required value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm" /></Field>
      <Field label="Enunciado"><textarea required value={statement} onChange={(e) => setStatement(e.target.value)} rows={5} className="w-full rounded-md border bg-background px-3 py-2 text-sm" /></Field>
      <Field label="Prazo de entrega (opcional)"><input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm" /></Field>

      {type === "coding" && (
        <div className="space-y-3 rounded-lg border bg-card p-4">
          <Field label="Código inicial (opcional)"><textarea value={starter} onChange={(e) => setStarter(e.target.value)} rows={4} className="w-full rounded-md border bg-background px-3 py-2 font-mono text-xs" /></Field>
          <div>
            <span className="mb-2 block text-sm font-medium">Linguagens permitidas</span>
            <div className="flex flex-wrap gap-2">
              {LANGS.map(l => (
                <label key={l} className={`cursor-pointer rounded-md border px-3 py-1 text-xs ${allowedLangs.includes(l) ? "border-primary bg-primary/10 text-primary" : ""}`}>
                  <input type="checkbox" className="hidden" checked={allowedLangs.includes(l)} onChange={(e) => setAllowedLangs(e.target.checked ? [...allowedLangs, l] : allowedLangs.filter(x => x !== l))} />
                  {l}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {type === "trivia" && (
        <div className="space-y-3">
          {trivia.map((q, qi) => (
            <div key={qi} className="space-y-2 rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Pergunta {qi + 1}</span>
                {trivia.length > 1 && <button type="button" onClick={() => setTrivia(trivia.filter((_, i) => i !== qi))} className="text-destructive"><Trash2 className="h-4 w-4" /></button>}
              </div>
              <input required value={q.prompt} onChange={(e) => { const c = [...trivia]; c[qi].prompt = e.target.value; setTrivia(c); }} placeholder="Enunciado" className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
              {q.options.map((o, oi) => (
                <div key={oi} className="flex gap-2">
                  <input type="radio" checked={q.correct_index === oi} onChange={() => { const c = [...trivia]; c[qi].correct_index = oi; setTrivia(c); }} />
                  <input required value={o} onChange={(e) => { const c = [...trivia]; c[qi].options[oi] = e.target.value; setTrivia(c); }} placeholder={`Alternativa ${oi + 1}`} className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm" />
                </div>
              ))}
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => { const c = [...trivia]; c[qi].options.push(""); setTrivia(c); }} className="text-xs text-primary">+ Alternativa</button>
                <label className="text-xs flex items-center gap-2">Tempo (s): <input type="number" min={5} max={600} value={q.time_limit_sec} onChange={(e) => { const c = [...trivia]; c[qi].time_limit_sec = Number(e.target.value); setTrivia(c); }} className="w-20 rounded-md border bg-background px-2 py-1" /></label>
              </div>
            </div>
          ))}
          <button type="button" onClick={() => setTrivia([...trivia, { prompt: "", options: ["", ""], correct_index: 0, time_limit_sec: 30 }])} className="inline-flex items-center gap-1 text-sm text-primary"><Plus className="h-4 w-4" /> Adicionar pergunta</button>
        </div>
      )}

      {type === "quiz" && (
        <div className="space-y-3">
          {quiz.map((q, qi) => (
            <div key={qi} className="space-y-2 rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between">
                <select value={q.kind} onChange={(e) => {
                  const c = [...quiz]; const v = e.target.value;
                  c[qi] = v === "essay" ? { kind: "essay", prompt: q.prompt } : { kind: "multiple", prompt: q.prompt, options: ["", ""], correct_index: 0 };
                  setQuiz(c);
                }} className="rounded-md border bg-background px-2 py-1 text-xs">
                  <option value="essay">Dissertativa</option>
                  <option value="multiple">Alternativa</option>
                </select>
                {quiz.length > 1 && <button type="button" onClick={() => setQuiz(quiz.filter((_, i) => i !== qi))} className="text-destructive"><Trash2 className="h-4 w-4" /></button>}
              </div>
              <input required value={q.prompt} onChange={(e) => { const c = [...quiz]; c[qi] = { ...c[qi], prompt: e.target.value } as typeof c[number]; setQuiz(c); }} placeholder="Enunciado" className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
              {q.kind === "multiple" && q.options.map((o, oi) => (
                <div key={oi} className="flex gap-2">
                  <input type="radio" checked={q.correct_index === oi} onChange={() => { const c = [...quiz]; const it = c[qi] as Extract<typeof c[number], { kind: "multiple" }>; it.correct_index = oi; setQuiz(c); }} />
                  <input required value={o} onChange={(e) => { const c = [...quiz]; const it = c[qi] as Extract<typeof c[number], { kind: "multiple" }>; it.options[oi] = e.target.value; setQuiz(c); }} placeholder={`Alternativa ${oi + 1}`} className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm" />
                </div>
              ))}
              {q.kind === "multiple" && <button type="button" onClick={() => { const c = [...quiz]; (c[qi] as Extract<typeof c[number], { kind: "multiple" }>).options.push(""); setQuiz(c); }} className="text-xs text-primary">+ Alternativa</button>}
            </div>
          ))}
          <button type="button" onClick={() => setQuiz([...quiz, { kind: "essay", prompt: "" }])} className="inline-flex items-center gap-1 text-sm text-primary"><Plus className="h-4 w-4" /> Adicionar pergunta</button>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => navigate({ to: "/classrooms/$id", params: { id: classroomId } })} className="rounded-md border px-4 py-2 text-sm hover:bg-accent">Cancelar</button>
        <button disabled={loading} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
          {loading ? "Criando..." : "Criar tarefa"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}
