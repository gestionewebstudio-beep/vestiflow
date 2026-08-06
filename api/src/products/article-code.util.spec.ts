import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';

import {
  ARTICLE_CODE_FORMAT_MESSAGE,
  articleCodeTakenMessage,
  assertArticleCodeAvailableInTx,
  assertValidArticleCodeFormat,
  formatArticleCodeProgressive,
  isValidArticleCodeFormat,
  nextArticleCodeInTx,
  normalizeArticleCode,
  resolveArticleCodeForCreateInTx,
} from './article-code.util';

function fakeTx(options?: {
  readonly maxNumericCode?: string;
  readonly existingProductName?: string;
}): Prisma.TransactionClient {
  return {
    // Prima chiamata: advisory lock (risultato ignorato). Seconda: max numerico.
    $queryRaw: vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(
        options?.maxNumericCode ? [{ article_code: options.maxNumericCode }] : [],
      ),
    product: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          options?.existingProductName ? { name: options.existingProductName } : null,
        ),
    },
  } as unknown as Prisma.TransactionClient;
}

describe('article-code.util', () => {
  describe('normalizeArticleCode', () => {
    it('trim + maiuscolo (case-insensitive, §Codice articolo)', () => {
      expect(normalizeArticleCode('  abc001 ')).toBe('ABC001');
    });

    it('vuoto/assente -> null', () => {
      expect(normalizeArticleCode('')).toBeNull();
      expect(normalizeArticleCode('   ')).toBeNull();
      expect(normalizeArticleCode(null)).toBeNull();
      expect(normalizeArticleCode(undefined)).toBeNull();
    });
  });

  describe('isValidArticleCodeFormat', () => {
    it('accetta lettere, cifre, trattino, underscore e slash', () => {
      expect(isValidArticleCodeFormat('ABC-001_X/2')).toBe(true);
      expect(isValidArticleCodeFormat('00001')).toBe(true);
      expect(isValidArticleCodeFormat('abc001')).toBe(true);
    });

    it('rifiuta spazi e altri caratteri speciali', () => {
      expect(isValidArticleCodeFormat('AB C')).toBe(false);
      expect(isValidArticleCodeFormat('AB.C')).toBe(false);
      expect(isValidArticleCodeFormat('AB#1')).toBe(false);
      expect(isValidArticleCodeFormat('')).toBe(false);
    });

    it('rifiuta codici oltre la lunghezza massima', () => {
      expect(isValidArticleCodeFormat('A'.repeat(51))).toBe(false);
      expect(isValidArticleCodeFormat('A'.repeat(50))).toBe(true);
    });
  });

  describe('assertValidArticleCodeFormat', () => {
    it('formato non valido -> 422 con messaggio chiaro', () => {
      expect(() => assertValidArticleCodeFormat('AB C')).toThrowError(
        UnprocessableEntityException,
      );
      expect(() => assertValidArticleCodeFormat('AB C')).toThrowError(
        ARTICLE_CODE_FORMAT_MESSAGE,
      );
    });

    it('formato valido -> nessuna eccezione', () => {
      expect(() => assertValidArticleCodeFormat('ABC-001')).not.toThrow();
    });
  });

  describe('formatArticleCodeProgressive', () => {
    it('zero-padding a 5 cifre (00001, 00002...)', () => {
      expect(formatArticleCodeProgressive(1)).toBe('00001');
      expect(formatArticleCodeProgressive(42)).toBe('00042');
      expect(formatArticleCodeProgressive(99999)).toBe('99999');
    });

    it('oltre 99999 espande a 6+ cifre senza troncare (§progressivo)', () => {
      expect(formatArticleCodeProgressive(100000)).toBe('100000');
      expect(formatArticleCodeProgressive(1234567)).toBe('1234567');
    });
  });

  describe('nextArticleCodeInTx', () => {
    it('primo articolo del tenant -> 00001', async () => {
      await expect(nextArticleCodeInTx(fakeTx(), 'tenant-1')).resolves.toBe('00001');
    });

    it('incrementa il massimo numerico esistente', async () => {
      await expect(
        nextArticleCodeInTx(fakeTx({ maxNumericCode: '00041' }), 'tenant-1'),
      ).resolves.toBe('00042');
    });

    it('a 99999 passa a 100000 senza rompere i codici esistenti', async () => {
      await expect(
        nextArticleCodeInTx(fakeTx({ maxNumericCode: '99999' }), 'tenant-1'),
      ).resolves.toBe('100000');
    });
  });

  describe('assertArticleCodeAvailableInTx', () => {
    it('codice libero -> nessuna eccezione', async () => {
      await expect(
        assertArticleCodeAvailableInTx(fakeTx(), 'tenant-1', 'ABC001'),
      ).resolves.toBeUndefined();
    });

    it('codice occupato -> 409 con il nome dell\'articolo proprietario', async () => {
      await expect(
        assertArticleCodeAvailableInTx(
          fakeTx({ existingProductName: 'Maglia Basic' }),
          'tenant-1',
          'ABC001',
        ),
      ).rejects.toThrowError(articleCodeTakenMessage('Maglia Basic'));
      await expect(
        assertArticleCodeAvailableInTx(
          fakeTx({ existingProductName: 'Maglia Basic' }),
          'tenant-1',
          'ABC001',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('resolveArticleCodeForCreateInTx (regola generale per tutti i flussi)', () => {
    it('codice fornito e valido -> normalizzato in maiuscolo e usato', async () => {
      await expect(
        resolveArticleCodeForCreateInTx(fakeTx(), 'tenant-1', ' abc001 '),
      ).resolves.toBe('ABC001');
    });

    it('codice assente -> progressivo generato', async () => {
      await expect(
        resolveArticleCodeForCreateInTx(fakeTx({ maxNumericCode: '00009' }), 'tenant-1', null),
      ).resolves.toBe('00010');
    });

    it('codice fornito con formato non valido -> 422', async () => {
      await expect(
        resolveArticleCodeForCreateInTx(fakeTx(), 'tenant-1', 'AB C'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('codice fornito già in uso -> 409 con nome articolo', async () => {
      await expect(
        resolveArticleCodeForCreateInTx(
          fakeTx({ existingProductName: 'Polo Estiva' }),
          'tenant-1',
          'ABC001',
        ),
      ).rejects.toThrowError(articleCodeTakenMessage('Polo Estiva'));
    });
  });
});
