/**
 * Extraccion de texto digital de archivos subidos (Task 4).
 *
 * - PDF: pdf-parse (texto digital embebido).
 * - .txt/.md: decoder UTF-8.
 *
 * Un PDF escaneado (imagen sin capa de texto) no produce texto util:
 * en vez de romper, lanza ScannedPdfError con el mensaje de v1 para que
 * la ruta devuelva 422 { error: 'v1 solo texto digital, OCR en v2' }.
 * Solo servidor.
 */

// pdf-parse se carga lazy: su código de debug (`if (!module.parent)` lee
// ./test/data/*.pdf) rompería el `next build` al recoger datos de
// página si se evaluara en tiempo de build.

export const SCANNED_MESSAGE = "v1 solo texto digital, OCR en v2";

/** Forma minima de un archivo subido (compatible con el File web). */
export interface FileUpload {
  name: string;
  type?: string;
  size?: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

export class ScannedPdfError extends Error {
  constructor(message = SCANNED_MESSAGE) {
    super(message);
    this.name = "ScannedPdfError";
  }
}

export class UnsupportedFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedFileError";
  }
}

function extOf(file: FileUpload): string {
  return file.name.split(".").pop()?.toLowerCase() ?? "";
}

export async function extractText(file: FileUpload): Promise<string> {
  const ext = extOf(file);
  const mime = (file.type ?? "").toLowerCase();
  const isPdf = ext === "pdf" || mime === "application/pdf";
  const isText =
    ext === "txt" ||
    ext === "md" ||
    ext === "markdown" ||
    mime === "text/plain" ||
    mime === "text/markdown" ||
    mime === "text/x-markdown";

  if (!isPdf && !isText) {
    throw new UnsupportedFileError(`Tipo de archivo no soportado: ${file.name}`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  if (isPdf) {
    const { default: pdfParse } = await import("pdf-parse");
    const parsed = await pdfParse(buffer);
    const text = parsed.text ?? "";
    if (!text.trim()) throw new ScannedPdfError();
    return text;
  }

  return new TextDecoder("utf-8").decode(buffer);
}
