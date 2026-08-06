/** True se la request punta all'origine di `apiBaseUrl` (solo quelle passano tenant/auth). */
export function isApiRequest(requestUrl: string, apiBaseUrl: string, document: Document): boolean {
  try {
    const base = document.defaultView?.location.href ?? apiBaseUrl;
    const target = new URL(requestUrl, base);
    const api = new URL(apiBaseUrl, base);
    return target.origin === api.origin;
  } catch {
    return false;
  }
}
