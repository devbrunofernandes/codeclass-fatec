import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendAppEmail } from "./email.server";

const CreateInput = z.object({
  name: z.string().min(1).max(120),
  subject: z.string().min(1).max(120),
  description: z.string().max(2000).optional().default(""),
  chat_private: z.boolean().default(false),
});

export const createClassroom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => CreateInput.parse(i))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "teacher").maybeSingle();
    if (!roles) throw new Error("Apenas professores podem criar salas.");

    const classroomId = crypto.randomUUID();

    const { error: createError } = await supabase
      .from("classrooms")
      .insert({ id: classroomId, owner_id: userId, name: data.name, subject: data.subject, description: data.description, chat_private: data.chat_private });
    if (createError) throw new Error(createError.message);

    const { error: membershipError } = await supabase
      .from("classroom_members")
      .insert({ classroom_id: classroomId, user_id: userId, role: "owner" });
    if (membershipError) {
      await supabase.from("classrooms").delete().eq("id", classroomId);
      throw new Error(membershipError.message);
    }

    const { data: created, error: readError } = await supabase
      .from("classrooms")
      .select("*")
      .eq("id", classroomId)
      .single();
    if (readError || !created) throw new Error(readError?.message ?? "Sala criada, mas não pôde ser carregada.");

    return created;
  });

export const listMyClassrooms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: memberships, error } = await supabase
      .from("classroom_members")
      .select("role, classroom:classrooms(*)")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return (memberships ?? [])
      .map((m) => ({ ...m.classroom!, my_role: m.role }))
      .filter((c) => c.id && !c.archived);
  });

const IdInput = z.object({ id: z.string().uuid() });

export const getClassroom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => IdInput.parse(i))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: classroom, error } = await supabase.from("classrooms").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!classroom) throw new Error("Sala não encontrada");

    const { data: membersRaw } = await supabase
      .from("classroom_members")
      .select("role, user_id, joined_at")
      .eq("classroom_id", data.id);

    const userIds = (membersRaw ?? []).map(m => m.user_id);
    const { data: profiles } = userIds.length
      ? await supabase.from("profiles").select("id, full_name, username, email").in("id", userIds)
      : { data: [] as { id: string; full_name: string; username: string; email: string }[] };
    const pMap = new Map((profiles ?? []).map(p => [p.id, p]));

    const members = (membersRaw ?? []).map(m => ({ ...m, profile: pMap.get(m.user_id) ?? null }));
    const my = members.find((m) => m.user_id === userId);
    return {
      classroom,
      members,
      my_role: my?.role ?? null,
    };
  });

export const archiveClassroom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => IdInput.parse(i))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("classrooms").update({ archived: true }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const InviteInput = z.object({
  classroom_id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(["collaborator", "student"]),
});

function inviteToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b => b.toString(36).padStart(2, "0")).join("").slice(0, 32);
}

export const inviteToClassroom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => InviteInput.parse(i))
  .handler(async ({ context, data, ...rest }) => {
    const { supabase, userId } = context;
    const { data: classroom } = await supabase.from("classrooms").select("id,name").eq("id", data.classroom_id).maybeSingle();
    if (!classroom) throw new Error("Sala não encontrada");

    const token = inviteToken();
    const { error } = await supabase.from("classroom_invites").insert({
      classroom_id: data.classroom_id, email: data.email, role: data.role, invited_by: userId, token,
    });
    if (error) throw new Error(error.message);

    // Notify recipient if registered
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: target } = await supabaseAdmin.from("profiles").select("id").eq("email", data.email).maybeSingle();
    if (target) {
      await supabaseAdmin.from("notifications").insert({
        user_id: target.id,
        type: "classroom_invite",
        title: `Convite para "${classroom.name}"`,
        body: `Você foi convidado como ${data.role === "collaborator" ? "colaborador" : "aluno"}.`,
        link: `/invites/${token}`,
        payload: { token, classroom_id: classroom.id },
      });
    }

    await sendAppEmail({
      to: data.email,
      subject: `Convite para a sala "${classroom.name}" — CodeClass`,
      html: `<p>Você foi convidado para a sala <strong>${classroom.name}</strong> como ${data.role === "collaborator" ? "colaborador" : "aluno"}.</p>
        <p>Aceite acessando: <a href="${(process.env.SITE_URL ?? "")}/invites/${token}">Aceitar convite</a></p>
        <p>Ou use o código de convite: <code>${token}</code></p>`,
    });

    return { ok: true, token };
  });

const TokenInput = z.object({ token: z.string().min(8) });

export const getInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => TokenInput.parse(i))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invite } = await supabaseAdmin
      .from("classroom_invites")
      .select("*, classroom:classrooms(id,name,subject,description)")
      .eq("token", data.token).maybeSingle();
    if (!invite) throw new Error("Convite não encontrado");

    const { data: profile } = await context.supabase.from("profiles").select("email").eq("id", context.userId).maybeSingle();
    if (profile?.email !== invite.email) throw new Error("Este convite é para outro e-mail");
    return invite;
  });

export const respondInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ token: z.string(), accept: z.boolean() }).parse(i))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invite } = await supabaseAdmin
      .from("classroom_invites").select("*").eq("token", data.token).maybeSingle();
    if (!invite) throw new Error("Convite inválido");
    if (invite.status !== "pending") throw new Error("Convite já respondido");

    const { data: profile } = await context.supabase.from("profiles").select("email").eq("id", context.userId).maybeSingle();
    if (profile?.email !== invite.email) throw new Error("Convite não pertence a este usuário");

    if (data.accept) {
      await supabaseAdmin.from("classroom_members").insert({
        classroom_id: invite.classroom_id, user_id: context.userId, role: invite.role === "collaborator" ? "collaborator" : "student",
      });
      await supabaseAdmin.from("classroom_invites").update({ status: "accepted" }).eq("id", invite.id);
    } else {
      await supabaseAdmin.from("classroom_invites").update({ status: "declined" }).eq("id", invite.id);
    }
    return { ok: true, classroom_id: invite.classroom_id };
  });
