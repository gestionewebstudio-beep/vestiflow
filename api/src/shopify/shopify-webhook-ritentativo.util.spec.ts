import { BadRequestException, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { NotificaDaRinviareException } from './shopify-notifica-rinviata.exception';
import { ShopifyTrasportoException } from './shopify-trasporto.util';
import {
  ATTESE_RITENTATIVO_MS,
  attesaDopoIlFallimento,
  naturaDellErrore,
  TENTATIVI_MASSIMI,
} from './shopify-webhook-ritentativo.util';

describe('shopify-webhook-ritentativo.util — cosa si ritenta, e quando', () => {
  it('un tentativo immediato e cinque ritentativi dopo 1, 5, 15, 30, 60 minuti dal fallimento precedente (D1)', () => {
    expect(ATTESE_RITENTATIVO_MS).toEqual([60_000, 300_000, 900_000, 1_800_000, 3_600_000]);
    expect(TENTATIVI_MASSIMI).toBe(6);
    expect(attesaDopoIlFallimento(1)).toBe(60_000);
    expect(attesaDopoIlFallimento(5)).toBe(3_600_000);
    expect(attesaDopoIlFallimento(6)).toBeNull();
  });

  it('una notifica DA RINVIARE (articolo syncing, D8b) è transitoria: stessa ricevuta, attese approvate', () => {
    expect(naturaDellErrore(new NotificaDaRinviareException('in sincronizzazione'))).toBe('transitorio');
  });

  it('transitorio per CAUSA: trasporto di una lettura, 429/THROTTLED oltre i limiti, database irraggiungibile o in conflitto', () => {
    for (const causa of ['timeout', 'rete', 'server', 'scadenza'] as const) {
      expect(naturaDellErrore(new ShopifyTrasportoException(causa, false, 'x'))).toBe('transitorio');
    }
    expect(naturaDellErrore(new HttpException('limitato', HttpStatus.TOO_MANY_REQUESTS))).toBe(
      'transitorio',
    );
    for (const code of ['P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'P2034']) {
      expect(
        naturaDellErrore(
          new Prisma.PrismaClientKnownRequestError('db', { code, clientVersion: 'test' }),
        ),
      ).toBe('transitorio');
    }
    expect(
      naturaDellErrore(new Prisma.PrismaClientInitializationError('giù', 'test', 'P1001')),
    ).toBe('transitorio');
  });

  it('⛔ permanente: lo STESSO trasporto con esito incerto (una scrittura partita), ogni altro 4xx, vincoli, errori generici', () => {
    expect(naturaDellErrore(new ShopifyTrasportoException('timeout', true, 'x'))).toBe(
      'permanente',
    );
    expect(naturaDellErrore(new NotFoundException('non trovato'))).toBe('permanente');
    expect(naturaDellErrore(new BadRequestException('dati'))).toBe('permanente');
    expect(naturaDellErrore(new HttpException('vietato', HttpStatus.FORBIDDEN))).toBe(
      'permanente',
    );
    expect(
      naturaDellErrore(
        new Prisma.PrismaClientKnownRequestError('unico', { code: 'P2002', clientVersion: 't' }),
      ),
    ).toBe('permanente');
    expect(naturaDellErrore(new Error('qualcosa'))).toBe('permanente');
    expect(naturaDellErrore('stringa')).toBe('permanente');
  });
});
