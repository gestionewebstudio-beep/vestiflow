/** Iniziali per avatar testuale: nome+cognome, fallback email. */
export function userInitials(displayName: string, email: string): string {
  const name = displayName.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    const first = parts[0]?.charAt(0) ?? '';
    const last = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? '') : '';
    return (first + last).toUpperCase();
  }
  return email.charAt(0).toUpperCase();
}
