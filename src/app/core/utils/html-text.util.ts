/** Rimuove tag HTML per visualizzazione in gestionale (descrizioni importate da Shopify). */
export function stripHtmlToPlainText(html: string | null | undefined): string | undefined {
  if (html == null || !html.trim()) {
    return undefined;
  }

  if (!html.includes('<') && !html.includes('&lt;')) {
    return html.trim();
  }

  const text = html
    .replace(/\r\n/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text.length > 0 ? text : undefined;
}
