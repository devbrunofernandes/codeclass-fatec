import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { lookupLoginEmail } from "@/lib/auth.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/login")({
  head: () => ({ meta: [{ title: "Entrar — CodeClass" }, { name: "description", content: "Acesse sua conta CodeClass." }] }),
  component: LoginPage,
});

function LoginPage() {
  const lookup = useServerFn(lookupLoginEmail);
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { email, email_confirmed } = await lookup({ data: { identifier } });
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!email_confirmed) {
        navigate({ to: "/auth/confirm", search: { email } });
        return;
      }
      navigate({ to: "/dashboard" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <form onSubmit={onSubmit} className="w-full max-w-md space-y-4 rounded-xl border bg-card p-8 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Entrar</h1>
          <p className="mt-1 text-sm text-muted-foreground">Use seu nome de usuário ou e-mail.</p>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Usuário ou e-mail</span>
          <input required value={identifier} onChange={(e) => setIdentifier(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Senha</span>
          <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </label>

        <button disabled={loading} className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
          {loading ? "Entrando..." : "Entrar"}
        </button>
        <p className="text-center text-sm text-muted-foreground">
          Não tem conta? <Link to="/auth/sign-up" className="font-medium text-primary hover:underline">Criar agora</Link>
        </p>
      </form>
    </div>
  );
}
