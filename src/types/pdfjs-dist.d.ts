declare module "pdf-parse/lib/pdf-parse.js" {
  const pdf: (buffer: Buffer) => Promise<{ text: string }>;
  export default pdf;
}
