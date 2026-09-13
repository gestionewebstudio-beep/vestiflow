import { describe, expect, it } from 'vitest';

import { motivoSedeNonDeterminabile } from './shopify-fulfillment-orders.util';
import { ORDINE_SENZA_SEDE_MARCATORE } from './shopify-order-location.util';
import {
  causaOrdineSenzaSede,
  situazioneAttuale,
  type SituazioneInput,
} from './shopify-setup-situazione.util';

/**
 * La SITUAZIONE ATTUALE (13/09/2026): dai dati letti ora ai problemi con causa,
 * conseguenza e azione. Il caso che l'ha fatta nascere è il collaudo: «84 casi
 * da risolvere a mano» che erano 75 volte lo stesso guasto già corretto, e
 * «collega la location» detto a chi aveva un permesso mancante.
 */
describe('situazioneAttuale', () => {
  const vuota: SituazioneInput = {
    ordiniSenzaSede: [],
    coppieSenzaBase: [],
    articoliEsclusi: [],
    esclusiUltimoTentativo: [],
    ultimoTentativoAt: '2026-09-13T01:14:00.000Z',
    ambitiMancanti: [],
    topicMancanti: [],
    ordiniFallitiAttivazione: 0,
  };

  it('senza problemi: elenco vuoto', () => {
    expect(situazioneAttuale(vuota)).toEqual([]);
  });

  it('ordine con permesso mancante: l’azione è Disconnetti e Connetti, non «collega la location»', () => {
    const problemi = situazioneAttuale({
      ...vuota,
      ordiniSenzaSede: [
        {
          id: 'o1',
          orderNumber: '#1010',
          rilevatoAt: new Date('2026-09-13T01:49:00.000Z'),
          reviewReason: motivoSedeNonDeterminabile([
            { tipo: 'permesso_mancante', dettaglio: 'Access denied' },
          ]),
        },
      ],
    });
    expect(problemi).toHaveLength(1);
    expect(problemi[0]).toMatchObject({
      tipo: 'ordine',
      causa: 'ordine_permesso_fulfillment_orders',
      nome: '#1010',
      azione: { tipo: 'permessi' },
      apri: { tipo: 'apri_ordine', riferimento: 'o1' },
    });
    expect(problemi[0]!.azione.etichetta).not.toContain('Collega');
    expect(problemi[0]!.conseguenza).toContain('quantità');
  });

  it('ordine con location non collegata: nomina la location e manda a Sedi', () => {
    const [p] = situazioneAttuale({
      ...vuota,
      ordiniSenzaSede: [
        {
          id: 'o2',
          orderNumber: '#1011',
          rilevatoAt: new Date('2026-09-13T01:49:00.000Z'),
          reviewReason: motivoSedeNonDeterminabile([
            {
              tipo: 'location_non_collegata',
              shopifyLocationGid: 'gid://shopify/Location/9',
              residuoAssegnato: 1,
              letturaCompleta: true,
            },
          ]),
        },
      ],
    });
    expect(p).toMatchObject({
      causa: 'ordine_location_non_collegata',
      dettaglio: 'gid://shopify/Location/9',
      azione: { tipo: 'sedi', riferimento: 'gid://shopify/Location/9' },
    });
  });

  it('motivo scritto PRIMA della lettura dai fulfillment order: «da rileggere», azione reimporta', () => {
    const vecchio = `${ORDINE_SENZA_SEDE_MARCATORE}: il payload Shopify non porta una location collegata a una sede VestiFlow. Nessun impegno preso; collega la location in Impostazioni → Shopify e reimporta.`;
    expect(causaOrdineSenzaSede(vecchio)).toEqual({
      causa: 'ordine_sede_da_rileggere',
      locationGid: null,
    });
    const [p] = situazioneAttuale({
      ...vuota,
      ordiniSenzaSede: [
        {
          id: 'o3',
          orderNumber: '#1012',
          reviewReason: vecchio,
          rilevatoAt: new Date('2026-09-12T23:14:00.000Z'),
        },
      ],
    });
    expect(p!.azione.tipo).toBe('importa_ordini');
    // La data dell'ultima valutazione viaggia col problema: è una fotografia, e lo dice.
    expect(p!.rilevatoAt).toBe('2026-09-12T23:14:00.000Z');
  });

  it('in attesa e riga divisa: nessuna azione, e lo dice', () => {
    const problemi = situazioneAttuale({
      ...vuota,
      ordiniSenzaSede: [
        {
          id: 'a',
          orderNumber: '#1',
          rilevatoAt: new Date('2026-09-13T01:49:00.000Z'),
          reviewReason: motivoSedeNonDeterminabile([{ tipo: 'in_attesa' }]),
        },
        {
          id: 'b',
          orderNumber: '#2',
          rilevatoAt: new Date('2026-09-13T01:49:00.000Z'),
          reviewReason: motivoSedeNonDeterminabile([
            { tipo: 'divisa', shopifyLocationGids: ['gid://shopify/Location/1'] },
          ]),
        },
      ],
    });
    expect(problemi.map((p) => [p.causa, p.azione.tipo])).toEqual([
      ['ordine_assegnazione_in_attesa', 'nessuna'],
      ['ordine_riga_divisa', 'nessuna'],
    ]);
  });

  it('coppie senza base: la causa viene dall’ultimo tentativo, dichiarata con la data; 75 righe = una causa', () => {
    const coppie = Array.from({ length: 75 }, (_, i) => ({
      variantId: `v${i}`,
      productId: `p${i}`,
      locationId: 'l1',
      articolo: `Articolo ${i}`,
      sku: `SKU-${i}`,
      variante: 'M',
      sede: 'Sede B',
    }));
    const problemi = situazioneAttuale({
      ...vuota,
      coppieSenzaBase: coppie,
      esclusiUltimoTentativo: coppie.map((c) => ({
        tipo: 'coppia' as const,
        riferimento: `${c.variantId}:${c.locationId}`,
        nome: c.articolo,
        motivo: 'errore_di_lettura',
        dettaglio: 'Il canale non ha risposto alla lettura',
      })),
    });
    expect(problemi).toHaveLength(75);
    expect(new Set(problemi.map((p) => p.causa))).toEqual(new Set(['coppia_lettura_fallita']));
    expect(problemi[0]).toMatchObject({
      tipo: 'coppia',
      sede: 'Sede B',
      azione: { tipo: 'allinea' },
      apri: { tipo: 'apri_articolo', riferimento: 'p0' },
    });
    expect(problemi[0]!.conseguenza).toContain('2026-09-13 01:14');
  });

  it('coppia non stoccata su Shopify: niente da fare in VestiFlow, e lo dice', () => {
    const [p] = situazioneAttuale({
      ...vuota,
      coppieSenzaBase: [
        {
          variantId: 'v',
          productId: 'p',
          locationId: 'l',
          articolo: 'A',
          sku: null,
          variante: null,
          sede: 'S',
        },
      ],
      esclusiUltimoTentativo: [
        { tipo: 'coppia', riferimento: 'v:l', nome: 'A', motivo: 'sede_non_stoccata' },
      ],
    });
    // ⭐ «Da fare su Shopify», non «nessuna azione»: può essere un'esclusione voluta
    //    o una correzione da fare là — lo decide chi legge (proprietario, 13/09/2026).
    expect(p).toMatchObject({ causa: 'coppia_non_stoccata', azione: { tipo: 'shopify' } });
    expect(p!.azione.etichetta).toContain('Su Shopify');
    expect(p!.conseguenza).toContain('non blocca nient’altro');
  });

  it('con ordini senza sede «Allinea» non è disponibile per le coppie, e l’azione lo dice', () => {
    const [ordine, coppia] = situazioneAttuale({
      ...vuota,
      ordiniSenzaSede: [
        {
          id: 'o',
          orderNumber: '#9',
          rilevatoAt: new Date('2026-09-13T01:49:00.000Z'),
          reviewReason: motivoSedeNonDeterminabile([{ tipo: 'in_attesa' }]),
        },
      ],
      coppieSenzaBase: [
        {
          variantId: 'v',
          productId: 'p',
          locationId: 'l',
          articolo: 'A',
          sku: null,
          variante: null,
          sede: 'S',
        },
      ],
    });
    expect(ordine!.tipo).toBe('ordine');
    expect(coppia!.azione.etichetta).toContain('dopo aver risolto gli ordini senza sede');
  });

  it('coppia senza causa nota: base non stabilita, azione Allinea', () => {
    const [p] = situazioneAttuale({
      ...vuota,
      coppieSenzaBase: [
        {
          variantId: 'v',
          productId: 'p',
          locationId: 'l',
          articolo: 'A',
          sku: 'S1',
          variante: 'L',
          sede: 'S',
        },
      ],
    });
    expect(p).toMatchObject({ causa: 'coppia_senza_base', nome: 'A (S1)', dettaglio: 'L' });
  });

  it('articoli esclusi ancora scollegati: SKU ambiguo e import fallito con l’azione sull’articolo', () => {
    const problemi = situazioneAttuale({
      ...vuota,
      articoliEsclusi: [
        { productId: 'p1', nome: 'Maglia', motivo: 'sku_ambiguo', dettaglio: null },
        { productId: 'p2', nome: 'Giacca', motivo: 'import_fallito', dettaglio: 'timeout' },
      ],
    });
    expect(problemi.map((p) => [p.causa, p.azione.tipo, p.azione.riferimento])).toEqual([
      ['articolo_sku_ambiguo', 'apri_articolo', 'p1'],
      ['articolo_import_fallito', 'apri_articolo', 'p2'],
    ]);
  });

  it('connessione: ambiti mancanti prima di tutto, poi notifiche mancanti; mai verificate = niente', () => {
    const problemi = situazioneAttuale({
      ...vuota,
      ambitiMancanti: ['read_merchant_managed_fulfillment_orders'],
      topicMancanti: ['fulfillment_orders/moved', 'fulfillment_orders/order_routing_complete'],
      ordiniFallitiAttivazione: 2,
    });
    expect(problemi.map((p) => p.causa)).toEqual([
      'connessione_ambiti_mancanti',
      'connessione_webhook_mancanti',
      'ordini_acquisizione_fallita',
    ]);
    expect(problemi[0]!.conseguenza).toContain('fulfillment order');
    expect(problemi[1]!.azione.tipo).toBe('webhook');
    expect(problemi[2]!.azione.tipo).toBe('importa_ordini');

    expect(situazioneAttuale({ ...vuota, topicMancanti: null })).toEqual([]);
  });
});
