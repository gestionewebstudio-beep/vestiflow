import { describe, expect, it } from 'vitest';

import { stripHtmlToPlainText } from './html-text.util';

describe('stripHtmlToPlainText', () => {
  it('rimuove tag p', () => {
    expect(stripHtmlToPlainText('<p>Test120</p>')).toBe('Test120');
  });

  it('lascia testo piano invariato', () => {
    expect(stripHtmlToPlainText('Descrizione semplice')).toBe('Descrizione semplice');
  });
});
