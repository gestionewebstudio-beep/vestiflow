import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { SavePurchaseInvoiceDto } from './save-purchase-invoice.dto';

/**
 * ⛔ **La famiglia di difetti che questo file inchioda è costata sette casi in
 * una sessione sola** (26/08/2026): un DTO dichiara `@IsInt()` su un valore che
 * per contratto ha la coda decimale, il `ValidationPipe` globale risponde
 * **400 col messaggio generico**, e l'operatore non sa quale campo.
 *
 * ⚠️ **Perché nessuna rete li prendeva**, ed è strutturale:
 * - TypeScript compila: `number` accetta i decimali;
 * - ESLint tace: il decoratore è sintatticamente perfetto;
 * - i test del service lo chiamano **direttamente**, senza passare dalla pipe;
 * - `api/vitest.config.ts` esclude `src/**\/dto/**` dalla copertura.
 *
 * ⭐ La contromisura è doppia: la guardia `check:dto-decimali` confronta il
 * decoratore con la scala della colonna, e questi test provano che il payload
 * VERO passa. Il secondo serve perché una guardia strutturale non sa cosa il
 * client manda davvero.
 */
describe('SavePurchaseInvoiceDto', () => {
  async function errori(payload: Record<string, unknown>): Promise<readonly string[]> {
    const dto = plainToInstance(SavePurchaseInvoiceDto, payload);
    const esito = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    const out: string[] = [];
    const scendi = (lista: readonly unknown[], prefisso: string): void => {
      for (const e of lista as { property: string; constraints?: Record<string, string>; children?: unknown[] }[]) {
        const dove = prefisso ? `${prefisso}.${e.property}` : e.property;
        for (const c of Object.keys(e.constraints ?? {})) {
          out.push(`${dove}:${c}`);
        }
        if (e.children?.length) {
          scendi(e.children, dove);
        }
      }
    };
    scendi(esito, '');
    return out;
  }

  /** Il payload minimo che la maschera manda davvero, con una riga. */
  function payload(netMinor: number): Record<string, unknown> {
    return {
      supplierId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
      documentDate: '2026-08-26',
      lines: [{ description: 'Servizio', netMinor, vatRatePercent: 22, vatMinor: 451 }],
    };
  }

  it('⭐ il netto SCORPORATO passa, con tutta la sua coda decimale', async () => {
    // 25,00 € ivati al 22% → 2049,1803 centesimi netti, tagliati a QUATTRO cifre
    // di centesimo da `toStorableMinor`. È il valore che il
    // contratto del denaro PRESCRIVE, ed è ciò che fa tornare identico l'ivato
    // quando l'operatore rientra nel documento.
    expect(await errori(payload(2049.1803))).toEqual([]);
  });

  it('⭐ e passa anche il caso banale, il netto già intero', async () => {
    // ⚠️ Serve: una validazione può rompersi in ENTRAMBE le direzioni, e un
    // test sul solo caso decimale non se ne accorgerebbe.
    expect(await errori(payload(2500))).toEqual([]);
  });

  it('⛔ ma la coda oltre le quattro cifre di centesimo non entra', async () => {
    // Oltre lì non c'è precisione: c'è il rumore del float, e la colonna
    // rifiuterebbe la scala. Il taglio è `toStorableMinor`, non l'accettazione.
    const esito = await errori(payload(2049.180328123));

    expect(esito.some((e) => e.includes('netMinor'))).toBe(true);
  });

  it('⭐ un netto NEGATIVO è ammesso, e non è una svista', async () => {
    // ⚠️ Verificato che `@Min(0)` non c’è MAI stato su questo campo (`git show`
    //   prima delle modifiche del 26/08/2026): una riga di fattura d’acquisto
    //   può portare un abbuono o uno sconto, e vale lo stesso per `vatMinor`.
    //
    // ⛔ Questo test è nato SBAGLIATO — asseriva il rifiuto — e stava per far
    //   «correggere» il codice per farlo passare. Un test scritto su
    //   un’assunzione, non su una misura, è peggio di un test mancante.
    expect(await errori(payload(-1))).toEqual([]);
  });
});
