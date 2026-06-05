import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { signUp } from "@/lib/auth.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/sign-up")({
  head: () => ({ meta: [{ title: "Criar conta — CodeClass" }, { name: "description", content: "Cadastre-se no CodeClass como professor ou aluno." }] }),
  component: SignUpPage,
});

function SignUpPage() {
  const fn = useServerFn(signUp);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    full_name: "", username: "", email: "", password: "", role: "student" as "student" | "teacher",
  });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fn({ data: form });
      // Sign in immediately so they can confirm
      await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
      if (res.dev_token) {
        toast.message("E-mail não configurado — use o código abaixo", { description: `Código: ${res.dev_token}` });
      } else {
        toast.success("Conta criada. Verifique seu e-mail.");
      }
      navigate({ to: "/auth/confirm", search: { email: form.email } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar conta");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <form onSubmit={onSubmit} className="w-full max-w-md space-y-4 rounded-xl border bg-card p-8 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Criar conta</h1>
          <p className="mt-1 text-sm text-muted-foreground">Comece sua jornada no CodeClass.</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setForm({ ...form, role: "student" })}
            className={`rounded-md border px-3 py-2 text-sm font-medium ${form.role === "student" ? "border-primary bg-primary/10 text-primary" : "bg-card text-foreground hover:bg-accent"}`}>
            Sou aluno
          </button>
          <button type="button" onClick={() => setForm({ ...form, role: "teacher" })}
            className={`rounded-md border px-3 py-2 text-sm font-medium ${form.role === "teacher" ? "border-primary bg-primary/10 text-primary" : "bg-card text-foreground hover:bg-accent"}`}>
            Sou professor
          </button>
        </div>

        <Field label="Nome completo" value={form.full_name} onChange={(v) => setForm({ ...form, full_name: v })} />
        <Field label="Nome de usuário" value={form.username} onChange={(v) => setForm({ ...form, username: v })} />
        <Field label="E-mail" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
        <Field label="Senha" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} />

        <button disabled={loading} className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
          {loading ? "Criando..." : "Criar conta"}
        </button>
        <p className="text-center text-sm text-muted-foreground">
          Já tem conta? <Link to="/auth/login" className="font-medium text-primary hover:underline">Entrar</Link>
        </p>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-foreground">{label}</span>
      <input
        required type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}
