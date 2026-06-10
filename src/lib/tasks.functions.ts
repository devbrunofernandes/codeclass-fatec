import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SUPPORTED_LANGS = ["javascript", "python", "java", "c", "cpp"] as const;

const CodingConfig = z.object({
  starter_code: z.string().default(""),
  allowed_languages: z.array(z.enum(SUPPORTED_LANGS)).default([...SUPPORTED_LANGS]),
});

const TriviaQuestion = z.object({
  prompt: z.string().min(1),
  options: z.array(z.string().min(1)).min(2).max(8),
  correct_index: z.number().int().min(0),
  time_limit_sec: z.number().int().min(5).max(600).default(30),
});

const QuizQuestion = z.union([
  z.object({ kind: z.literal("multiple"), prompt: z.string().min(1), options: z.array(z.string().min(1)).min(2).max(8), correct_index: z.number().int().min(0) }),
  z.object({ kind: z.literal("essay"), prompt: z.string().min(1) }),
]);

const Base = z.object({
  classroom_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  statement: z.string().min(1),
  due_at: z.string().datetime().optional().nullable(),
});

const CreateTaskInput = z.discriminatedUnion("type", [
  Base.extend({ type: z.literal("coding"), config: CodingConfig }),
  Base.extend({ type: z.literal("trivia"), config: z.object({ questions: z.array(TriviaQuestion).min(1) }) }),
  Base.extend({ type: z.literal("quiz"), config: z.object({ questions: z.array(QuizQuestion).min(1) }) }),
]);

export const createTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => CreateTaskInput.parse(i))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase.from("tasks").insert({
      classroom_id: data.classroom_id, type: data.type, title: data.title, statement: data.statement,
      due_at: data.due_at ?? null, created_by: userId, config: data.config as never,
    }).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ classroom_id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("tasks").select("*").eq("classroom_id", data.classroom_id).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const tasks = rows ?? [];
    const ids = tasks.map(t => t.id);
    if (ids.length === 0) return tasks.map(t => ({ ...t, my_submission: null as null | { status: string; grade: number | null } }));
    const { data: subs } = await supabase
      .from("submissions").select("task_id,status,grade").in("task_id", ids).eq("student_id", userId);
    const sMap = new Map((subs ?? []).map(s => [s.task_id, s]));
    return tasks.map(t => ({ ...t, my_submission: sMap.get(t.id) ?? null }));
  });

export const getTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: task, error } = await supabase.from("tasks").select("*").eq("id", data.id).maybeSingle();
    if (error || !task) throw new Error("Tarefa não encontrada");

    const { data: mySub } = await supabase
      .from("submissions").select("*").eq("task_id", data.id).eq("student_id", userId).maybeSingle();

    return { task, my_submission: mySub };
  });

export const listSubmissionsForTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ task_id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("submissions")
      .select("*")
      .eq("task_id", data.task_id)
      .order("submitted_at", { ascending: false });
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((rows ?? []).map(r => r.student_id)));
    const { data: profiles } = ids.length
      ? await context.supabase.from("profiles").select("id, full_name, username").in("id", ids)
      : { data: [] as { id: string; full_name: string; username: string }[] };
    const pMap = new Map((profiles ?? []).map(p => [p.id, p]));
    return (rows ?? []).map(r => ({ ...r, student: pMap.get(r.student_id) ?? null }));
  });

const SubmitInput = z.object({
  task_id: z.string().uuid(),
  content: z.any(),
  language: z.string().optional(),
  grade: z.number().min(0).max(100).optional(),
  auto_return: z.boolean().optional(),
});

export const submitTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SubmitInput.parse(i))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const extra: Record<string, unknown> = {};
    if (data.auto_return) {
      extra.status = "returned";
      extra.returned_at = new Date().toISOString();
      if (data.grade != null) extra.grade = data.grade;
    }
    const { data: existing } = await supabase.from("submissions").select("id,status").eq("task_id", data.task_id).eq("student_id", userId).maybeSingle();
    if (existing) {
      if (existing.status === "returned") throw new Error("Tarefa já corrigida.");
      const { data: up, error } = await supabase.from("submissions").update({
        content: data.content, language: data.language, submitted_at: new Date().toISOString(), ...extra,
      }).eq("id", existing.id).select().single();
      if (error) throw new Error(error.message);
      return up;
    } else {
      const { data: ins, error } = await supabase.from("submissions").insert({
        task_id: data.task_id, student_id: userId, content: data.content, language: data.language, ...extra,
      }).select().single();
      if (error) throw new Error(error.message);
      return ins;
    }
  });

const ReturnInput = z.object({
  submission_id: z.string().uuid(),
  grade: z.number().min(0).max(100).nullable(),
  feedback: z.string().min(1),
});

export const returnSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ReturnInput.parse(i))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: sub, error: sErr } = await supabase
      .from("submissions").select("*, task:tasks(id,title,type,classroom_id)")
      .eq("id", data.submission_id).maybeSingle();
    if (sErr || !sub) throw new Error("Submissão não encontrada");
    if ((sub.task as any)?.type === "trivia") throw new Error("Tarefas de trivia são corrigidas automaticamente.");
    if (sub.status === "returned") throw new Error("Esta submissão já foi corrigida.");

    const { error } = await supabase.from("submissions").update({
      grade: data.grade, teacher_feedback: data.feedback, status: "returned",
      returned_at: new Date().toISOString(),
    }).eq("id", data.submission_id);
    if (error) throw new Error(error.message);

    // Notify student
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("notifications").insert({
      user_id: sub.student_id,
      type: "submission_returned",
      title: `Devolutiva: ${sub.task!.title}`,
      body: data.grade != null ? `Nota: ${data.grade}` : "Sua tarefa foi corrigida.",
      link: `/tasks/${sub.task!.id}`,
    });
    return { ok: true };
  });

export const teacherReviewsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: memberships } = await supabase
      .from("classroom_members").select("classroom_id, role").eq("user_id", userId);
    const classroomIds = (memberships ?? [])
      .filter(m => m.role === "owner" || m.role === "collaborator")
      .map(m => m.classroom_id);
    if (classroomIds.length === 0) return [];

    const { data: tasks } = await supabase
      .from("tasks")
      .select("id")
      .in("classroom_id", classroomIds);
    const taskIds = (tasks ?? []).map(t => t.id);
    if (taskIds.length === 0) return [];

    const { data: subs, error } = await supabase
      .from("submissions")
      .select("*, task:tasks(id,title,type,classroom_id,classroom:classrooms(id,name))")
      .in("task_id", taskIds)
      .order("submitted_at", { ascending: false });
    if (error) throw new Error(error.message);

    const ids = Array.from(new Set((subs ?? []).map(s => s.student_id)));
    const { data: profiles } = ids.length
      ? await supabase.from("profiles").select("id, full_name, username").in("id", ids)
      : { data: [] as { id: string; full_name: string; username: string }[] };
    const pMap = new Map((profiles ?? []).map(p => [p.id, p]));

    return (subs ?? []).map(s => {
      const taskType = (s.task as any)?.type as string;
      const review_status: "pending" | "corrected" | "auto" =
        taskType === "trivia" ? "auto" : s.status === "returned" ? "corrected" : "pending";
      return { ...s, student: pMap.get(s.student_id) ?? null, review_status };
    });
  });

export const pendingTasksForMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // Tasks in any classroom I'm in, where I haven't a 'returned' submission
    const { data: memberships } = await supabase.from("classroom_members").select("classroom_id, role").eq("user_id", userId);
    const classroomIds = (memberships ?? []).filter(m => m.role === "student").map(m => m.classroom_id);
    if (classroomIds.length === 0) return [];

    const { data: tasks } = await supabase
      .from("tasks")
      .select("*, classroom:classrooms(id,name)")
      .in("classroom_id", classroomIds)
      .order("due_at", { ascending: true, nullsFirst: false });

    const taskIds = (tasks ?? []).map(t => t.id);
    if (taskIds.length === 0) return [];
    const { data: subs } = await supabase.from("submissions").select("task_id,status").in("task_id", taskIds).eq("student_id", userId);
    const subMap = new Map((subs ?? []).map(s => [s.task_id, s.status]));
    return (tasks ?? []).filter(t => !subMap.has(t.id)).map(t => ({ ...t, my_status: "pending" as const }));
  });

export const myReturnedSubmissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("submissions")
      .select("*, task:tasks(id,title,type,classroom_id,classroom:classrooms(id,name))")
      .eq("student_id", userId)
      .eq("status", "returned")
      .order("returned_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const myTasksOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: memberships } = await supabase
      .from("classroom_members").select("classroom_id, role").eq("user_id", userId);
    const classroomIds = (memberships ?? []).filter(m => m.role === "student").map(m => m.classroom_id);
    if (classroomIds.length === 0) return [];

    const { data: tasks } = await supabase
      .from("tasks")
      .select("*, classroom:classrooms(id,name)")
      .in("classroom_id", classroomIds)
      .order("due_at", { ascending: true, nullsFirst: false });

    const taskIds = (tasks ?? []).map(t => t.id);
    if (taskIds.length === 0) return [];

    const { data: subs } = await supabase
      .from("submissions")
      .select("task_id,status,submitted_at,returned_at,grade")
      .in("task_id", taskIds)
      .eq("student_id", userId);
    const subMap = new Map((subs ?? []).map(s => [s.task_id, s]));

    const now = Date.now();
    return (tasks ?? []).map(t => {
      const sub = subMap.get(t.id) ?? null;
      let status: "delivered" | "overdue" | "on_time";
      if (sub) {
        status = "delivered";
      } else if (t.due_at && new Date(t.due_at).getTime() < now) {
        status = "overdue";
      } else {
        status = "on_time";
      }
      return { ...t, submission: sub, my_status: status };
    });
  });
