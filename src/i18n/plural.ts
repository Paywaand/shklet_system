/**
 * Pluralization helpers.
 *
 * English pluralization is a simple `s`-suffix rule; Kurdish (Sorani) does
 * not pluralize nouns the same way, and mixing a number with a Kurdish noun
 * often keeps the noun in its singular/bare form regardless of count. This
 * file centralizes the *display* pattern for count + noun phrases per
 * language so no component hardcodes `count > 1 ? "s" : ""` directly.
 *
 * Usage in a dictionary string, we simply interpolate `{n}` and phrase the
 * surrounding words to already be number-agnostic (Kurdish) or write two
 * variants when English truly needs a plural (see `pluralEn`).
 */

export function pluralEn(n: number, singular: string, plural?: string): string {
  if (n === 1) return singular;
  return plural ?? `${singular}s`;
}

/**
 * Kurdish nouns generally stay in one form whether the count is 1 or many
 * ("داواکاری" = "order"/"orders" both). This helper exists so call sites are
 * explicit about the decision rather than silently assuming English rules,
 * and to give one place to special-case any noun that *does* change form.
 */
export function pluralKu(_n: number, base: string): string {
  return base;
}

export function plural(
  lang: "en" | "ku",
  n: number,
  base: string,
  englishPlural?: string,
): string {
  if (lang === "en") return pluralEn(n, base, englishPlural);
  return pluralKu(n, base);
}
