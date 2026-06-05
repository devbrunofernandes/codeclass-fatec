import { createFileRoute, Link } from "@tanstack/react-router";
import { Code2, GraduationCap, Sparkles, MessagesSquare } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CodeClass — Sala de aula virtual para programação" },
      { name: "description", content: "Ensine e aprenda programação com editor online, execução de código e correção por IA." },
    ],
  }),
  component: Landing,
});

function Feature({ icon: Icon, title, body }: { icon: React.ComponentType<{ className?: string }>; title: string; body: string }) {
  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mb-1 font-semibold text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2 font-semibold text-foreground">
            <Code2 className="h-5 w-5 text-primary" />
            CodeClass
          </Link>
          <nav className="flex items-center gap-2">
            <Link to="/auth/login" className="rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-accent">
              Entrar
            </Link>
            <Link to="/auth/sign-up" className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              Criar conta
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-20 text-center">
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          A sala de aula virtual feita para <span className="text-primary">programação</span>.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
          Crie atividades de codificação, execute na nuvem e receba correções assistidas por IA. Tudo em um só lugar — sem precisar enviar arquivos por e-mail.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/auth/sign-up" className="rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Começar grátis
          </Link>
          <Link to="/auth/login" className="rounded-md border bg-card px-5 py-3 text-sm font-medium text-foreground hover:bg-accent">
            Já tenho conta
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-6 pb-20 sm:grid-cols-2 lg:grid-cols-4">
        <Feature icon={GraduationCap} title="Salas virtuais" body="Crie turmas, convide alunos e organize sua disciplina." />
        <Feature icon={Code2} title="Editor + Execução" body="Editor com syntax highlighting e sandbox para JS, Python, Java, C e C++." />
        <Feature icon={Sparkles} title="Correção com IA" body="Devolutiva pedagógica do código do aluno em segundos." />
        <Feature icon={MessagesSquare} title="Chat em tempo real" body="Comunicação direta entre alunos e professores." />
      </section>

      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-6 py-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} CodeClass
        </div>
      </footer>
    </div>
  );
}
