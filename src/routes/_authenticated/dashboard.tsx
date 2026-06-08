import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { me } from "@/lib/auth.functions";
import { listMyClassrooms, createClassroom } from "@/lib/classrooms.functions";
import { pendingTasksForMe, myReturnedSubmissions } from "@/lib/tasks.functions";
import { Plus, BookOpen, Clock, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Painel — CodeClass" }, { name: "description", content: "Suas salas e tarefas." }] }),
  component: Dashboard,
});

function Dashboard() {
  const meFn = useServerFn(me);
  const { data: meData } = useSuspenseQuery({ queryKey: ["me"], queryFn: () => meFn() });
  const role = meData.role;

  return role === "teacher" ? <TeacherDashboard /> : <StudentDashboard />;
}

function TeacherDashboard() {
  const listFn = useServerFn(listMyClassrooms);
  const { data: classes, refetch } = useSuspenseQuery({ queryKey: ["classrooms"], queryFn: () => listFn() });
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Minhas salas</h1>
          <p className="text-sm text-muted-foreground">Gerencie suas turmas de programação.</p>
        </div>
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Nova sala
        </button>
      </div>

      {classes.length === 0 ? (
        <EmptyState title="Nenhuma sala ainda" body="Crie sua primeira sala virtual para começar." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map(c => <ClassCard key={c.id} c={c} />)}
        </div>
      )}

      {open && <CreateClassroomDialog onClose={() => { setOpen(false); refetch(); }} />}
    </div>
  );
}

function StudentDashboard() {
  const listFn = useServerFn(listMyClassrooms);
  const pendingFn = useServerFn(pendingTasksForMe);
  const returnedFn = useServerFn(myReturnedSubmissions);
  const { data: classes } = useSuspenseQuery({ queryKey: ["classrooms"], queryFn: () => listFn() });
  const { data: pending } = useSuspenseQuery({ queryKey: ["pending-tasks"], queryFn: () => pendingFn() });
  const { data: returned } = useSuspenseQuery({ queryKey: ["returned-submissions"], queryFn: () => returnedFn() });

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">Tarefas pendentes</h2>
        </div>
        {pending.length === 0 ? (
          <EmptyState title="Você está em dia!" body="Nenhuma tarefa pendente." />
        ) : (
          <div className="space-y-2">
            {pending.map(t => (
              <Link key={t.id} to="/classrooms/$id/tasks/$taskId" params={{ id: t.classroom_id, taskId: t.id }}
                className="flex items-center justify-between rounded-lg border bg-card p-4 hover:bg-accent">
                <div>
                  <div className="font-medium text-foreground">{t.title}</div>
                  <div className="text-xs text-muted-foreground">{t.classroom?.name} · {t.type}</div>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  {t.due_at ? <>Entrega: <span className="font-medium text-foreground">{new Date(t.due_at).toLocaleString("pt-BR")}</span></> : "Sem prazo"}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">Correções recebidas</h2>
        </div>
        {returned.length === 0 ? (
          <EmptyState title="Nenhuma correção ainda" body="Quando o professor devolver uma tarefa corrigida, ela aparecerá aqui." />
        ) : (
          <div className="space-y-2">
            {returned.map(s => (
              <Link key={s.id} to="/classrooms/$id/tasks/$taskId" params={{ id: s.task!.classroom_id, taskId: s.task!.id }}
                className="flex items-center justify-between rounded-lg border bg-card p-4 hover:bg-accent">
                <div>
                  <div className="font-medium text-foreground">{s.task?.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.task?.classroom?.name} · {s.task?.type}
                    {s.returned_at && <> · Corrigida em {new Date(s.returned_at).toLocaleDateString("pt-BR")}</>}
                  </div>
                </div>
                <div className="text-right">
                  {s.grade != null ? (
                    <div className="text-lg font-semibold text-foreground">{s.grade}<span className="text-xs text-muted-foreground">/100</span></div>
                  ) : (
                    <div className="text-xs text-muted-foreground">Sem nota</div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">Minhas salas</h2>
        </div>
        {classes.length === 0 ? (
          <EmptyState title="Nenhuma sala" body="Aguarde um convite do seu professor." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{classes.map(c => <ClassCard key={c.id} c={c} />)}</div>
        )}
      </section>
    </div>
  );
}

function ClassCard({ c }: { c: { id: string; name: string; subject: string; description: string | null; my_role: string } }) {
  return (
    <Link to="/classrooms/$id" params={{ id: c.id }} className="block rounded-xl border bg-card p-5 transition hover:border-primary/40 hover:shadow-sm">
      <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">{c.subject}</div>
      <h3 className="text-lg font-semibold text-foreground">{c.name}</h3>
      {c.description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{c.description}</p>}
      <div className="mt-3 inline-block rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground capitalize">
        {c.my_role === "owner" ? "Proprietário" : c.my_role === "collaborator" ? "Colaborador" : "Aluno"}
      </div>
    </Link>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed bg-card p-10 text-center">
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function CreateClassroomDialog({ onClose }: { onClose: () => void }) {
  const fn = useServerFn(createClassroom);
  const [form, setForm] = useState({ name: "", subject: "", description: "", chat_private: false });
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await fn({ data: form });
      toast.success("Sala criada!");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-foreground">Nova sala</h2>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Nome</span>
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Disciplina</span>
          <input required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Descrição</span>
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-md border bg-background px-3 py-2 text-sm" rows={3} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.chat_private} onChange={(e) => setForm({ ...form, chat_private: e.target.checked })} />
          <span>Chat restrito (apenas professores podem postar)</span>
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border px-4 py-2 text-sm hover:bg-accent">Cancelar</button>
          <button disabled={loading} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">{loading ? "Criando..." : "Criar"}</button>
        </div>
      </form>
    </div>
  );
}
