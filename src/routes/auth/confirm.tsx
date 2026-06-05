import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { confirmEmail, resendConfirmation } from "@/lib/auth.functions";

const Search = z.object({ email: z.string().email().optional() });

export const Route = createFileRoute("/auth/confirm")({
  validateSearch: Search,
  head: () => ({ meta: [{ title: "Confirmar e-mail — CodeClass" }, { name: "description", content: "Confirme seu e-mail para acessar o CodeClass." }] }),
  component: ConfirmPage,
});

function ConfirmPage() {
  const navigate = useNavigate();
  const { email = "" } = Route.useSearch();
  const [emailValue, setEmail] = useState(email);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const cfn = useServerFn(confirmEmail);
  const rfn = useServerFn(resendConfirmation);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await cfn({ data: { email: emailValue, token } });
      toast.success("E-mail confirmado!");
      navigate({ to: "/dashboard" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally { setLoading(false); }
  };

  const resend = async () => {
    try {
      const res = await rfn({ data: { email: emailValue } });
      if (res.dev_token) toast.message("Código (dev)", { description: res.dev_token });
      else toast.success("Novo código enviado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-xl border bg-card p-8 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Confirmar e-mail</h1>
          <p className="mt-1 text-sm text-muted-foreground">Digite o código de 6 dígitos que enviamos.</p>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">E-mail</span>
          <input required type="email" value={emailValue} onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Código</span>
          <input required value={token} onChange={(e) => setToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric" pattern="\d{6}" placeholder="000000"
            className="w-full rounded-md border bg-background px-3 py-2 text-center font-mono text-lg tracking-widest" />
        </label>

        <button disabled={loading} className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
          {loading ? "Confirmando..." : "Confirmar"}
        </button>
        <button type="button" onClick={resend} className="w-full rounded-md border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-accent">
          Reenviar código
        </button>
      </form>
    </div>
  );
}
