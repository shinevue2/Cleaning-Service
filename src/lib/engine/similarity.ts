/**
 * Character-bigram Dice coefficient (Sørensen–Dice) on normalised text.
 * Works well for short Japanese chat messages where word segmentation is not available.
 */
import { normalize } from "./normalize";

function bigrams(text: string): Map<string, number> {
  const chars = Array.from(text);
  const counts = new Map<string, number>();
  for (let i = 0; i < chars.length - 1; i++) {
    const gram = chars[i] + chars[i + 1];
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  return counts;
}

/** 0..1 — 1 for identical normalised strings, 0 when they share no character pair. */
export function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return na.length > 0 ? 1 : 0;
  const ga = bigrams(na);
  const gb = bigrams(nb);
  let sizeA = 0;
  let sizeB = 0;
  ga.forEach((n) => (sizeA += n));
  gb.forEach((n) => (sizeB += n));
  if (sizeA === 0 || sizeB === 0) return 0;
  let overlap = 0;
  ga.forEach((n, gram) => {
    const m = gb.get(gram);
    if (m) overlap += Math.min(n, m);
  });
  return (2 * overlap) / (sizeA + sizeB);
}
