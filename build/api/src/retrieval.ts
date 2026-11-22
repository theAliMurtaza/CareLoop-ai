import { createHash } from "node:crypto";
import type { Executor } from "./db/index.js";
import { rows } from "./db/index.js";
// Reproducible lexical feature hashing, not a pretrained semantic embedding.
export function embed(text: string): number[] {
  const v = Array<number>(384).fill(0);
  for (const token of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    const h = createHash("sha256").update(token).digest();
    const index = h.readUInt32BE(0) % 384;
    v[index] = (v[index] ?? 0) + 1;
  }
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => x / norm);
}
export async function retrieve(
  db: Executor,
  testCodes: string[],
  locale: "en" | "ur",
  query: string,
) {
  return rows<{ id: string; content: string; source: string }>(
    db,
    "SELECT id,content,source FROM knowledge_chunks WHERE reviewed AND locale=$1 AND (test_code=ANY($2) OR test_code='general') ORDER BY embedding <=> $3::vector LIMIT 5",
    [locale, testCodes, JSON.stringify(embed(query))],
  );
}
