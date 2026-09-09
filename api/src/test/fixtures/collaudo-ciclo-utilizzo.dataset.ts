import { TENANT_COLLAUDO } from './collaudo-shopify.dataset';

import type { SpecProdottoRemoto } from '../integration/shopify-simulato.util';

/**
 * Il dataset della **campagna del ciclo di utilizzo** (`docs/PIANO-COLLAUDO-SHOPIFY.md`,
 * scenario M; rapporto in `docs/RAPPORTO-COLLAUDO-CICLO-UTILIZZO-09-09-2026.md`).
 *
 * ⭐ **Tre aziende sintetiche**: due collegate a negozi simulati DISTINTI, una senza
 *    Shopify con catalogo e documenti. L'isolamento e il vincolo K (`VestiFlow senza
 *    Shopify`) non si provano con un'azienda sola.
 *
 * ⭐ **Deterministico e versionato**: nessun caso, nessuna data, nessun id assegnato a
 *    runtime fuori dal simulatore. La stessa dimensione produce lo stesso catalogo a
 *    ogni esecuzione — è il primo requisito di «riproducibile» del piano, §1.
 *
 * ⚠️ **50 e 500 sono DIMENSIONI DI PROVA, non soglie di prestazione.** Servono a vedere
 *    che le sequenze reggono con più righe e più anomalie, non a misurare Shopify o la
 *    produzione (`docs/24` §8.9.2 vuole una misura sul negozio, non qui).
 *
 * ⛔ **Nessun dato reale.** Nomi inventati, domini `.myshopify.com` inesistenti, GID nella
 *    fascia riservata `99xxxx`: un id di qui non va MAI usato contro un negozio vero.
 */

export const AZIENDE_CICLO = {
  alfa: {
    id: TENANT_COLLAUDO.alfa.id,
    nome: 'COLLAUDO ALFA',
    dominio: 'collaudo-alfa.myshopify.com',
    shopGid: 'gid://shopify/Shop/990001',
    /** Da qui in su gli id che il negozio simulato assegna: fascia 990100–994999. */
    primoId: 990100,
    utente: 'c1a30000-0000-4000-8000-000000000001',
    sede: 'c1a10000-0000-4000-8000-000000000001',
  },
  beta: {
    id: TENANT_COLLAUDO.beta.id,
    nome: 'COLLAUDO BETA',
    dominio: 'collaudo-beta.myshopify.com',
    shopGid: 'gid://shopify/Shop/990002',
    /** Fascia 995100–999999: disgiunta da Alfa, così un id di Beta si riconosce. */
    primoId: 995100,
    utente: 'c1b30000-0000-4000-8000-000000000001',
    sede: 'c1b10000-0000-4000-8000-000000000001',
  },
  gamma: {
    id: 'c1c00000-0000-4000-8000-000000000003',
    nome: 'COLLAUDO GAMMA — senza Shopify',
    utente: 'c1c30000-0000-4000-8000-000000000001',
    sede: 'c1c10000-0000-4000-8000-000000000001',
    documento: 'c1c40000-0000-4000-8000-000000000001',
  },
} as const;

export type DimensioneCollaudo = 5 | 50 | 500;

const TAGLIE = ['S', 'M', 'L'] as const;

/**
 * Il catalogo REMOTO di un negozio, per dimensione.
 *
 * Le anomalie sono quelle che le regole AMMETTONO in arrivo da Shopify
 * (`regole-gestionale`, «SKU e Shopify — clausola di realtà»): SKU assente, SKU
 * duplicato fra prodotti, barcode assente, barcode duplicato. L'import non deve
 * rompersi; l'anomalia va segnalata. Il piano le chiama D4 e D5.
 *
 * | posizione        | anomalia                                              |
 * | ---------------- | ----------------------------------------------------- |
 * | multipli di 7    | la prima variante è SENZA SKU                         |
 * | multipli di 11   | tutte le varianti sono SENZA barcode                  |
 * | multipli di 13   | la prima variante ha lo STESSO SKU del prodotto prima |
 * | il 17            | la prima variante ha lo STESSO barcode del prodotto 16 |
 *
 * ⚠️ Nel catalogo da 5 le stesse quattro forme sono messe a mano — un prodotto per
 *    caso — così gli attesi si leggono riga per riga.
 */
export function catalogoRemoto(dimensione: DimensioneCollaudo, prefisso = 'CR'): SpecProdottoRemoto[] {
  const prodotti: SpecProdottoRemoto[] = [];
  for (let i = 1; i <= dimensione; i += 1) {
    const quanteVarianti = (i % 3) + 1;
    const taglie = TAGLIE.slice(0, quanteVarianti);
    const senzaSkuPrima = dimensione === 5 ? i === 2 : i % 7 === 0;
    const senzaBarcode = dimensione === 5 ? i === 3 : i % 11 === 0;
    const skuDoppio = dimensione === 5 ? i === 4 : i % 13 === 0;
    const barcodeDoppio = dimensione === 5 ? i === 5 : i === 17;
    const varianti = taglie.map((taglia, k) => {
      let sku: string | null = `${prefisso}-${dimensione}-${i}-${taglia}`;
      if (k === 0 && senzaSkuPrima) sku = null;
      if (k === 0 && skuDoppio) sku = `${prefisso}-${dimensione}-${i - 1}-S`;
      let barcode: string | null = barcodeDi(prefisso, dimensione, i, k);
      if (senzaBarcode) barcode = null;
      if (k === 0 && barcodeDoppio) barcode = barcodeDi(prefisso, dimensione, i - 1, 0);
      return { sku, barcode, price: `${10 + (i % 40)}.${k === 0 ? '00' : '50'}`, valori: [taglia] };
    });
    prodotti.push({
      title: `Collaudo remoto ${dimensione}/${i}`,
      body_html: `<p>Articolo di collaudo ${i}</p>`,
      vendor: 'Collaudo',
      product_type: i % 2 === 0 ? 'Maglia' : 'Pantalone',
      tags: `collaudo, lotto-${dimensione}`,
      status: 'active',
      opzioni: [{ name: 'Taglia', values: taglie }],
      varianti,
    });
  }
  return prodotti;
}

/** Un barcode a 13 cifre, riconoscibile e deterministico. */
function barcodeDi(prefisso: string, dimensione: number, i: number, k: number): string {
  const base = prefisso === 'CR' ? '80' : '81';
  return `${base}${String(dimensione).padStart(3, '0')}${String(i).padStart(5, '0')}${k}00`.slice(0, 13);
}

/** Un articolo NATO in VestiFlow, nella forma del DTO di creazione. */
export interface ArticoloLocale {
  readonly name: string;
  readonly articleCode: string;
  readonly brand: string;
  readonly category: string;
  readonly tags: readonly string[];
  readonly options: readonly { readonly name: string; readonly values: readonly string[] }[];
  readonly variants: readonly {
    readonly sku?: string;
    readonly barcode?: string;
    readonly optionValues: readonly { readonly name: string; readonly value: string }[];
    readonly sellingPriceMinor: number;
  }[];
}

/**
 * Il catalogo LOCALE, per dimensione: ciò che si crea in VestiFlow e poi si pubblica.
 *
 * | posizione      | caso                                                          |
 * | -------------- | ------------------------------------------------------------- |
 * | multipli di 7  | una variante SENZA SKU: alla pubblicazione resta scollegata   |
 * | multipli di 11 | varianti senza barcode                                        |
 *
 * ⚠️ Nel catalogo da 5 i due casi stanno al 2 e al 3.
 */
export function catalogoLocale(dimensione: DimensioneCollaudo, prefisso = 'CL'): ArticoloLocale[] {
  const articoli: ArticoloLocale[] = [];
  for (let i = 1; i <= dimensione; i += 1) {
    const quanteVarianti = (i % 3) + 1;
    const taglie = TAGLIE.slice(0, quanteVarianti);
    const senzaSku = dimensione === 5 ? i === 2 : i % 7 === 0;
    const senzaBarcode = dimensione === 5 ? i === 3 : i % 11 === 0;
    articoli.push({
      name: `Collaudo locale ${dimensione}/${i}`,
      articleCode: `${prefisso}-${dimensione}-${String(i).padStart(4, '0')}`,
      brand: 'Collaudo',
      category: i % 2 === 0 ? 'Maglia' : 'Pantalone',
      tags: ['collaudo', `locale-${dimensione}`],
      options: [{ name: 'Taglia', values: taglie }],
      variants: taglie.map((taglia, k) => ({
        ...(k === 0 && senzaSku ? {} : { sku: `${prefisso}-${dimensione}-${i}-${taglia}` }),
        ...(senzaBarcode ? {} : { barcode: barcodeDi(prefisso, dimensione, i, k) }),
        optionValues: [{ name: 'Taglia', value: taglia }],
        sellingPriceMinor: (20 + (i % 30)) * 100 + k * 50,
      })),
    });
  }
  return articoli;
}
