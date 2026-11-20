import type { Direction } from "@/tools/query";

/**
 * The number guard (ADR 0009 §4). The model may write the sentence, but every number in it must
 * appear in the facts block exactly as formatted there, and numbers must be digits: a number word,
 * a fraction or a multiplier ("three", "a quarter of", "twice", "doubled", "2x", "8 times") fails,
 * since it could carry a figure no code produced.
 */

export type GuardVerdict = { ok: true } | { ok: false; reason: string };

// "1,310", "13,695.87", "25.0%", "2025", "3.8". A comma only joins groups of three digits, so
// "2, 8" is two numbers.
const NUMBER = /\d{1,3}(?:,\d{3})+(?:\.\d+)?%?|\d+(?:\.\d+)?%?/g;

const NUMBER_WORDS = new RegExp(
  [
    // Cardinals and ordinals.
    String.raw`\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|dozen)\b`,
    String.raw`\b(?:second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b`,
    // Multipliers and fractions, in any form: twice, doubled, halving, threefold, a quarter of.
    String.raw`\b(?:twice|thrice|half|halves|halved|halving|doubl\w*|tripl\w*|quadrupl\w*|\w+fold)\b`,
    String.raw`\bquarters?\s+of\b`,
    // Digit multipliers: 2x, 8 times, 3×.
    String.raw`\d+(?:\.\d+)?\s*(?:x|×)(?![a-z])`,
    String.raw`\d+(?:\.\d+)?\s+times\b`,
  ].join("|"),
  "i",
);

// Unambiguous superlatives by the direction they point. "most", "least", "minimum" and "maximum" are left out:
// "most reliable", "least reliable", "at least 20" and "a minimum of" say nothing about the ranking.
const HIGH_WORDS = /\b(?:highest|largest|biggest|greatest|slowest|longest)\b/i;
const LOW_WORDS = /\b(?:lowest|fewest|smallest|fastest|quickest|shortest)\b/i;
/** The words that would describe the leaders of a ranking the wrong way round. */
const OPPOSITE_WORDS = { lowest: HIGH_WORDS, highest: LOW_WORDS } as const;
// What a count must not be called (ticket 22: "the share of orders … is 22").
const RATIO_WORDS = /\b(?:shares?|percent|percentage|proportion|fraction|rate|ratio)\b|%/i;

/**
 * Wording the number guard cannot see: a superlative pointing against the ranking's direction
 * (the rows a limit kept are the lowest, the sentence says "slowest"), or a count called a share.
 */
export function checkWording(
  sentence: string,
  context: { direction: Direction | undefined; countLike: boolean },
): GuardVerdict {
  const opposite = context.direction === undefined ? undefined : OPPOSITE_WORDS[context.direction];
  const contradiction = opposite?.exec(sentence);
  if (contradiction) return { ok: false, reason: `"${contradiction[0]}" contradicts the ${context.direction} first ranking` };
  const ratioWord = context.countLike ? RATIO_WORDS.exec(sentence) : null;
  if (ratioWord) return { ok: false, reason: `a count called "${ratioWord[0]}"` };
  return { ok: true };
}

function numbersIn(text: string): string[] {
  return text.match(NUMBER) ?? [];
}

export function checkNumbers(sentence: string, facts: string): GuardVerdict {
  const word = NUMBER_WORDS.exec(sentence);
  if (word !== null) return { ok: false, reason: `the number word "${word[0]}"` };
  const allowed = new Set(numbersIn(facts));
  const invented = numbersIn(sentence).find((number) => !allowed.has(number));
  return invented === undefined ? { ok: true } : { ok: false, reason: `the number "${invented}" is not in the facts` };
}
