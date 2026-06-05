import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ classroom_id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("messages")
      .select("*, sender:profiles(id, full_name, username)")
      .eq("classroom_id", data.classroom_id)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ classroom_id: z.string().uuid(), body: z.string().min(1).max(2000) }).parse(i))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase.from("messages").insert({
      classroom_id: data.classroom_id, sender_id: context.userId, body: data.body,
    }).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const editMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid(), body: z.string().min(1).max(2000) }).parse(i))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("messages")
      .update({ body: data.body, edited_at: new Date().toISOString() }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
