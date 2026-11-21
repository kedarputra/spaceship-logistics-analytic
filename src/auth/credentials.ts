/**
 * What a username and a password may be (ticket 31): one home for the limits, which the users file,
 * the CLI, the session, the sign-in endpoint and the sign-in form all keep. No imports, so the
 * browser can use it too.
 */

export const MAX_USERNAME_LENGTH = 32;
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 256;

/** Lower case letters, digits, dot, dash and underscore, starting with a letter or digit. */
export const USERNAME_PATTERN = new RegExp(`^[a-z0-9][a-z0-9._-]{0,${MAX_USERNAME_LENGTH - 1}}$`);

export const USERNAME_RULE = `A username is up to ${MAX_USERNAME_LENGTH} lower case letters, digits, dots, dashes or underscores.`;

/** A username as typed, as the users file holds it: no surrounding spaces, lower case. */
export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

export function isUsername(name: string): boolean {
  return USERNAME_PATTERN.test(name);
}
