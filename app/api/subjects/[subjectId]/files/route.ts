/**
 * POST /api/subjects/:id/files — ingeston de un archivo (Task 4).
 *
 * Orden anti-huerfanos (Review Focus 1 y 2):
 * 1. requireSession + materia propia (404 si no existe o es de otro dueno).
 * 2. Tamano >10MB -> 400 SIN tocar storage ni DB.
 * 3. extractText; PDF escaneado sin texto -> 422
 *    { error: 'v1 solo texto digital, OCR en v2' } SIN tocar storage ni DB.
 * 4. Solo con texto valido: saveFile + fila File + chunks; si la
 *    persistencia falla se compensa (deleteFile + delete de filas).
 */
import { requireSession } from "../../../../../lib/auth-guard";
import { prisma } from "../../../../../lib/db";
import {
  extractText,
  ScannedPdfError,
  UnsupportedFileError,
  SCANNED_MESSAGE,
} from "../../../../../lib/text-extract";
import { chunkText, estimateTokenCount } from "../../../../../lib/chunk";
import { saveFile, deleteFile, MAX_FILE_SIZE } from "../../../../../lib/storage";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ subjectId: string }> },
): Promise<Response> {
  const session = await requireSession();
  const { subjectId } = await ctx.params;
  const userId = session.user!.id;

  const subject = await prisma.subject.findUnique({ where: { id: subjectId } });
  if (!subject || subject.userId !== userId) {
    return Response.json({ error: "materia no encontrada" }, { status: 404 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "form-data invalido" }, { status: 400 });
  }

  const file = form.get("file") as
    | (File & { arrayBuffer: () => Promise<ArrayBuffer> })
    | null;
  if (!file || typeof file.arrayBuffer !== "function") {
    return Response.json({ error: "falta file" }, { status: 400 });
  }

  const size = file.size ?? 0;
  if (size > MAX_FILE_SIZE) {
    return Response.json(
      { error: "archivo excede 10MB" },
      { status: 400 },
    );
  }

  let text: string;
  try {
    text = await extractText(file);
  } catch (err) {
    if (err instanceof ScannedPdfError) {
      return Response.json({ error: SCANNED_MESSAGE }, { status: 422 });
    }
    if (err instanceof UnsupportedFileError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    return Response.json(
      { error: "no se pudo extraer texto" },
      { status: 400 },
    );
  }
  if (!text.trim()) {
    return Response.json({ error: SCANNED_MESSAGE }, { status: 422 });
  }

  const pieces = chunkText(text);
  if (pieces.length === 0) {
    return Response.json({ error: SCANNED_MESSAGE }, { status: 422 });
  }

  let storagePath: string;
  try {
    storagePath = await saveFile(userId, subjectId, file);
  } catch {
    return Response.json(
      { error: "error al guardar archivo" },
      { status: 500 },
    );
  }

  const mimeType = file.type || "application/octet-stream";
  let created: { id: string; name: string; mimeType: string; size: number; status: string; subjectId: string } | null = null;
  try {
    created = await prisma.file.create({
      data: { userId, subjectId, name: file.name, mimeType, size },
    });
    await prisma.chunk.createMany({
      data: pieces.map((content, i) => ({
        userId,
        subjectId,
        fileId: created!.id,
        chunkIndex: i,
        content,
        tokenCount: estimateTokenCount(content),
      })),
    });
  } catch {
    await deleteFile(storagePath).catch(() => undefined);
    if (created) {
      await prisma.chunk
        .deleteMany({ where: { fileId: created.id } })
        .catch(() => undefined);
      await prisma.file.delete({ where: { id: created.id } }).catch(() => undefined);
    }
    return Response.json(
      { error: "error al persistir archivo" },
      { status: 500 },
    );
  }

  if (!created) {
    return Response.json(
      { error: "error al persistir archivo" },
      { status: 500 },
    );
  }

  return Response.json(
    {
      file: {
        id: created.id,
        name: created.name,
        mimeType: created.mimeType,
        size: created.size,
        status: created.status,
        subjectId: created.subjectId,
      },
      chunkCount: pieces.length,
      storagePath,
    },
    { status: 201 },
  );
}
