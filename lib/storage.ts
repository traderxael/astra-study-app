/**
 * Storage de archivos originales (Task 4 + Task 10).
 *
 * Produccion (en este orden de preferencia):
 *  1. Vercel Blob (BLOB_STORE_ID + OIDC): store privado, `put`/`del` con el
 *     token que Vercel inyecta. Es el backend por defecto en Vercel porque el
 *     filesystem de las funciones es de solo lectura.
 *  2. Supabase Storage (bucket SUPABASE_BUCKET, por defecto 'files') con
 *     prefijo `userId/subjectId/` via REST sin agregar la dependencia
 *     @supabase/supabase-js.
 *
 * Desarrollo sin env de Blob/Supabase (R-01, sin infra real): fallback a
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

/**
 * Token de Blob. En Vercel el runtime expone las credenciales OIDC; para
 * usar Blob fuera de Vercel (tests, local) hace falta BLOB_READ_WRITE_TOKEN.
 * Se resuelve en cada llamada (nunca se cachea el token en el cliente).
 */
async function blobToken(): Promise<string | null> {
  const explicit = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (explicit) return explicit;
  const storeId = process.env.BLOB_STORE_ID?.trim();
  if (!storeId) return null;
  try {
    const res = await fetch(
      `https://blob.vercel-storage.com/store/${encodeURIComponent(storeId)}/token`,
      { headers: { authorization: `Bearer ${process.env.VERCEL_OIDC_TOKEN ?? ""}` } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { token?: string };
    return data.token ?? null;
  } catch {
    return null;
  }
}

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
  const suffix = randomUUID().slice(0, 8);
  return `${user}/${subject}/${cleanFilename(filename)}-${suffix}`;
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

  // 1) Vercel Blob (producción en Vercel; el FS de las funciones es RO).
  const token = await blobToken();
  if (token) {
    const res = await fetch(
      `https://blob.vercel-storage.com/${storagePath}?access=private`,
      {
        method: "PUT",
        headers: {
          authorization: `Bearer ${token}`,
          "x-api-version": "7",
          "Content-Type": file.type || "application/octet-stream",
        },
        body: buffer,
      },
    );
    if (!res.ok) throw new Error(`Vercel Blob error: ${res.status}`);
    return storagePath;
  }

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
  const token = await blobToken();
  if (token) {
    await fetch(`https://blob.vercel-storage.com/${storagePath}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}`, "x-api-version": "7" },
    }).catch(() => undefined);
    return;
  }
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
