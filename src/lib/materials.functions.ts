import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MAX_BYTES = 30 * 1024 * 1024;

const CreateUploadInput = z.object({
  classroom_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  filename: z.string().min(1).max(200),
  size: z.number().int().positive(),
  mime_type: z.string().max(120).optional(),
});

export const createMaterialUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => CreateUploadInput.parse(i))
  .handler(async ({ context, data }) => {
    if (data.size > MAX_BYTES) throw new Error("Arquivo excede 30 MB");
    const { supabase, userId } = context;
    const safeName = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${data.classroom_id}/${crypto.randomUUID()}-${safeName}`;

    const { data: signed, error } = await supabase.storage.from("materials").createSignedUploadUrl(path);
    if (error) throw new Error(error.message);

    const { data: row, error: insertErr } = await supabase.from("materials").insert({
      classroom_id: data.classroom_id, title: data.title, file_path: path,
      file_size: data.size, mime_type: data.mime_type, uploaded_by: userId,
    }).select().single();
    if (insertErr) throw new Error(insertErr.message);

    return { material: row, upload: { url: signed.signedUrl, token: signed.token, path } };
  });

export const listMaterials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ classroom_id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("materials").select("*").eq("classroom_id", data.classroom_id).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getMaterialDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { data: material, error } = await context.supabase
      .from("materials").select("*").eq("id", data.id).maybeSingle();
    if (error || !material) throw new Error("Material não encontrado");
    const { data: signed, error: sErr } = await context.supabase.storage.from("materials").createSignedUrl(material.file_path, 60 * 10);
    if (sErr) throw new Error(sErr.message);
    return { url: signed.signedUrl, title: material.title };
  });

export const deleteMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { data: m } = await context.supabase.from("materials").select("file_path").eq("id", data.id).maybeSingle();
    if (m?.file_path) await context.supabase.storage.from("materials").remove([m.file_path]);
    await context.supabase.from("materials").delete().eq("id", data.id);
    return { ok: true };
  });
