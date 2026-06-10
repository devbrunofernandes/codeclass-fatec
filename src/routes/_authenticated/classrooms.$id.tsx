import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getClassroom, inviteToClassroom, archiveClassroom } from "@/lib/classrooms.functions";
import { listMaterials, createMaterialUpload, getMaterialDownloadUrl, deleteMaterial } from "@/lib/materials.functions";
import { listTasks } from "@/lib/tasks.functions";
import { listMessages, sendMessage } from "@/lib/chat.functions";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";
import { Archive, Download, FileText, Plus, Send, Trash2, UserPlus, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/classrooms/$id")({
  head: ({ params }) => ({ meta: [{ title: `Sala — CodeClass` }, { name: "description", content: `Sala virtual de programação ${params.id}` }] }),
  component: ClassroomPage,
});

type Tab = "tasks" | "materials" | "people" | "chat";

function ClassroomPage() {
  const { id } = Route.useParams();
  const getFn = useServerFn(getClassroom);
  const { data, refetch } = useSuspenseQuery({ queryKey: ["classroom", id], queryFn: () => getFn({ data: { id } }) });
  const [tab, setTab] = useState<Tab>("tasks");
  const isTeacher = data.my_role === "owner" || data.my_role === "collaborator";

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{data.classroom.subject}</div>
            <h1 className="mt-1 text-2xl font-bold text-foreground">{data.classroom.name}</h1>
            {data.classroom.description && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{data.classroom.description}</p>}
          </div>
          {data.my_role === "owner" && (
            <ArchiveButton id={id} />
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b">
        {(["tasks", "materials", "people", "chat"] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t === "tasks" ? "Tarefas" : t === "materials" ? "Materiais" : t === "people" ? "Pessoas" : "Chat"}
          </button>
        ))}
      </div>

      {tab === "tasks" && <TasksTab classroomId={id} isTeacher={isTeacher} />}
      {tab === "materials" && <MaterialsTab classroomId={id} isTeacher={isTeacher} />}
      {tab === "people" && <PeopleTab data={data} isTeacher={isTeacher} onChanged={refetch} />}
      {tab === "chat" && <ChatTab classroomId={id} chatPrivate={data.classroom.chat_private} isTeacher={isTeacher} />}

      <Outlet />
    </div>
  );
}

function ArchiveButton({ id }: { id: string }) {
  const fn = useServerFn(archiveClassroom);
  const navigate = useNavigate();
  const handle = async () => {
    if (!confirm("Arquivar esta sala? Ela ficará oculta para todos.")) return;
    await fn({ data: { id } });
    toast.success("Sala arquivada");
    navigate({ to: "/dashboard" });
  };
  return (
    <button onClick={handle} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent">
      <Archive className="h-4 w-4" /> Arquivar
    </button>
  );
}

function TasksTab({ classroomId, isTeacher }: { classroomId: string; isTeacher: boolean }) {
  const fn = useServerFn(listTasks);
  const { data: tasks } = useSuspenseQuery({ queryKey: ["tasks", classroomId], queryFn: () => fn({ data: { classroom_id: classroomId } }) });

  const renderItem = (t: typeof tasks[number]) => {
    const sub = (t as any).my_submission as { status: string; grade: number | null } | null;
    const delivered = !!sub;
    return (
      <Link key={t.id} to="/tasks/$taskId" params={{ taskId: t.id }}
        className="block rounded-lg border bg-card p-4 hover:border-primary/40">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs uppercase text-muted-foreground">{t.type === "coding" ? "Codificação" : t.type === "trivia" ? "Trivia" : "Questionário"}</div>
            <div className="truncate font-medium text-foreground">{t.title}</div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {!isTeacher && delivered && (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-700 dark:text-emerald-400">
                {sub!.status === "returned" ? `Corrigida${sub!.grade != null ? ` · ${sub!.grade}` : ""}` : "Entregue"}
              </span>
            )}
            <span>{t.due_at ? `Entrega: ${new Date(t.due_at).toLocaleString("pt-BR")}` : "Sem prazo"}</span>
          </div>
        </div>
      </Link>
    );
  };

  const pending = isTeacher ? [] : tasks.filter(t => !(t as any).my_submission);
  const delivered = isTeacher ? [] : tasks.filter(t => !!(t as any).my_submission);

  return (
    <div className="space-y-4">
      {isTeacher && (
        <Link to="/classrooms/$id/new-task" params={{ id: classroomId }}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Nova tarefa
        </Link>
      )}
      {tasks.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">Nenhuma tarefa ainda.</div>
      ) : isTeacher ? (
        <div className="space-y-3">{tasks.map(renderItem)}</div>
      ) : (
        <div className="space-y-6">
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">Pendentes ({pending.length})</h2>
            {pending.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">Nenhuma tarefa pendente.</div>
            ) : <div className="space-y-3">{pending.map(renderItem)}</div>}
          </section>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">Enviadas ({delivered.length})</h2>
            {delivered.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">Você ainda não enviou nenhuma tarefa.</div>
            ) : <div className="space-y-3">{delivered.map(renderItem)}</div>}
          </section>
        </div>
      )}
    </div>
  );
}

function MaterialsTab({ classroomId, isTeacher }: { classroomId: string; isTeacher: boolean }) {
  const listFn = useServerFn(listMaterials);
  const createFn = useServerFn(createMaterialUpload);
  const downloadFn = useServerFn(getMaterialDownloadUrl);
  const deleteFn = useServerFn(deleteMaterial);
  const qc = useQueryClient();
  const { data: items } = useSuspenseQuery({ queryKey: ["materials", classroomId], queryFn: () => listFn({ data: { classroom_id: classroomId } }) });
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");

  const onUpload = async (file: File) => {
    if (!title.trim()) { toast.error("Informe um título"); return; }
    if (file.size > 30 * 1024 * 1024) { toast.error("Máximo 30 MB"); return; }
    setUploading(true);
    try {
      const { upload } = await createFn({ data: { classroom_id: classroomId, title, filename: file.name, size: file.size, mime_type: file.type } });
      const { error } = await supabase.storage.from("materials").uploadToSignedUrl(upload.path, upload.token, file);
      if (error) throw error;
      toast.success("Material enviado");
      setTitle("");
      qc.invalidateQueries({ queryKey: ["materials", classroomId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro no upload");
    } finally { setUploading(false); }
  };

  const onDownload = async (id: string) => {
    const { url } = await downloadFn({ data: { id } });
    window.open(url, "_blank");
  };

  const onDelete = async (id: string) => {
    if (!confirm("Excluir material?")) return;
    await deleteFn({ data: { id } });
    qc.invalidateQueries({ queryKey: ["materials", classroomId] });
  };

  return (
    <div className="space-y-3">
      {isTeacher && (
        <div className="rounded-lg border bg-card p-4">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título do material" className="rounded-md border bg-background px-3 py-2 text-sm" />
            <label className={`inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent ${uploading ? "opacity-50" : ""}`}>
              <input type="file" className="hidden" disabled={uploading} onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
              {uploading ? "Enviando..." : "Selecionar arquivo (máx 30MB)"}
            </label>
          </div>
        </div>
      )}
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">Nenhum material publicado.</div>
      ) : items.map(m => (
        <div key={m.id} className="flex items-center justify-between rounded-lg border bg-card p-4">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="font-medium text-foreground">{m.title}</div>
              <div className="text-xs text-muted-foreground">{(m.file_size / 1024 / 1024).toFixed(2)} MB</div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => onDownload(m.id)} className="rounded-md p-2 hover:bg-accent" title="Baixar"><Download className="h-4 w-4" /></button>
            {isTeacher && <button onClick={() => onDelete(m.id)} className="rounded-md p-2 hover:bg-accent text-destructive" title="Excluir"><Trash2 className="h-4 w-4" /></button>}
          </div>
        </div>
      ))}
    </div>
  );
}

function PeopleTab({ data, isTeacher, onChanged }: { data: Awaited<ReturnType<typeof getClassroom>>; isTeacher: boolean; onChanged: () => void }) {
  const inviteFn = useServerFn(inviteToClassroom);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"student" | "collaborator">("student");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await inviteFn({ data: { classroom_id: data.classroom.id, email, role } });
      toast.success(`Convite enviado para ${email}`);
      setEmail("");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      {isTeacher && (
        <form onSubmit={submit} className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-4">
          <label className="flex-1">
            <span className="mb-1 block text-sm font-medium">E-mail</span>
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium">Papel</span>
            <select value={role} onChange={(e) => setRole(e.target.value as "student" | "collaborator")} className="rounded-md border bg-background px-3 py-2 text-sm">
              <option value="student">Aluno</option>
              <option value="collaborator">Colaborador</option>
            </select>
          </label>
          <button disabled={loading} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            <UserPlus className="h-4 w-4" /> {loading ? "Convidando..." : "Convidar"}
          </button>
        </form>
      )}
      <div className="rounded-lg border bg-card">
        <div className="border-b p-4 text-sm font-medium flex items-center gap-2"><Users className="h-4 w-4" /> Pessoas ({data.members.length})</div>
        <ul className="divide-y">
          {data.members.map((m) => (
            <li key={m.user_id} className="flex items-center justify-between p-4">
              <div>
                <div className="font-medium text-foreground">{m.profile?.full_name ?? m.user_id}</div>
                <div className="text-xs text-muted-foreground">@{m.profile?.username}</div>
              </div>
              <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium capitalize text-accent-foreground">
                {m.role === "owner" ? "Proprietário" : m.role === "collaborator" ? "Colaborador" : "Aluno"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ChatTab({ classroomId, chatPrivate, isTeacher }: { classroomId: string; chatPrivate: boolean; isTeacher: boolean }) {
  const listFn = useServerFn(listMessages);
  const sendFn = useServerFn(sendMessage);
  const qc = useQueryClient();
  const { data: msgs } = useSuspenseQuery({ queryKey: ["messages", classroomId], queryFn: () => listFn({ data: { classroom_id: classroomId } }) });
  const [body, setBody] = useState("");
  const canPost = !chatPrivate || isTeacher;

  useEffect(() => {
    const ch = supabase.channel(`chat:${classroomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `classroom_id=eq.${classroomId}` }, () => {
        qc.invalidateQueries({ queryKey: ["messages", classroomId] });
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [classroomId, qc]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    try {
      await sendFn({ data: { classroom_id: classroomId, body: body.trim() } });
      setBody("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  };

  return (
    <div className="rounded-lg border bg-card">
      <div className="h-[400px] space-y-3 overflow-y-auto p-4">
        {msgs.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Sem mensagens ainda.</div>
        ) : msgs.map(m => (
          <div key={m.id} className="text-sm">
            <span className="font-medium text-foreground">{m.sender?.full_name}: </span>
            <span className="text-foreground">{m.body}</span>
            <div className="text-[10px] text-muted-foreground">{new Date(m.created_at).toLocaleString("pt-BR")}</div>
          </div>
        ))}
      </div>
      {canPost ? (
        <form onSubmit={send} className="flex gap-2 border-t p-3">
          <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Escreva uma mensagem..." className="flex-1 rounded-md border bg-background px-3 py-2 text-sm" />
          <button className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90"><Send className="h-4 w-4" /></button>
        </form>
      ) : (
        <div className="border-t p-3 text-center text-xs text-muted-foreground">Chat restrito a professores nesta sala.</div>
      )}
    </div>
  );
}
