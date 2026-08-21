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

import { CreateStoreReturnDto, StoreReturnLineInputDto } from './create-store-return.dto';

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

/**
 * ⛔ L'intento di creazione è OBBLIGATORIO in creazione e non richiesto in
 * modifica (T15B). È un vincolo CONDIZIONALE, e `@ValidateIf` è il solo posto
 * dove può vivere: i test di servizio chiamano il servizio direttamente e non
 * passano dalla `ValidationPipe`, quindi lì questa regola non è dimostrabile.
 *
 * ⚠️ Prima di T15B il campo era `@IsOptional()`, e serviva a far convivere il
 * backend di T15A con un client che l'intento non lo mandava ancora. Migrato il
 * client, il ponte si toglie: senza questi test nessuno si accorgerebbe se
 * qualcuno rimettesse `@IsOptional()`.
 */
describe('CreateStoreReturnDto — l’intento di creazione (T15B)', () => {
  const testata = (extra: Record<string, unknown>) =>
    validateSync(
      plainToInstance(CreateStoreReturnDto, {
        locationId: '11111111-1111-4111-8111-111111111111',
        lines: [
          {
            variantId: '22222222-2222-4222-8222-222222222222',
            quantity: 1,
            restockable: true,
            unitPriceMinor: 1000,
          },
        ],
        ...extra,
      }),
      { whitelist: true },
    );

  it('⛔ CREAZIONE senza intento: rifiutata', () => {
    const errori = testata({});
    expect(errori.map((e) => e.property)).toContain('creationIntentId');
  });

  it('creazione con intento: accettata', () => {
    const errori = testata({ creationIntentId: 'intento-abbastanza-lungo' });
    expect(errori.map((e) => e.property)).not.toContain('creationIntentId');
  });

  it('⭐ MODIFICA senza intento: accettata — non si sta creando niente', () => {
    const errori = testata({ id: '33333333-3333-4333-8333-333333333333' });
    expect(errori.map((e) => e.property)).not.toContain('creationIntentId');
  });

  it('un intento troppo corto è rifiutato: non è un identificativo', () => {
    const errori = testata({ creationIntentId: 'x' });
    expect(errori.map((e) => e.property)).toContain('creationIntentId');
  });
});
