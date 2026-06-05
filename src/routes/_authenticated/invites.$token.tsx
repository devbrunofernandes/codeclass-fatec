import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { getInvite, respondInvite } from "@/lib/classrooms.functions";

export const Route = createFileRoute("/_authenticated/invites/$token")({
  head: () => ({ meta: [{ title: "Convite — CodeClass" }, { name: "description", content: "Aceitar convite para uma sala." }] }),
  component: InvitePage,
});

function InvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const getFn = useServerFn(getInvite);
  const respFn = useServerFn(respondInvite);
  const { data: invite } = useSuspenseQuery({ queryKey: ["invite", token], queryFn: () => getFn({ data: { token } }) });
  const [loading, setLoading] = useState(false);

  const respond = async (accept: boolean) => {
    setLoading(true);
    try {
      const res = await respFn({ data: { token, accept } });
      toast.success(accept ? "Convite aceito" : "Convite recusado");
      if (accept) navigate({ to: "/classrooms/$id", params: { id: res.classroom_id! } });
      else navigate({ to: "/dashboard" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally { setLoading(false); }
  };

  return (
    <div className="mx-auto max-w-md rounded-xl border bg-card p-8 text-center">
      <h1 className="text-xl font-bold">Convite para sala</h1>
      <p className="mt-2 text-sm text-muted-foreground">Você foi convidado para:</p>
      <div className="mt-3 text-lg font-medium">{invite.classroom?.name}</div>
      <div className="text-xs text-muted-foreground">{invite.classroom?.subject}</div>
      <div className="mt-2 text-xs">Como: <strong>{invite.role === "collaborator" ? "Colaborador" : "Aluno"}</strong></div>
      <div className="mt-6 flex justify-center gap-2">
        <button onClick={() => respond(false)} disabled={loading} className="rounded-md border px-4 py-2 text-sm hover:bg-accent">Recusar</button>
        <button onClick={() => respond(true)} disabled={loading} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Aceitar</button>
      </div>
    </div>
  );
}
