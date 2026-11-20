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
