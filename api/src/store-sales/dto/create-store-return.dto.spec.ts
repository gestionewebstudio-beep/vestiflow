// ⚠️ I decoratori di class-transformer/class-validator leggono i metadati via
// `Reflect.getMetadata`, che in Node non esiste finché non lo installa questo
// polyfill. L'applicazione lo carica all'avvio (NestJS lo importa per suo
// conto); l'ambiente di test dell'API no — ed è la ragione per cui finora non
// esisteva nessun test di DTO. Caricarlo QUI tiene la dipendenza dentro il file
// che ne ha bisogno, senza toccare la configurazione globale di vitest.
import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { StoreReturnLineInputDto } from './create-store-return.dto';

/**
 * Guardia sul contratto del prezzo di riga del Reso (T4).
 *
 * ⛔ Il servizio faceva `line.unitPriceMinor ?? 0`, e il campo era facoltativo:
 * un prezzo mancante diventava **zero in silenzio**, e un reso senza importo si
 * registrava come se la merce fosse stata regalata. Ora il DTO lo pretende.
 *
 * ⚠️ **Questa prova non si può fare dal servizio.** I test di
 * `store-sales.service.spec.ts` chiamano il servizio direttamente e non passano
 * dalla `ValidationPipe`: lì un prezzo assente arriverebbe come `undefined`
 * senza che nessuno protesti. Il rifiuto vive nei decoratori, quindi va provato
 * sui decoratori — altrimenti chi rimettesse `@IsOptional()` non troverebbe
 * niente di rosso.
 */
describe('StoreReturnLineInputDto — il prezzo unitario (T4)', () => {
  const riga = (extra: Record<string, unknown>) =>
    validateSync(
      plainToInstance(StoreReturnLineInputDto, {
        variantId: '11111111-1111-4111-8111-111111111111',
        quantity: 1,
        restockable: true,
        ...extra,
      }),
    );

  it('⛔ prezzo ASSENTE: rifiutato, non trattato come zero', () => {
    const errori = riga({});
    expect(errori.map((e) => e.property)).toContain('unitPriceMinor');
  });

  it('⭐ zero ESPLICITO: accettato — c’è chi rende un omaggio', () => {
    expect(riga({ unitPriceMinor: 0 })).toHaveLength(0);
  });

  it('coda decimale fino a 4 cifre di centesimo: accettata', () => {
    expect(riga({ unitPriceMinor: 2049.1803 })).toHaveLength(0);
  });

  it('oltre le 4 cifre non c’è precisione ma rumore del float: rifiutata', () => {
    const errori = riga({ unitPriceMinor: 2049.18031 });
    expect(errori.map((e) => e.property)).toContain('unitPriceMinor');
  });

  it('prezzo negativo: rifiutato', () => {
    const errori = riga({ unitPriceMinor: -1 });
    expect(errori.map((e) => e.property)).toContain('unitPriceMinor');
  });
});
