/** Parses multipart `handles` field: JSON array string or legacy repeated fields. */
export function parseImportHandles(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.filter((handle): handle is string => typeof handle === 'string' && handle.trim().length > 0);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (handle): handle is string => typeof handle === 'string' && handle.trim().length > 0,
        );
      }
    } catch {
      return [trimmed];
    }
  }

  return undefined;
}
