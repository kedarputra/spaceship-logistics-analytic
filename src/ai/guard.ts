import type { ForecastWordingContext } from "@/tools/forecast-answer";
import type { WordingContext } from "@/tools/sentence";

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
// "top" and "bottom" too (ticket 23: "USPS is the top" for the lowest-first ranking).
const HIGH_WORDS = /\b(?:highest|largest|biggest|greatest|slowest|longest|top)\b/i;
const LOW_WORDS = /\b(?:lowest|fewest|smallest|fastest|quickest|shortest|bottom)\b/i;
/** The words that would describe the leaders of a ranking the wrong way round. */
const OPPOSITE_WORDS = { lowest: HIGH_WORDS, highest: LOW_WORDS } as const;
// What a count must not be called (ticket 22: "the share of orders … is 22").
const RATIO_WORDS = /\b(?:shares?|percent|percentage|proportion|fraction|rate|ratio)\b|%/i;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** How many of a series' points the sentence names; "5 Jan" is not named by "15 Jan". */
function pointsNamed(sentence: string, labels: readonly string[]): number {
  return labels.filter((label) => new RegExp(String.raw`(?<![\w/])${escapeRegExp(label)}(?!\w)`).test(sentence)).length;
}

/**
 * Wording the number guard cannot see: a superlative pointing against the ranking's direction
 * (the rows a limit kept are the lowest, the sentence says "slowest" or "top"), a count called a
 * share, or a series listed point by point instead of summarised (ticket 23: 7 tied weeks named).
 */
export function checkWording(sentence: string, context: WordingContext): GuardVerdict {
  const opposite = context.direction === undefined ? undefined : OPPOSITE_WORDS[context.direction];
  const contradiction = opposite?.exec(sentence);
  if (contradiction) return { ok: false, reason: `"${contradiction[0]}" contradicts the ${context.direction} first ranking` };
  const ratioWord = context.countLike ? RATIO_WORDS.exec(sentence) : null;
  if (ratioWord) return { ok: false, reason: `a count called "${ratioWord[0]}"` };
  if (context.series !== undefined) {
    const named = pointsNamed(sentence, context.series.labels);
    if (named > context.series.maxNamed) return { ok: false, reason: `names ${named} points of the series, more than ${context.series.maxNamed}` };
  }
  return { ok: true };
}

// ADR 0003 §7: a plan is units to plan for, never an order to place; the data has no stock on hand.
const ORDERING_WORDS = /\b(?:re-?order\w*|restock\w*|replenish\w*|purchas\w*|buy|buying)\b/i;

function occurrences(text: string, part: string): number {
  return text.split(part).length - 1;
}

/** A month or quarter named on its own: "In Mar 2026", not the end of the range "Jan–Mar 2026". */
function namesOnItsOwn(sentence: string, label: string): boolean {
  return new RegExp(String.raw`(?<![\w–-])${escapeRegExp(label)}(?!\w)`).test(sentence);
}

/**
 * Wording of a forecast sentence the number guard cannot see: the plan read as an order to place
 * (ADR 0003 §7); a SKU not written as the data writes it (ticket 23: "crayon-0008" copied from the
 * question); or months asked about inside the reach without their own demand, as a whole number
 * beside their name (ticket 23: "Q2" answered with the plan through June only).
 */
export function checkForecastWording(sentence: string, context: ForecastWordingContext): GuardVerdict {
  const word = ORDERING_WORDS.exec(sentence);
  if (word !== null) return { ok: false, reason: `"${word[0]}" reads the plan as an order to place` };
  const { skuId, target } = context;
  if (skuId !== undefined) {
    const exact = occurrences(sentence, skuId);
    if (exact === 0 || exact < occurrences(sentence.toLowerCase(), skuId.toLowerCase())) {
      return { ok: false, reason: `the SKU is not written ${skuId}` };
    }
  }
  if (target !== undefined) {
    if (!numbersIn(sentence).includes(target.units)) return { ok: false, reason: `no demand of ${target.units} for the months asked about` };
    if (!target.labels.some((label) => namesOnItsOwn(sentence, label))) return { ok: false, reason: "the months asked about are not named" };
  }
  return { ok: true };
}

function numbersIn(text: string): string[] {
  return text.match(NUMBER) ?? [];
}

/** What breaks the number guard: a number in words or a multiplier, or a number not in the facts. */
export interface NumberProblem {
  kind: "word" | "invented";
  /** The offending text, as the sentence writes it. */
  text: string;
}

export function findNumberProblem(sentence: string, facts: string): NumberProblem | undefined {
  const word = NUMBER_WORDS.exec(sentence);
  if (word !== null) return { kind: "word", text: word[0] };
  const allowed = new Set(numbersIn(facts));
  const invented = numbersIn(sentence).find((number) => !allowed.has(number));
  return invented === undefined ? undefined : { kind: "invented", text: invented };
}

export function checkNumbers(sentence: string, facts: string): GuardVerdict {
  const problem = findNumberProblem(sentence, facts);
  if (problem === undefined) return { ok: true };
  return { ok: false, reason: problem.kind === "word" ? `the number word "${problem.text}"` : `the number "${problem.text}" is not in the facts` };
}
