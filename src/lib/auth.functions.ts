import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendAppEmail } from "./email.server";

function genToken() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

const SignUpInput = z.object({
  full_name: z.string().min(2).max(120),
  username: z.string().min(3).max(40).regex(/^[a-zA-Z0-9_.-]+$/, "Use letras, números, _ . -"),
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  role: z.enum(["teacher", "student"]),
});

export const signUp = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SignUpInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Uniqueness pre-checks
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id,email,username")
      .or(`email.eq.${data.email},username.eq.${data.username}`);
    if (existing && existing.length > 0) {
      const conflict = existing[0];
      if (conflict.email === data.email) throw new Error("E-mail já cadastrado");
      throw new Error("Nome de usuário já em uso");
    }

    // Create auth user (email_confirm true — we use our own token flow + Supabase login)
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name, username: data.username },
    });
    if (createErr || !created.user) throw new Error(createErr?.message ?? "Falha ao criar usuário");

    const userId = created.user.id;

    // Profile row (active_role = role escolhido no cadastro)
    const { error: profErr } = await supabaseAdmin.from("profiles").insert({
      id: userId,
      full_name: data.full_name,
      username: data.username,
      email: data.email,
      email_confirmed: false,
      active_role: data.role,
    });
    if (profErr) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(profErr.message);
    }

    // Concede ambas as funções para permitir alternar entre visões (RF032)
    await supabaseAdmin.from("user_roles").insert([
      { user_id: userId, role: "teacher" },
      { user_id: userId, role: "student" },
    ]);

    // Token
    const token = genToken();
    await supabaseAdmin.from("email_tokens").insert({
      user_id: userId,
      token,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    });

    const emailRes = await sendAppEmail({
      to: data.email,
      subject: "Confirme seu e-mail no CodeClass",
      html: `<p>Olá ${data.full_name},</p><p>Seu código de confirmação é:</p><h2 style="font-family:monospace">${token}</h2><p>Expira em 30 minutos.</p>`,
    });

    return { user_id: userId, email_sent: emailRes.sent, dev_token: emailRes.sent ? undefined : token };
  });

const ResendInput = z.object({ email: z.string().email() });

export const resendConfirmation = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => ResendInput.parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles").select("id,full_name,email_confirmed").eq("email", data.email).maybeSingle();
    if (!profile) throw new Error("E-mail não encontrado");
    if (profile.email_confirmed) throw new Error("E-mail já confirmado");

    // Invalidate previous
    await supabaseAdmin.from("email_tokens").update({ used: true }).eq("user_id", profile.id).eq("used", false);

    const token = genToken();
    await supabaseAdmin.from("email_tokens").insert({
      user_id: profile.id,
      token,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    });

    const emailRes = await sendAppEmail({
      to: data.email,
      subject: "Novo código de confirmação CodeClass",
      html: `<p>Olá ${profile.full_name},</p><p>Seu novo código é: <strong style="font-family:monospace">${token}</strong></p><p>Expira em 30 minutos.</p>`,
    });

    return { email_sent: emailRes.sent, dev_token: emailRes.sent ? undefined : token };
  });

const ConfirmInput = z.object({ email: z.string().email(), token: z.string().length(6) });

export const confirmEmail = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => ConfirmInput.parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin.from("profiles").select("id,email_confirmed").eq("email", data.email).maybeSingle();
    if (!profile) throw new Error("Conta não encontrada");
    if (profile.email_confirmed) return { ok: true };

    const { data: tokenRow } = await supabaseAdmin
      .from("email_tokens")
      .select("id,token,expires_at,used")
      .eq("user_id", profile.id)
      .eq("used", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!tokenRow) throw new Error("Solicite um novo código");
    if (new Date(tokenRow.expires_at) < new Date()) throw new Error("Código expirado");
    if (tokenRow.token !== data.token) throw new Error("Código incorreto");

    await supabaseAdmin.from("email_tokens").update({ used: true }).eq("id", tokenRow.id);
    await supabaseAdmin.from("profiles").update({ email_confirmed: true }).eq("id", profile.id);
    return { ok: true };
  });

// Resolves login identifier (username or email) to an email for supabase signIn
const LookupInput = z.object({ identifier: z.string().min(1) });
export const lookupLoginEmail = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => LookupInput.parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const id = data.identifier.trim();
    const isEmail = id.includes("@");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email,email_confirmed")
      .eq(isEmail ? "email" : "username", id)
      .maybeSingle();
    if (!profile) throw new Error("Usuário não encontrado");
    return { email: profile.email, email_confirmed: profile.email_confirmed };
  });

export const me = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: profile }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    const availableRoles = (roles?.map((r) => r.role) ?? []) as Array<"teacher" | "student">;
    const active = (profile?.active_role ?? availableRoles[0] ?? "student") as "teacher" | "student";
    return {
      profile,
      role: active,
      available_roles: availableRoles,
    };
  });

const SetActiveRoleInput = z.object({ role: z.enum(["teacher", "student"]) });
export const setActiveRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SetActiveRoleInput.parse(i))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    // garante que o usuário possui a role
    const { data: roleRow } = await supabase
      .from("user_roles").select("role").eq("user_id", userId).eq("role", data.role).maybeSingle();
    if (!roleRow) throw new Error("Você não possui essa função");
    const { error } = await supabase.from("profiles").update({ active_role: data.role }).eq("id", userId);
    if (error) throw new Error(error.message);
    return { role: data.role };
  });

