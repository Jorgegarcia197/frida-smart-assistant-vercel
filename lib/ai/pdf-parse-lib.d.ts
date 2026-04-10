/** Subpath of `pdf-parse` that skips the package `index.js` debug harness. */
declare module 'pdf-parse/lib/pdf-parse.js' {
  function pdfParse(
    dataBuffer: Buffer,
    options?: unknown,
  ): Promise<{
    numpages: number;
    text: string;
  }>;
  export default pdfParse;
}
