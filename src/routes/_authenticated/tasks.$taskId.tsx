import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import Editor from "@monaco-editor/react";
import { getTask, submitTask, listSubmissionsForTask } from "@/lib/tasks.functions";
import { runCode, aiReviewCode } from "@/lib/code.functions";
import { me } from "@/lib/auth.functions";
import { Play, Send, Sparkles, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/tasks/$taskId")({
  head: () => ({ meta: [{ title: "Tarefa — CodeClass" }, { name: "description", content: "Realizar uma tarefa." }] }),
  component: TaskPage,
});

function useBackToClassroom(classroomId: string) {
  const navigate = useNavigate();
  return () => navigate({ to: "/classrooms/$id", params: { id: classroomId } });
}

function TaskPage() {
  const { taskId } = Route.useParams();
  const getFn = useServerFn(getTask);
  const meFn = useServerFn(me);
  const { data } = useSuspenseQuery({ queryKey: ["task", taskId], queryFn: () => getFn({ data: { id: taskId } }) });
  const { data: meData } = useSuspenseQuery({ queryKey: ["me"], queryFn: () => meFn() });
  const isTeacher = meData.role === "teacher";
  const task = data.task;

  return (
    <div className="space-y-4">
      <Link to="/classrooms/$id" params={{ id: task.classroom_id }} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar para a sala
      </Link>
      <div className="rounded-xl border bg-card p-6">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {task.type === "coding" ? "Codificação" : task.type === "trivia" ? "Trivia" : "Questionário"}
        </div>
        <h1 className="mt-1 text-2xl font-bold text-foreground">{task.title}</h1>
        <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">{task.statement}</p>
        {task.due_at && <div className="mt-3 text-xs text-muted-foreground">Entrega: {new Date(task.due_at).toLocaleString("pt-BR")}</div>}
      </div>

      {isTeacher ? (
        <TeacherView taskId={taskId} classroomId={task.classroom_id} />
      ) : task.type === "coding" ? (
        <CodingRunner task={task} mySub={data.my_submission} />
      ) : task.type === "trivia" ? (
        <TriviaRunner task={task} mySub={data.my_submission} />
      ) : (
        <QuizRunner task={task} mySub={data.my_submission} />
      )}
    </div>
  );
}

/* ---------- STUDENT: CODING ---------- */

function CodingRunner({ task, mySub }: { task: any; mySub: any }) {
  const config = task.config as { starter_code?: string; allowed_languages?: string[] };
  const allowed = config.allowed_languages?.length ? config.allowed_languages : ["javascript", "python", "java", "c", "cpp"];
  const [lang, setLang] = useState<string>(mySub?.language ?? allowed[0]);
  const [code, setCode] = useState<string>((mySub?.content as { source?: string })?.source ?? config.starter_code ?? "");
  const [stdout, setStdout] = useState("");
  const [stderr, setStderr] = useState("");
  const [aiFeedback, setAiFeedback] = useState<any>(mySub?.ai_feedback ?? null);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [askingAi, setAskingAi] = useState(false);

  const runFn = useServerFn(runCode);
  const submitFn = useServerFn(submitTask);
  const aiFn = useServerFn(aiReviewCode);
  const backToClassroom = useBackToClassroom(task.classroom_id);

  const onPaste = () => { toast.warning("Cole detectado — recomendamos digitar o código você mesmo."); };

  const run = async () => {
    setRunning(true); setStdout(""); setStderr("");
    try {
      const r = await runFn({ data: { language: lang, source: code } });
      setStdout(r.stdout);
      setStderr(r.compile_stderr || r.stderr);
      if (r.timed_out) toast.error("Tempo limite excedido (3s)");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally { setRunning(false); }
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const sub = await submitFn({ data: { task_id: task.id, content: { source: code }, language: lang } });
      toast.success("Tarefa enviada");
      aiFn({ data: { task_statement: task.statement, language: lang, source: code, submission_id: sub.id } }).catch(() => {});
      backToClassroom();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally { setSubmitting(false); }
  };

  const monacoLang = lang === "cpp" ? "cpp" : lang === "c" ? "c" : lang === "java" ? "java" : lang === "python" ? "python" : "javascript";

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <select value={lang} onChange={(e) => setLang(e.target.value)} disabled={mySub?.status === "returned"} className="rounded-md border bg-background px-3 py-2 text-sm">
            {allowed.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <button type="button" onClick={run} disabled={running} className="inline-flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm hover:bg-accent disabled:opacity-60">
            <Play className="h-4 w-4" /> {running ? "Executando..." : "Executar"}
          </button>
          <button type="button" onClick={submit} disabled={submitting || mySub?.status === "returned"} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            <Send className="h-4 w-4" /> {submitting ? "Enviando..." : "Enviar"}
          </button>
        </div>
        <div className="overflow-hidden rounded-lg border" onPaste={onPaste}>
          <Editor
            height="500px"
            theme="vs-dark"
            language={monacoLang}
            value={code}
            onChange={(v) => setCode(v ?? "")}
            options={{ minimap: { enabled: false }, fontSize: 14, readOnly: mySub?.status === "returned" }}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">Saída</div>
            <pre className="h-40 overflow-auto rounded-md border bg-card p-3 text-xs">{stdout || "—"}</pre>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">Erros</div>
            <pre className="h-40 overflow-auto rounded-md border bg-card p-3 text-xs text-destructive">{stderr || "—"}</pre>
          </div>
        </div>
      </div>

      <aside className="space-y-3">
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium"><Sparkles className="h-4 w-4 text-primary" /> Análise da IA</div>
          {askingAi && <div className="text-sm text-muted-foreground">Analisando...</div>}
          {!askingAi && !aiFeedback && <div className="text-sm text-muted-foreground">A análise aparece após o envio.</div>}
          {aiFeedback && <AiFeedback fb={aiFeedback} />}
        </div>

        {mySub?.status === "returned" && (
          <div className="rounded-lg border bg-card p-4">
            <div className="mb-1 text-sm font-medium">Devolutiva do professor</div>
            {mySub.grade != null && <div className="mb-2 text-sm">Nota: <strong>{mySub.grade}</strong></div>}
            <p className="whitespace-pre-wrap text-sm text-foreground">{mySub.teacher_feedback}</p>
          </div>
        )}
      </aside>
    </div>
  );
}

function AiFeedback({ fb }: { fb: any }) {
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
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><div className="text-xs font-semibold uppercase text-muted-foreground">{title}</div><div>{children}</div></div>;
}
function List({ items }: { items?: string[] }) {
  if (!items?.length) return <span className="text-muted-foreground">—</span>;
  return <ul className="list-disc pl-5">{items.map((i, idx) => <li key={idx}>{i}</li>)}</ul>;
}

/* ---------- STUDENT: TRIVIA ---------- */

function TriviaRunner({ task, mySub }: { task: any; mySub: any }) {
  const questions = (task.config.questions ?? []) as Array<{ prompt: string; options: string[]; correct_index: number; time_limit_sec: number }>;
  const order = useMemo(() => questions.map((_, i) => i).sort(() => Math.random() - 0.5), [questions.length]);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<number[]>(
    ((mySub?.content as { answers?: number[] })?.answers) ?? Array(questions.length).fill(-1),
  );
  const [timeLeft, setTimeLeft] = useState(questions[order[0]]?.time_limit_sec ?? 30);
  const timerRef = useRef<number | null>(null);
  const submitFn = useServerFn(submitTask);
  const backToClassroom = useBackToClassroom(task.classroom_id);
  const [submitted, setSubmitted] = useState<boolean>(mySub?.status === "submitted" || mySub?.status === "returned");

  useEffect(() => {
    if (submitted || step >= order.length) return;
    setTimeLeft(questions[order[step]].time_limit_sec);
    timerRef.current = window.setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { next(); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) window.clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, submitted]);

  const choose = (oi: number) => {
    const c = [...answers]; c[order[step]] = oi; setAnswers(c);
  };
  const next = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (step + 1 < order.length) setStep(step + 1);
    else finalize();
  };
  const finalize = async () => {
    try {
      const correct = questions.reduce((acc, q, i) => acc + (answers[i] === q.correct_index ? 1 : 0), 0);
      const grade = Math.round((correct / questions.length) * 100);
      await submitFn({ data: { task_id: task.id, content: { answers }, grade, auto_return: true } });
      toast.success(`Respostas enviadas — ${correct}/${questions.length} acertos`);
      setSubmitted(true);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  };

  if (submitted) {
    const finalAnswers = answers.length === questions.length
      ? answers
      : ((mySub?.content as { answers?: number[] })?.answers ?? answers);
    const correct = questions.reduce((acc, q, i) => acc + (finalAnswers[i] === q.correct_index ? 1 : 0), 0);
    return (
      <div className="space-y-4">
        <div className="rounded-lg border bg-card p-6 text-sm">
          Trivia enviada. Acertos: <strong>{correct} / {questions.length}</strong> ({Math.round((correct / questions.length) * 100)}%)
        </div>
        <div className="space-y-3">
          {questions.map((q, qi) => {
            const studentIdx = finalAnswers[qi];
            const isCorrect = studentIdx === q.correct_index;
            return (
              <div key={qi} className="rounded-lg border bg-card p-4">
                <div className="mb-1 text-xs text-muted-foreground">Pergunta {qi + 1} — {isCorrect ? "✅ Correta" : "❌ Incorreta"}</div>
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
                          {isStudent && isRight && "(sua resposta — correta)"}
                          {isStudent && !isRight && "(sua resposta)"}
                          {!isStudent && isRight && "(resposta correta)"}
                        </span>
                      </div>
                    );
                  })}
                  {studentIdx === -1 && <div className="text-xs text-muted-foreground">Você não respondeu esta pergunta.</div>}
                </div>
              </div>
            );
          })}
        </div>
        <button onClick={backToClassroom} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          Voltar para a sala
        </button>
      </div>
    );
  }

  const q = questions[order[step]];
  return (
    <div className="rounded-lg border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div>Pergunta {step + 1} / {order.length}</div>
        <div>Tempo: <strong className="text-foreground">{timeLeft}s</strong></div>
      </div>
      <div className="text-lg font-medium">{q.prompt}</div>
      <div className="space-y-2">
        {q.options.map((opt, oi) => (
          <button key={oi} onClick={() => choose(oi)}
            className={`block w-full rounded-md border px-3 py-2 text-left text-sm ${answers[order[step]] === oi ? "border-primary bg-primary/10" : "hover:bg-accent"}`}>
            {opt}
          </button>
        ))}
      </div>
      <button onClick={next} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
        {step + 1 === order.length ? "Finalizar" : "Próxima"}
      </button>
    </div>
  );
}

/* ---------- STUDENT: QUIZ ---------- */

function QuizRunner({ task, mySub }: { task: any; mySub: any }) {
  const questions = (task.config.questions ?? []) as Array<any>;
  const initial = (mySub?.content as { answers?: any[] })?.answers ?? questions.map(() => "");
  const [answers, setAnswers] = useState<any[]>(initial);
  const submitFn = useServerFn(submitTask);
  const backToClassroom = useBackToClassroom(task.classroom_id);
  const done = mySub?.status === "submitted" || mySub?.status === "returned";

  const submit = async () => {
    try {
      await submitFn({ data: { task_id: task.id, content: { answers } } });
      toast.success("Questionário enviado");
      backToClassroom();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  };

  return (
    <div className="space-y-3">
      {questions.map((q, qi) => (
        <div key={qi} className="rounded-lg border bg-card p-4">
          <div className="mb-2 font-medium">{qi + 1}. {q.prompt}</div>
          {q.kind === "multiple" ? (
            <div className="space-y-1">
              {q.options.map((o: string, oi: number) => (
                <label key={oi} className="flex items-center gap-2 text-sm">
                  <input type="radio" disabled={done} checked={answers[qi] === oi} onChange={() => { const c = [...answers]; c[qi] = oi; setAnswers(c); }} />
                  {o}
                </label>
              ))}
            </div>
          ) : (
            <textarea disabled={done} value={answers[qi] ?? ""} onChange={(e) => { const c = [...answers]; c[qi] = e.target.value; setAnswers(c); }} rows={3} className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
          )}
        </div>
      ))}
      {!done && (
        <button onClick={submit} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Enviar respostas</button>
      )}
      {mySub?.status === "returned" && (
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-1 text-sm font-medium">Devolutiva</div>
          {mySub.grade != null && <div className="text-sm">Nota: <strong>{mySub.grade}</strong></div>}
          <p className="whitespace-pre-wrap text-sm">{mySub.teacher_feedback}</p>
        </div>
      )}
    </div>
  );
}

/* ---------- TEACHER: SUBMISSIONS LIST ---------- */

function TeacherView({ taskId, classroomId }: { taskId: string; classroomId: string }) {
  const fn = useServerFn(listSubmissionsForTask);
  const { data: subs } = useSuspenseQuery({ queryKey: ["submissions", taskId], queryFn: () => fn({ data: { task_id: taskId } }) });

  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b p-3 text-sm font-medium">Submissões ({subs.length})</div>
      <ul className="divide-y">
        {subs.length === 0 && <li className="p-4 text-sm text-muted-foreground">Nenhuma submissão ainda.</li>}
        {subs.map(s => (
          <li key={s.id}>
            <Link
              to="/tasks/$taskId/submissions/$submissionId"
              params={{ taskId, submissionId: s.id }}
              className="flex items-center justify-between p-4 hover:bg-accent"
            >
              <div>
                <div className="font-medium text-foreground">{s.student?.full_name}</div>
                <div className="text-xs text-muted-foreground">{new Date(s.submitted_at).toLocaleString("pt-BR")} · {s.status === "returned" ? `Nota ${s.grade ?? "—"}` : "pendente"}</div>
              </div>
              <span className="text-xs text-primary">Abrir correção →</span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="border-t p-3">
        <Link to="/classrooms/$id" params={{ id: classroomId }} className="text-sm text-muted-foreground hover:text-foreground">← Voltar para a sala</Link>
      </div>
    </div>
  );
}
