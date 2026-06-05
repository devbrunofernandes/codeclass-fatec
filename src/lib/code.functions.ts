import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText, Output } from "ai";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const LANG_MAP: Record<string, { piston: string; version: string }> = {
  javascript: { piston: "javascript", version: "20.11.1" },
  python: { piston: "python", version: "3.10.0" },
  java: { piston: "java", version: "15.0.2" },
  c: { piston: "c", version: "10.2.0" },
  cpp: { piston: "c++", version: "10.2.0" },
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

    const res = await fetch("https://emkc.org/api/v2/piston/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language: lang.piston,
        version: lang.version,
        files: [{ name: "main", content: data.source }],
        stdin: data.stdin,
        run_timeout: 3000,
        compile_timeout: 10000,
      }),
    });
    if (!res.ok) throw new Error(`Erro no executor (${res.status})`);
    const json = await res.json() as {
      run: { stdout: string; stderr: string; output: string; code: number; signal: string | null };
      compile?: { stdout: string; stderr: string; code: number };
    };
    const timedOut = json.run.signal === "SIGKILL" || (json.run.stderr ?? "").includes("timed out");
    return {
      stdout: json.run.stdout ?? "",
      stderr: json.run.stderr ?? "",
      exit_code: json.run.code,
      compile_stderr: json.compile?.stderr ?? "",
      timed_out: timedOut,
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
        await context.supabase.from("submissions").update({ ai_feedback: out as object }).eq("id", data.submission_id);
      }
      return out;
    } catch (e) {
      console.error("AI review failed", e);
      throw new Error("Falha na comunicação com a inteligência artificial. Tente novamente em instantes.");
    }
  });
