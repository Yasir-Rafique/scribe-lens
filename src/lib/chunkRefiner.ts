import { encode } from "gpt-tokenizer";

export interface RefinedChunk {
  id: string;
  page: number;
  index: number;
  text: string;
  tokenCount: number;
}

export function refineChunks(
  rawChunks: string[],
  pageNumber: number = 0,
  maxTokens: number = 500,
  overlap: number = 50
): RefinedChunk[] {
  const refined: RefinedChunk[] = [];
  const seen = new Set<string>(); // <-- prevents duplicates
  let chunkIndex = 0;

  for (const chunk of rawChunks) {
    const clean = chunk.replace(/\s+/g, " ").trim();
    if (!clean) continue;

    const sentences = clean.split(/(?<=[.?!])\s+/);

    let buffer: string[] = [];
    let bufferTokens = 0;

    for (const sentence of sentences) {
      const sentenceTokens = encode(sentence).length;

      if (bufferTokens + sentenceTokens > maxTokens && buffer.length > 0) {
        const text = buffer.join(" ").trim();

        if (!seen.has(text)) {
          refined.push({
            id: `chunk-${pageNumber}-${chunkIndex}`,
            page: pageNumber,
            index: chunkIndex,
            text,
            tokenCount: bufferTokens,
          });
          seen.add(text);
          chunkIndex++;
        }

        // start new buffer with overlap
        const overlapText = buffer.slice(-overlap).join(" ");
        buffer = overlapText ? [overlapText, sentence] : [sentence];
        bufferTokens = encode(buffer.join(" ")).length;
      } else {
        buffer.push(sentence);
        bufferTokens += sentenceTokens;
      }
    }

    // flush remaining
    if (buffer.length > 0) {
      const text = buffer.join(" ").trim();

      if (!seen.has(text)) {
        refined.push({
          id: `chunk-${pageNumber}-${chunkIndex}`,
          page: pageNumber,
          index: chunkIndex,
          text,
          tokenCount: bufferTokens,
        });
        seen.add(text);
        chunkIndex++;
      }
    }
  }

  console.log("Refine Summary", {
    rawChunks: rawChunks.length,
    refinedChunks: refined.length,
    totalTokens: refined.reduce((sum, c) => sum + c.tokenCount, 0),
    avgTokens: Math.round(
      refined.reduce((sum, c) => sum + c.tokenCount, 0) / refined.length
    ),
    maxTokensInChunk: Math.max(...refined.map((c) => c.tokenCount)),
  });

  return refined;
}
