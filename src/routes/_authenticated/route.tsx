import { createFileRoute, Outlet, redirect, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { me, setActiveRole } from "@/lib/auth.functions";
import { Code2, LogOut, LayoutDashboard, Bell, GraduationCap, BookOpen, ArrowLeftRight } from "lucide-react";
import { listNotifications } from "@/lib/notifications.functions";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) throw redirect({ to: "/auth/login" });
    return { user: data.session.user };
  },
  component: AuthLayout,
});

const meQuery = queryOptions({ queryKey: ["me"], queryFn: () => useMe.fn() });

// useServerFn requires hook context, so wrap differently:
const useMe = { fn: me };

function AuthLayout() {
  const meFn = useServerFn(me);
  const { data } = useSuspenseQuery({ queryKey: ["me"], queryFn: () => meFn() });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [notifOpen, setNotifOpen] = useState(false);

  const notifFn = useServerFn(listNotifications);
  const { data: notifs } = useSuspenseQuery({ queryKey: ["notifications"], queryFn: () => notifFn() });
  const unread = notifs?.filter((n) => !n.read_at).length ?? 0;

  // Realtime notifications
  useEffect(() => {
    const userId = data.profile?.id;
    if (!userId) return;
    const channel = supabase
      .channel(`notif:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => {
        qc.invalidateQueries({ queryKey: ["notifications"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [data.profile?.id, qc]);

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth/login", replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link to="/dashboard" className="flex items-center gap-2 font-semibold text-foreground">
            <Code2 className="h-5 w-5 text-primary" />
            CodeClass
          </Link>
          <nav className="flex items-center gap-1">
            <Link to="/dashboard" className="rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-accent">
              <span className="hidden items-center gap-2 sm:inline-flex"><LayoutDashboard className="h-4 w-4" />Painel</span>
              <span className="sm:hidden"><LayoutDashboard className="h-4 w-4" /></span>
            </Link>
            <div className="relative">
              <button onClick={() => setNotifOpen((v) => !v)} className="relative rounded-md p-2 hover:bg-accent">
                <Bell className="h-4 w-4" />
                {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">{unread}</span>}
              </button>
              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-md border bg-popover p-2 shadow-md">
                  {notifs && notifs.length > 0 ? notifs.map((n) => (
                    <Link key={n.id} to={n.link as string ?? "/dashboard"} onClick={() => setNotifOpen(false)} className="block rounded p-2 hover:bg-accent">
                      <div className="text-sm font-medium">{n.title}</div>
                      {n.body && <div className="text-xs text-muted-foreground">{n.body}</div>}
                    </Link>
                  )) : <div className="p-4 text-center text-sm text-muted-foreground">Sem notificações</div>}
                </div>
              )}
            </div>
            <div className="mx-2 hidden text-sm text-muted-foreground sm:block">
              {data.profile?.full_name} · <span className="font-medium text-foreground capitalize">{data.role === "teacher" ? "Professor" : "Aluno"}</span>
            </div>
            <button onClick={signOut} className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground" title="Sair">
              <LogOut className="h-4 w-4" />
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

export { meQuery };
