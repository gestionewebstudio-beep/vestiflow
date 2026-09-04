import { describe, expect, it } from 'vitest';

import type { VatCode } from '@core/models/vat-code.model';
import type { VariantSummary } from '@domain/products/models/variant-summary.model';

import type {
  CampoArticolo,
  ContestoRichiamoArticolo,
  ProfiloRigaDocumento,
  StatoRigaAlRichiamo,
} from '../models/document-line-article.model';
import { PROFILI_RIGA_DOCUMENTO, campiEffettivi } from '../models/document-line-article.model';
import { resolveDocumentLineArticle } from './document-line-article-resolver.util';

/**
 * I test del contratto `docs/03c-contratto-risolutore-riga.md`.
 *
 * ⛔ **Presidiano il contratto DESIDERATO, non il comportamento attuale.** Le
 * divergenze fra le sette maschere non sono requisiti: sono difetti che questo
 * risolutore elimina, e congelarle in un test le renderebbe irreversibili.
 */

const IVA_22: VatCode = {
  id: 'vat-22',
  code: '22',
  natureId: 'nat-1',
  nature: { id: 'nat-1', key: 'TAXABLE', label: 'Imponibile' } as VatCode['nature'],
  ratePercent: 22,
  nonDeductiblePercent: 0,
  description: 'IVA 22%',
  notes: null,
  usageScope: 'both',
  calculationMode: 'standard',
  vatAffectsSupplierTotal: true,
  isDefault: true,
  isActive: true,
} as VatCode;

const vat = (patch: Partial<VatCode>): VatCode => ({ ...IVA_22, ...patch });

/** Solo vendita, solo acquisto, e uno spento: servono a T5. */
const IVA_SOLO_VENDITA = vat({ id: 'vat-v', code: 'V', usageScope: 'sales' });
const IVA_SOLO_ACQUISTO = vat({ id: 'vat-a', code: 'A', usageScope: 'purchase' });
const IVA_SPENTA = vat({ id: 'vat-off', code: 'OFF', isActive: false });

const CODICI = new Map<string, VatCode>([
  [IVA_22.id, IVA_22],
  [IVA_SOLO_VENDITA.id, IVA_SOLO_VENDITA],
  [IVA_SOLO_ACQUISTO.id, IVA_SOLO_ACQUISTO],
  [IVA_SPENTA.id, IVA_SPENTA],
]);

function articolo(patch: Partial<VariantSummary> = {}): VariantSummary {
  return {
    variantId: 'var-1',
    productId: 'prod-1',
    sku: 'MAG-M-ROS',
    articleCode: 'ART-1',
    productName: 'Maglia',
    // ⚠️ Il display completo CONTIENE la variante: è la trappola di T2.
    title: 'Maglia — M / Rosso',
    variantLabel: 'M / Rosso',
    barcode: '8001',
    sellingPrice: { amountMinor: 2500, currencyCode: 'EUR' },
    purchasePrice: { amountMinor: 1000, currencyCode: 'EUR' },
    unitOfMeasure: 'pz',
    ...patch,
  };
}

function contesto(patch: Partial<ContestoRichiamoArticolo> = {}): ContestoRichiamoArticolo {
  return {
    listino: 'article',
    codiciIvaPerId: CODICI,
    codiceIvaControparte: null,
    codiceIvaPredefinito: null,
    scontoControparte: null,
    codiceFornitoreDigitato: null,
    codiceFornitoreDiTestata: null,
    ...patch,
  };
}

function riga(patch: Partial<StatoRigaAlRichiamo> = {}): StatoRigaAlRichiamo {
  return { variantIdPrecedente: null, rigaPersistita: false, scontoCorrente: '', ...patch };
}

/** Esegue il richiamo su un profilo, con le capacità piene. */
function richiama(
  profilo: ProfiloRigaDocumento,
  patch: {
    articolo?: Partial<VariantSummary> | null;
    contesto?: Partial<ContestoRichiamoArticolo>;
    riga?: Partial<StatoRigaAlRichiamo>;
    campi?: ReadonlySet<CampoArticolo>;
  } = {},
) {
  return resolveDocumentLineArticle({
    articolo: patch.articolo === null ? null : articolo(patch.articolo ?? {}),
    variantIdRichiesto: 'var-1',
    policy: {
      famigliaIva: PROFILI_RIGA_DOCUMENTO[profilo].famigliaIva,
      campi: patch.campi ?? campiEffettivi(profilo, { shopifyAttivo: true, costiVisibili: true }),
    },
    contesto: contesto(patch.contesto),
    riga: riga(patch.riga),
  });
}

/** L'uscita risolta, o fallisce dicendo che non lo era. */
function valori(esito: ReturnType<typeof richiama>) {
  if (esito.esito !== 'risolto') {
    throw new Error(`atteso «risolto», ricevuto «${esito.esito}»`);
  }
  return esito.valori;
}

const PROFILI: readonly ProfiloRigaDocumento[] = [
  'vendita',
  'acquisto-ordine',
  'acquisto-arrivo',
  'movimento-interno',
];

// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⭐ **T1 — Lo stesso articolo, quattro profili, gli stessi dati base.**
 *
 * ⛔ L'asserzione è sull'INTERSEZIONE, non su tutti i campi: i profili hanno
 * capacità diverse per costruzione, e pretendere ogni campo ovunque
 * contraddirebbe la policy stessa.
 */
describe('T1 — lo stesso articolo dà gli stessi dati base in tutti i profili', () => {
  const COMUNI = ['nomeProdotto', 'variantLabel', 'sku', 'articleCode', 'barcode'] as const;

  it.each(COMUNI)('«%s» è identico nei quattro profili', (campo) => {
    const letti = PROFILI.map((p) => valori(richiama(p))[campo]);

    expect(new Set(letti).size).toBe(1);
    expect(letti[0]).toBeDefined();
  });

  it('anche l’eleggibilità a magazzino è identica dove il campo esiste', () => {
    const conIlCampo = PROFILI.filter((p) =>
      PROFILI_RIGA_DOCUMENTO[p].campi.has('gestisceMagazzino'),
    );
    const letti = conIlCampo.map((p) => valori(richiama(p)).gestisceMagazzino);

    expect(conIlCampo.length).toBeGreaterThan(1);
    expect(new Set(letti)).toEqual(new Set([true]));
  });

  /** I campi SPECIFICI: presenza o assenza secondo la capacità dichiarata. */
  it.each([
    ['vendita', 'prezzoUnitarioNettoMinor', true],
    ['vendita', 'costoUnitarioNettoMinor', false],
    ['acquisto-ordine', 'costoUnitarioNettoMinor', true],
    ['acquisto-ordine', 'prezzoUnitarioNettoMinor', false],
    ['acquisto-ordine', 'prezzoVenditaNettoMinor', false],
    ['acquisto-arrivo', 'prezzoVenditaNettoMinor', true],
    ['acquisto-arrivo', 'prezzoBarratoNettoMinor', true],
    ['movimento-interno', 'codiceIva', false],
    ['movimento-interno', 'prezzoUnitarioNettoMinor', false],
    ['movimento-interno', 'costoUnitarioNettoMinor', false],
  ] as const)('%s: «%s» presente = %s', (profilo, chiave, atteso) => {
    expect(chiave in valori(richiama(profilo))).toBe(atteso);
  });
});

/**
 * ⭐ **T2 — La variante non entra mai nel nome.**
 *
 * È la regressione più facile da reintrodurre: `title` contiene già la
 * variante, e basta usarlo come ripiego perché rientri dentro il nome.
 */
describe('T2 — la variante non entra mai nel nome', () => {
  it('nome e variante restano due cose', () => {
    const v = valori(richiama('vendita'));

    expect(v.nomeProdotto).toBe('Maglia');
    expect(v.variantLabel).toBe('M / Rosso');
    expect(v.nomeProdotto).not.toContain('/');
  });

  /**
   * ⛔ Il caso limite va nella direzione opposta a quella che verrebbe
   * naturale: con `productName` vuoto il nome esce VUOTO, non `title`. Usare
   * `title` come ripiego rimetterebbe la variante nel nome proprio nel caso in
   * cui nessuno se ne accorge.
   */
  it('con productName vuoto il nome resta VUOTO, non diventa il display completo', () => {
    const v = valori(richiama('vendita', { articolo: { productName: '' } }));

    expect(v.nomeProdotto).toBe('');
    expect(v.nomeProdotto).not.toBe('Maglia — M / Rosso');
  });

  it('un articolo senza varianti ha etichetta vuota, non un ripiego', () => {
    const v = valori(richiama('vendita', { articolo: { variantLabel: '' } }));

    expect(v.variantLabel).toBe('');
    expect(v.nomeProdotto).toBe('Maglia');
  });
});

/** **T3 — Il reset a parità d'articolo, e i due campi che restano.** */
describe('T3 — il richiamo resetta, tranne quantità e sconto digitato', () => {
  it('a parità di articolo i valori d’anagrafica si riscrivono lo stesso', () => {
    const v = valori(
      richiama('vendita', { riga: { variantIdPrecedente: 'var-1', rigaPersistita: true } }),
    );

    expect(v.nomeProdotto).toBe('Maglia');
    expect(v.unitaDiMisura).toBe('pz');
    expect(v.prezzoUnitarioNettoMinor).toBe(2500);
  });

  it('lo sconto DIGITATO non si tocca, nemmeno se la controparte ne ha uno', () => {
    const v = valori(
      richiama('vendita', {
        contesto: { scontoControparte: '10' },
        riga: { scontoCorrente: '4+10' },
      }),
    );

    expect('sconto' in v).toBe(false);
  });

  it('su campo vuoto si propone quello della controparte, intatto', () => {
    const v = valori(richiama('vendita', { contesto: { scontoControparte: '4+10' } }));

    expect(v.sconto).toBe('4+10');
  });

  /** ⛔ La quantità non compare proprio: la scrive l'acquisizione. */
  it('la quantità non è una chiave dell’uscita', () => {
    expect('quantita' in valori(richiama('vendita'))).toBe(false);
    expect('quantity' in valori(richiama('vendita'))).toBe(false);
  });

  it('sostituire l’articolo su una riga salvata si segnala', () => {
    const esito = richiama('vendita', {
      riga: { variantIdPrecedente: 'var-99', rigaPersistita: true },
    });

    expect(esito.esito).toBe('risolto');
    if (esito.esito !== 'risolto') return;
    expect(esito.segnalazioni).toContainEqual({
      tipo: 'articolo-sostituito-su-riga-salvata',
      precedente: 'var-99',
    });
  });
});

/** **T4 — Il Servizio non fa partire nessuna spunta.** */
describe('T4 — eleggibilità a magazzino', () => {
  it.each([
    ['un Servizio non è eleggibile', { kind: 'service' as const }, false],
    ['managesStock false non è eleggibile', { managesStock: false }, false],
    ['managesStock assente vale true', { managesStock: undefined }, true],
    [
      'un Servizio resta escluso anche con managesStock true',
      { kind: 'service' as const, managesStock: true },
      false,
    ],
  ])('%s', (_caso, patch, atteso) => {
    expect(valori(richiama('vendita', { articolo: patch })).gestisceMagazzino).toBe(atteso);
  });

  /**
   * ⛔ NON dimostra che «Carica = Scarica = Impegna»: dimostra che la stessa
   * natura d'articolo produce la stessa ELEGGIBILITÀ. I tre effetti restano
   * distinti e li mappa il consumer.
   */
  it('la stessa natura d’articolo dà la stessa eleggibilità nei profili che ce l’hanno', () => {
    const conIlCampo = PROFILI.filter((p) =>
      PROFILI_RIGA_DOCUMENTO[p].campi.has('gestisceMagazzino'),
    );
    const letti = conIlCampo.map(
      (p) => valori(richiama(p, { articolo: { kind: 'service' } })).gestisceMagazzino,
    );

    expect(new Set(letti)).toEqual(new Set([false]));
  });

  it('l’esclusione si segnala con la causa', () => {
    const esito = richiama('vendita', { articolo: { managesStock: false } });

    if (esito.esito !== 'risolto') throw new Error('atteso risolto');
    expect(esito.segnalazioni).toContainEqual({
      tipo: 'articolo-non-eleggibile-a-magazzino',
      causa: 'non-gestito',
    });
  });
});

/** **T5 — Le due catene IVA, con l'asserzione su QUALE codice è stato scelto.** */
describe('T5 — la catena del Codice IVA', () => {
  it('vendita: l’articolo vince', () => {
    const v = valori(
      richiama('vendita', {
        articolo: { defaultVatCodeId: IVA_SOLO_VENDITA.id },
        contesto: { codiceIvaPredefinito: IVA_22.id },
      }),
    );

    expect(v.codiceIva).toBe(IVA_SOLO_VENDITA.id);
  });

  it('vendita: senza articolo si prende il predefinito aziendale', () => {
    const v = valori(richiama('vendita', { contesto: { codiceIvaPredefinito: IVA_22.id } }));

    expect(v.codiceIva).toBe(IVA_22.id);
  });

  /** ⭐ L'anello che la vendita non ha. */
  it('acquisto: senza articolo si prende quello del FORNITORE, prima del predefinito', () => {
    const v = valori(
      richiama('acquisto-ordine', {
        contesto: { codiceIvaControparte: IVA_SOLO_ACQUISTO.id, codiceIvaPredefinito: IVA_22.id },
      }),
    );

    expect(v.codiceIva).toBe(IVA_SOLO_ACQUISTO.id);
  });

  it('acquisto: senza articolo né fornitore resta il predefinito', () => {
    const v = valori(
      richiama('acquisto-ordine', { contesto: { codiceIvaPredefinito: IVA_22.id } }),
    );

    expect(v.codiceIva).toBe(IVA_22.id);
  });

  /** ⚠️ Oggi l'anello si salta in silenzio: qui si salta E si dice. */
  it('un codice dell’ALTRA famiglia si salta, e si segnala', () => {
    const esito = richiama('acquisto-ordine', {
      articolo: { defaultVatCodeId: IVA_SOLO_VENDITA.id },
      contesto: { codiceIvaPredefinito: IVA_22.id },
    });

    if (esito.esito !== 'risolto') throw new Error('atteso risolto');
    // Il valore GIUSTO, non solo il rifiuto.
    expect(esito.valori.codiceIva).toBe(IVA_22.id);
    expect(esito.segnalazioni).toContainEqual({
      tipo: 'codice-iva-articolo-di-altra-famiglia',
      vatCodeId: IVA_SOLO_VENDITA.id,
    });
  });

  it('un codice SPENTO non si prende', () => {
    const v = valori(
      richiama('vendita', {
        articolo: { defaultVatCodeId: IVA_SPENTA.id },
        contesto: { codiceIvaPredefinito: IVA_22.id },
      }),
    );

    expect(v.codiceIva).toBe(IVA_22.id);
  });

  it('nessun anello risolve: null, e lo si dice', () => {
    const esito = richiama('vendita');

    if (esito.esito !== 'risolto') throw new Error('atteso risolto');
    expect(esito.valori.codiceIva).toBeNull();
    expect(esito.segnalazioni).toContainEqual({ tipo: 'codice-iva-non-risolto' });
  });

  it('senza famiglia IVA il campo non esiste affatto', () => {
    expect('codiceIva' in valori(richiama('movimento-interno'))).toBe(false);
  });
});

/** **T6 — Il contratto binario dell'IVA resta fuori.** */
describe('T6 — il contratto binario non entra nel risolutore', () => {
  it('«persistedVatCodeId» non è mai una chiave dell’uscita', () => {
    for (const profilo of PROFILI) {
      expect('persistedVatCodeId' in valori(richiama(profilo))).toBe(false);
    }
  });
});

/** **T7 — Il denaro: netto canonico, mai stringhe.** */
describe('T7 — il denaro', () => {
  /**
   * 25,00 € ivati al 22% valgono 2049,1803 centesimi netti — quattro cifre di
   * centesimo, la coda di `toStorableMinor` — ed è quella coda a farli tornare
   * 25,00 quando il prezzo si rimostra ivato.
   */
  it('la coda canonica del netto passa intatta', () => {
    const v = valori(
      richiama('vendita', {
        articolo: { sellingPrice: { amountMinor: 2049.1803, currencyCode: 'EUR' } },
      }),
    );

    expect(v.prezzoUnitarioNettoMinor).toBe(2049.1803);
  });

  /** ⛔ Zero è un costo, non un'assenza. */
  it('un costo zero esce ZERO, non null', () => {
    const v = valori(
      richiama('acquisto-ordine', {
        articolo: { purchasePrice: { amountMinor: 0, currencyCode: 'EUR' } },
      }),
    );

    expect(v.costoUnitarioNettoMinor).toBe(0);
  });

  it('un costo assente esce ZERO: nel dominio un articolo senza costo ha costo 0', () => {
    const v = valori(richiama('acquisto-ordine', { articolo: { purchasePrice: undefined } }));

    expect(v.costoUnitarioNettoMinor).toBe(0);
  });

  /**
   * ⛔ Ma `null` non è zero: un barrato assente è `null`, e verso Shopify la
   * chiave non entra nella riga — «0.00» là è uno sconto inventato del 100%.
   */
  it('un prezzo barrato assente esce null, non zero', () => {
    const v = valori(richiama('acquisto-arrivo', { articolo: { compareAtPrice: undefined } }));

    expect(v.prezzoBarratoNettoMinor).toBeNull();
  });

  it('nessun valore economico esce come stringa', () => {
    const v = valori(richiama('acquisto-arrivo'));

    for (const chiave of ['costoUnitarioNettoMinor', 'prezzoVenditaNettoMinor'] as const) {
      expect(typeof v[chiave]).not.toBe('string');
    }
  });

  it('un articolo senza prezzo per il listino scelto: null, e lo si dice', () => {
    const esito = richiama('vendita', {
      articolo: { listinoPrices: { 1: null, 2: null, 3: null } },
      contesto: { listino: 2 },
    });

    if (esito.esito !== 'risolto') throw new Error('atteso risolto');
    expect(esito.valori.prezzoUnitarioNettoMinor).toBeNull();
    expect(esito.segnalazioni).toContainEqual({
      tipo: 'prezzo-assente-per-listino',
      listino: 2,
    });
  });
});

/** **T8 — L'articolo illeggibile: nessun risultato parziale.** */
describe('T8 — o si risolve tutto, o non si scrive niente', () => {
  it('senza articolo l’esito è «illeggibile» e non ci sono valori', () => {
    const esito = richiama('vendita', { articolo: null });

    expect(esito.esito).toBe('articolo-illeggibile');
    expect('valori' in esito).toBe(false);
  });

  it('l’esito porta il variantId che non si è risolto', () => {
    const esito = richiama('vendita', { articolo: null });

    if (esito.esito !== 'articolo-illeggibile') throw new Error('atteso illeggibile');
    expect(esito.variantId).toBe('var-1');
  });
});

/** Le capacità effettive: profilo meno feature gate meno permessi. */
describe('le capacità effettive tolgono campi al profilo', () => {
  it('senza Shopify il prezzo Shopify non esiste', () => {
    const campi = campiEffettivi('acquisto-arrivo', { shopifyAttivo: false, costiVisibili: true });

    expect(campi.has('prezzoShopifyAnagrafica')).toBe(false);
    expect('prezzoShopifyNettoMinor' in valori(richiama('acquisto-arrivo', { campi }))).toBe(false);
  });

  /**
   * ⛔ Il costo mascherato dai permessi non diventa un `null` da scrivere: il
   * campo non si produce affatto. Un `null` sulla riga CANCELLEREBBE il costo
   * a chi non ha il diritto di vederlo.
   */
  it('col costo mascherato la chiave non esiste, e non arriva un null che lo cancella', () => {
    const campi = campiEffettivi('acquisto-ordine', { shopifyAttivo: true, costiVisibili: false });
    const v = valori(richiama('acquisto-ordine', { campi }));

    expect('costoUnitarioNettoMinor' in v).toBe(false);
  });
});
