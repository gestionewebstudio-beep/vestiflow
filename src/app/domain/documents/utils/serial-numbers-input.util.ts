/** Parsing input seriali da form (comma, punto e virgola o newline). */
export function parseSerialNumbersText(value: string): string[] | undefined {
  const serials = value
    .split(/[\n,;]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return serials.length > 0 ? serials : undefined;
}
