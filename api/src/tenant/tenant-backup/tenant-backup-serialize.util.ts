/** Serializza righe Prisma in JSON puro (Date → ISO, BigInt → string). */
export function serializeBackupRows<T>(rows: T[]): string {
  return `${JSON.stringify(rows, backupJsonReplacer, 2)}\n`;
}

export function parseBackupRows<T>(json: string): T[] {
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) {
    throw new Error('Formato backup non valido: array JSON atteso.');
  }
  return parsed as T[];
}

function backupJsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
}
