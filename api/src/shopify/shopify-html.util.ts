const HTML_ENTITY_MAP: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

/** Converte body_html Shopify in testo piano per il gestionale. */
export function shopifyBodyHtmlToPlainText(html: string | null | undefined): string | null {
  if (html == null) {
    return null;
  }

  let text = html
    .replace(/\r\n/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  for (const [entity, char] of Object.entries(HTML_ENTITY_MAP)) {
    text = text.replaceAll(entity, char);
  }

  text = text
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();

  return text.length > 0 ? text : null;
}

/** Converte testo piano VestiFlow in body_html minimo per Shopify. */
export function plainTextToShopifyBodyHtml(text: string | null | undefined): string {
  const trimmed = text?.trim();
  if (!trimmed) {
    return '';
  }

  const paragraphs = trimmed.split(/\n{2,}/);
  return paragraphs
    .map((paragraph) => {
      const lines = paragraph.split('\n').map(escapeHtmlText).join('<br>');
      return `<p>${lines}</p>`;
    })
    .join('');
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Normalizza descrizioni già salvate con HTML grezzo (import legacy). */
export function normalizeProductDescription(description: string | null | undefined): string | null {
  if (description == null || !description.trim()) {
    return null;
  }
  if (!description.includes('<')) {
    return description.trim();
  }
  return shopifyBodyHtmlToPlainText(description);
}
