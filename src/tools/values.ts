/**
 * Matching a filter value from a question to a value in the data (ADR 0006 §4): case-insensitive,
 * cities also by the name before the comma, near misses suggested, anything else rejected.
 */

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function cityName(city: string): string {
  return normalize(city.split(",")[0] ?? city);
}

/** The names a value can be asked for by: itself, and for a city also its short name ("austin"). */
function namesOf(value: string, cities: boolean): string[] {
  return cities ? [normalize(value), cityName(value)] : [normalize(value)];
}

/** The value in the data that the input names, or undefined. */
export function matchValue(input: string, values: readonly string[], cities: boolean): string | undefined {
  const wanted = normalize(input);
  return values.find((value) => namesOf(value, cities).includes(wanted));
}

/** Levenshtein distance: the fewest single-character edits that turn one string into the other. */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const substitution = (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
      current.push(Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, substitution));
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}

/** The closest value within a typo's reach (1 edit, or 2 for names of 8 letters or more), or undefined. */
function nearestValue(input: string, values: readonly string[], cities: boolean): string | undefined {
  const wanted = normalize(input);
  let best: { value: string; distance: number } | undefined;
  for (const value of values) {
    for (const name of namesOf(value, cities)) {
      const distance = editDistance(wanted, name);
      const reach = name.length >= 8 ? 2 : 1;
      if (distance <= reach && (best === undefined || distance < best.distance)) best = { value, distance };
    }
  }
  return best?.value;
}

/**
 * Why a value was rejected: a "did you mean" for a near miss, else the known values when there
 * are few enough to list, else a plain "not in the data".
 */
export function unknownValueMessage(
  dimension: string,
  input: unknown,
  values: readonly string[],
  options: { cities: boolean; listable: boolean },
): string {
  if (typeof input !== "string") return `Expected a ${dimension} as text`;
  const unknown = `Unknown ${dimension} "${input}".`;
  const suggestion = nearestValue(input, values, options.cities);
  if (suggestion !== undefined) return `${unknown} Did you mean "${suggestion}"?`;
  if (options.listable) return `${unknown} Known values: ${[...values].sort().join(", ")}.`;
  return `${unknown} It is not in the data.`;
}
