const USER_MESSAGES: Record<string, string> = {
  missing_category: 'Imposta una categoria TikTok Shop sul prodotto prima della sincronizzazione.',
  not_connected: 'TikTok Shop non è collegato.',
  tiktok_error: 'Sincronizzazione TikTok Shop non riuscita. Riprova tra qualche minuto.',
  oauth_not_configured: 'Integrazione TikTok Shop non configurata sul server.',
};

export function toTikTokUserMessage(code: string | undefined, fallback: string): string {
  if (code && USER_MESSAGES[code]) {
    return USER_MESSAGES[code];
  }
  return fallback;
}
