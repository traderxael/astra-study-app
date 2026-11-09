/**
 * Storage de archivos originales (Task 4).
 *
 * Produccion: Supabase Storage (bucket SUPABASE_BUCKET, por defecto
 * 'files') con prefijo `userId/subjectId/` via REST sin agregar la
 * dependencia @supabase/supabase-js.
 *
 * Desarrollo sin env de Supabase (R-01, sin infra real): fallback a
 * disco bajo STORAGE_DIR (por defecto .data/uploads) con el mismo
 * prefijo. Los tests mockean este modulo.
 *
 * R-05: el nombre de archivo se limpia a su basename (se quita cualquier
 * prefijo de rutas / path traversal) antes de formar la clave final.
 * Solo servidor.
 */

import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type { FileUpload } from "./text-extract";

export const MAX_FILE_SIZE = 10 * 1024 * 1024;

function cleanSegment(value: string, fallback: string): string {
  const trimmed = value.trim().replace(/^\/+/, "");
  return trimmed || fallback;
}

function cleanFilename(filename: string): string {
  // R-05 strip prefix: quedarse solo con el basename, sin directorios.
  const base = filename.split("/").pop()?.split("\\").pop() ?? "";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "");
  return cleaned || `file-${randomUUID()}`;
}

export function buildStoragePath(
  userId: string,
  subjectId: string,
  filename: string,
): string {
  const user = cleanSegment(userId, "user");
  const subject = cleanSegment(subjectId, "subject");
  return `${user}/${subject}/${cleanFilename(filename)}`;
}

type FileLike = FileUpload & { arrayBuffer: () => Promise<ArrayBuffer> };

function supabaseConfig(): { url: string; key: string; bucket: string } | null {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key, bucket: process.env.SUPABASE_BUCKET?.trim() || "files" };
}

function fallbackDir(): string {
  return process.env.STORAGE_DIR?.trim() || path.join(process.cwd(), ".data", "uploads");
}

/**
 * Guarda el binario bajo el prefijo userId/subjectId/ y devuelve la clave.
 * Nunca se escribe nada si el llamante no lo ha validado antes (la ruta
 * valida tamano y extrae texto antes de llamar aqui para no dejar huerfanos).
 */
export async function saveFile(
  userId: string,
  subjectId: string,
  file: FileLike,
): Promise<string> {
  const storagePath = buildStoragePath(userId, subjectId, file.name);
  const buffer = Buffer.from(await file.arrayBuffer());
  const supabase = supabaseConfig();

  if (supabase) {
    const res = await fetch(
      `${supabase.url}/storage/v1/object/${supabase.bucket}/${storagePath}`,
      {
        method: "POST",
        headers: {
          apikey: supabase.key,
          Authorization: `Bearer ${supabase.key}`,
          "Content-Type": file.type || "application/octet-stream",
          "x-upsert": "true",
        },
        body: buffer,
      },
    );
    if (!res.ok) throw new Error(`Supabase Storage error: ${res.status}`);
    return storagePath;
  }

  const dest = path.join(fallbackDir(), storagePath);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, buffer);
  return storagePath;
}

/** Borra un archivo guardado con saveFile. Idempotente (sin error si no existe). */
export async function deleteFile(storagePath: string): Promise<void> {
  const supabase = supabaseConfig();
  if (supabase) {
    await fetch(
      `${supabase.url}/storage/v1/object/${supabase.bucket}/${storagePath}`,
      {
        method: "DELETE",
        headers: {
          apikey: supabase.key,
          Authorization: `Bearer ${supabase.key}`,
        },
      },
    ).catch(() => undefined);
    return;
  }
  const dest = path.join(fallbackDir(), storagePath);
  await unlink(dest).catch(() => undefined);
}
