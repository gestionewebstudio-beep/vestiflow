/** Nome file export standard VestiFlow: `{prefix}-vestiflow-YYYY-MM-DD.{ext}`. */
export function vestiflowExportFilename(prefix: string, extension: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `${prefix}-vestiflow-${stamp}.${extension}`;
}
