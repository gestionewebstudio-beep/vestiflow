import { describe, expect, it } from 'vitest';

import { parseImportHandles } from './parse-import-handles.util';

describe('parseImportHandles', () => {
  it('returns undefined for empty values', () => {
    expect(parseImportHandles(undefined)).toBeUndefined();
    expect(parseImportHandles(null)).toBeUndefined();
    expect(parseImportHandles('')).toBeUndefined();
    expect(parseImportHandles('   ')).toBeUndefined();
  });

  it('parses JSON array string from single multipart field', () => {
    expect(parseImportHandles('["handle-a","handle-b"]')).toEqual(['handle-a', 'handle-b']);
  });

  it('passes through array from legacy repeated handles[] fields', () => {
    expect(parseImportHandles(['handle-a', 'handle-b'])).toEqual(['handle-a', 'handle-b']);
  });

  it('filters empty strings from arrays', () => {
    expect(parseImportHandles(['handle-a', '', '  '])).toEqual(['handle-a']);
  });
});
