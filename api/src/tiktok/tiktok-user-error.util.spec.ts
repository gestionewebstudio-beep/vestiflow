import { describe, expect, it } from 'vitest';

import { toTikTokUserMessage } from './tiktok-user-error.util';

describe('toTikTokUserMessage', () => {
  it('usa messaggi noti per codice', () => {
    expect(toTikTokUserMessage('missing_category', 'fallback')).toContain('categoria TikTok');
    expect(toTikTokUserMessage('not_connected', 'fallback')).toContain('non è collegato');
    expect(toTikTokUserMessage('oauth_not_configured', 'fallback')).toContain('non configurata');
  });

  it('ritorna fallback se codice sconosciuto', () => {
    expect(toTikTokUserMessage(undefined, 'Errore generico')).toBe('Errore generico');
    expect(toTikTokUserMessage('unknown_code', 'Fallback')).toBe('Fallback');
  });
});
