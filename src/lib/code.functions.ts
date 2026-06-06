import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText, Output } from "ai";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const LANG_MAP: Record<string, { compiler: string }> = {
  javascript: { compiler: "nodejs-20.17.0" },
  python: { compiler: "cpython-3.14.0" },
  java: { compiler: "openjdk-jdk-22+36" },
  c: { compiler: "gcc-13.2.0-c" },
  cpp: { compiler: "gcc-13.2.0" },
};

const RunInput = z.object({
  language: z.string(),
  source: z.string().max(50_000),
  stdin: z.string().max(10_000).optional().default(""),
});

export const runCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => RunInput.parse(i))
  .handler(async ({ data }) => {
    const lang = LANG_MAP[data.language];
    if (!lang) throw new Error(`Linguagem não suportada: ${data.language}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let res: Response;
    try {
      res = await fetch("https://wandbox.org/api/compile.json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          compiler: lang.compiler,
          code: data.source,
          stdin: data.stdin,
        }),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timeout);
      const aborted = (e as Error).name === "AbortError";
      throw new Error(aborted ? "Tempo limite excedido" : `Falha ao contatar o executor: ${(e as Error).message}`);
    }
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`Erro no executor (${res.status})`);
    const json = await res.json() as {
      status: string;
      signal: string;
      compiler_error?: string;
      program_output?: string;
      program_error?: string;
    };
    return {
      stdout: json.program_output ?? "",
      stderr: json.program_error ?? "",
      exit_code: Number(json.status ?? 0),
      compile_stderr: json.compiler_error ?? "",
      timed_out: (json.signal ?? "").toLowerCase().includes("kill"),
    };
  });


const AiInput = z.object({
  task_statement: z.string(),
  language: z.string(),
  source: z.string().max(50_000),
  submission_id: z.string().uuid().optional(),
});

const FeedbackSchema = z.object({
  strengths: z.array(z.string()).max(8),
  improvements: z.array(z.string()).max(8),
  complexity: z.string(),
  suggestions: z.array(z.string()).max(8),
  summary: z.string(),
});

export const aiReviewCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => AiInput.parse(i))
  .handler(async ({ context, data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY ausente");
    const gateway = createLovableAiGatewayProvider(key);

    try {
      const { experimental_output: out } = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        experimental_output: Output.object({ schema: FeedbackSchema }),
        system: `Você é um professor de programação experiente. Analise o código do aluno em português, considerando:
- Corretude em relação ao enunciado
- Legibilidade e estilo
- Complexidade (tempo/memória)
- Possíveis melhorias e otimizações
Responda em JSON estruturado.`,
        prompt: `Enunciado da tarefa:\n${data.task_statement}\n\nLinguagem: ${data.language}\n\nCódigo do aluno:\n\`\`\`${data.language}\n${data.source}\n\`\`\``,
      });

      // Persist on submission if provided
      if (data.submission_id) {
        await context.supabase.from("submissions").update({ ai_feedback: out as never }).eq("id", data.submission_id);
      }
      return out;
    } catch (e) {
      console.error("AI review failed", e);
      throw new Error("Falha na comunicação com a inteligência artificial. Tente novamente em instantes.");
    }
  });
