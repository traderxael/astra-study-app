// Declaracion minima para pdf-parse v1 (sin @types/pdf-parse).
declare module "pdf-parse" {
  const parse: (buffer: Buffer) => Promise<{ text: string; numpages: number; numrender: number; info: unknown; metadata: unknown; version: string }>;
  export default parse;
}
