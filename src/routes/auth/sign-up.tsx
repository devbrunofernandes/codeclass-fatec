import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { signUp } from "@/lib/auth.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/sign-up")({
  head: () => ({ meta: [{ title: "Criar conta — CodeClass" }, { name: "description", content: "Cadastre-se no CodeClass." }] }),
  component: SignUpPage,
});

function SignUpPage() {
  const fn = useServerFn(signUp);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    full_name: "", username: "", email: "", password: "",
  });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Backend grants both teacher e student; active_role inicial = student
      const res = await fn({ data: { ...form, role: "student" } });
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
      <div className="w-full max-w-md space-y-3">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Voltar para o início
        </Link>
        <form onSubmit={onSubmit} className="w-full space-y-4 rounded-xl border bg-card p-8 shadow-sm">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Criar conta</h1>
            <p className="mt-1 text-sm text-muted-foreground">Sua conta funciona como aluno e professor — alterne quando quiser.</p>
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
