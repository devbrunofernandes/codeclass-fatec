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
    const { data: rows, error } = await context.supabase
      .from("tasks").select("*").eq("classroom_id", data.classroom_id).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
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
});

export const submitTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SubmitInput.parse(i))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase.from("submissions").select("id,status").eq("task_id", data.task_id).eq("student_id", userId).maybeSingle();
    if (existing) {
      if (existing.status === "returned") throw new Error("Tarefa já corrigida.");
      const { data: up, error } = await supabase.from("submissions").update({
        content: data.content, language: data.language, submitted_at: new Date().toISOString(),
      }).eq("id", existing.id).select().single();
      if (error) throw new Error(error.message);
      return up;
    } else {
      const { data: ins, error } = await supabase.from("submissions").insert({
        task_id: data.task_id, student_id: userId, content: data.content, language: data.language,
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
      .from("submissions").select("*, task:tasks(id,title,classroom_id)")
      .eq("id", data.submission_id).maybeSingle();
    if (sErr || !sub) throw new Error("Submissão não encontrada");

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
      link: `/classrooms/${sub.task!.classroom_id}/tasks/${sub.task!.id}`,
    });
    return { ok: true };
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
    const doneMap = new Map((subs ?? []).map(s => [s.task_id, s.status]));
    return (tasks ?? []).filter(t => doneMap.get(t.id) !== "returned").map(t => ({ ...t, my_status: doneMap.get(t.id) ?? "pending" }));
  });
