import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { UpdateTenantFeatureSettingsDto } from './tenant-feature-settings.dto';

/**
 * ⛔ **Il difetto che questi test inchiodano è già costato una schermata intera.**
 *
 * Il 26/08/2026, togliendo dal DTO la riga di una proprietà, sono rimasti i suoi
 * tre decoratori — `@IsOptional() @IsString() @MaxLength(16)` — separati da una
 * riga vuota. Sono caduti sul campo successivo, `defaultVatCodeId`, che è un
 * UUID da 36 caratteri: **ogni salvataggio delle Impostazioni rispondeva 400**,
 * e non solo per l'IVA — il pannello manda un PATCH unico con dentro tutto.
 *
 * ⚠️ **Non lo vedeva niente**: TypeScript compilava (i decoratori sono legali
 * dove erano finiti), ESLint taceva, i test del service passavano 14/14, e
 * `api/vitest.config.ts` esclude `src/**\/dto/**` dalla copertura.
 *
 * ⭐ E la ragione per cui il buco esisteva è ricorrente: i test di validazione
 * verificano quasi sempre che il valore SBAGLIATO venga rifiutato, mai che
 * quello GIUSTO passi. Una validazione troppo stretta resta verde per sempre.
 */
describe('UpdateTenantFeatureSettingsDto', () => {
  async function errori(payload: Record<string, unknown>): Promise<readonly string[]> {
    const dto = plainToInstance(UpdateTenantFeatureSettingsDto, payload);
    const esito = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    return esito.flatMap((e) => Object.keys(e.constraints ?? {}).map((c) => `${e.property}:${c}`));
  }

  const UUID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

  it('⭐ un UUID di codice IVA vero PASSA — 36 caratteri, non 16', async () => {
    // ⛔ È il test che mancava. Con i decoratori orfani addosso, `@MaxLength(16)`
    //   rifiutava questo valore e il salvataggio moriva a 400.
    expect(await errori({ defaultVatCodeId: UUID })).toEqual([]);
  });

  it('⭐ e passa anche insieme al resto, come lo manda il pannello', async () => {
    // ⚠️ Il pannello Impostazioni manda UN PATCH solo: se un campo cade, cade
    //   tutto il salvataggio, non la sola impostazione sbagliata.
    expect(
      await errori({
        lotsEnabled: true,
        serialsEnabled: false,
        manualUnloadEnabled: false,
        defaultVatCodeId: UUID,
        salesPricesIncludeVat: true,
        listino1Name: 'Ingrosso',
        listino1Active: true,
      }),
    ).toEqual([]);
  });

  it('⭐ `null` resta ammesso: «nessun codice IVA predefinito» è uno stato valido', async () => {
    expect(await errori({ defaultVatCodeId: null })).toEqual([]);
  });

  it('⛔ ma un valore che non è un UUID viene ancora rifiutato', async () => {
    // La validazione non si è allentata: si è tolto ciò che non le apparteneva.
    expect(await errori({ defaultVatCodeId: 'pz' })).toContain('defaultVatCodeId:isUuid');
  });

  it('⛔ e un campo che il DTO non conosce non entra', async () => {
    // ⚠️ `defaultUnitOfMeasure` è stata tolta il 26/08/2026: mandarla ora è un
    //   errore esplicito, non un silenzio.
    expect(await errori({ defaultUnitOfMeasure: 'pz' })).toContain(
      'defaultUnitOfMeasure:whitelistValidation',
    );
  });
});
