import { describe, expect, it } from 'vitest';

import {
  azioneEseguibile,
  etichettaDove,
  formaAzione,
  tonoProblema,
  etichettaCausaProblema,
  gruppiPerCausa,
  percorsoProblema,
  problemiCsv,
} from './shopify-problemi.util';
import type { ShopifySetupProblemaDto } from './shopify-setup.dto';

function problema(sovrascrivi: Partial<ShopifySetupProblemaDto>): ShopifySetupProblemaDto {
  return {
    tipo: 'coppia',
    causa: 'coppia_lettura_fallita',
    riferimento: 'v1:l1',
    nome: 'Maglia (SKU-1)',
    dettaglio: 'M',
    sede: 'Sede B',
    conseguenza: 'Base non stabilita: la lettura del canale è fallita.',
    azione: { tipo: 'allinea', etichetta: '«Allinea giacenze su Shopify»', riferimento: null },
    apri: { tipo: 'apri_articolo', etichetta: 'Apri l’articolo', riferimento: 'p1' },
    rilevatoAt: '2026-09-13T01:14:00.000Z',
    ...sovrascrivi,
  };
}

describe('shopify-problemi.util', () => {
  it('75 righe con la stessa causa sono UN gruppo da 75, con i primi tre nomi', () => {
    const problemi = Array.from({ length: 75 }, (_, i) =>
      problema({ riferimento: `v${i}:l1`, nome: `Articolo ${i}` }),
    );
    const gruppi = gruppiPerCausa(problemi);
    expect(gruppi).toHaveLength(1);
    expect(gruppi[0]).toMatchObject({
      causa: 'coppia_lettura_fallita',
      etichetta: 'Quantità senza base: lettura del canale fallita',
      conteggio: 75,
      esempi: ['Articolo 0', 'Articolo 1', 'Articolo 2'],
      azione: { tipo: 'allinea' },
    });
  });

  it('cause diverse restano gruppi diversi, nell’ordine di arrivo', () => {
    const gruppi = gruppiPerCausa([
      problema({ tipo: 'ordine', causa: 'ordine_permesso_fulfillment_orders', nome: '#1010' }),
      problema({ riferimento: 'a', nome: 'A' }),
      problema({ tipo: 'ordine', causa: 'ordine_permesso_fulfillment_orders', nome: '#1011' }),
    ]);
    expect(gruppi.map((g) => [g.causa, g.conteggio])).toEqual([
      ['ordine_permesso_fulfillment_orders', 2],
      ['coppia_lettura_fallita', 1],
    ]);
  });

  it('il codice di una causa diventa una frase; uno sconosciuto resta grezzo, mai vuoto', () => {
    expect(etichettaCausaProblema('connessione_ambiti_mancanti')).toBe('Permessi Shopify mancanti');
    expect(etichettaCausaProblema('x_ignota' as never)).toBe('x_ignota');
  });

  it('ordine e articolo si aprono dal loro percorso; il resto non ha una pagina', () => {
    expect(percorsoProblema({ tipo: 'apri_ordine', etichetta: 'Apri', riferimento: 'o1' })).toBe(
      '/app/sales/o1',
    );
    expect(percorsoProblema({ tipo: 'apri_articolo', etichetta: 'Apri', riferimento: 'p1' })).toBe(
      '/app/products/p1',
    );
    expect(percorsoProblema({ tipo: 'sedi', etichetta: 'Sedi', riferimento: 'gid' })).toBeNull();
    expect(percorsoProblema(null)).toBeNull();
  });

  it('eseguibile: i comandi e le sezioni sì, «nessuna» e i collegamenti no', () => {
    expect(azioneEseguibile({ tipo: 'allinea', etichetta: '', riferimento: null })).toBe(true);
    expect(azioneEseguibile({ tipo: 'permessi', etichetta: '', riferimento: null })).toBe(true);
    expect(azioneEseguibile({ tipo: 'nessuna', etichetta: '', riferimento: null })).toBe(false);
    expect(azioneEseguibile({ tipo: 'apri_ordine', etichetta: '', riferimento: 'o' })).toBe(false);
  });

  it('la forma dell’azione: dove si fa e il perimetro del comando, mai «la singola riga»', () => {
    // docs/29 §2.3 — un solo punto di esecuzione per «Allinea»; i richiami lo
    // dicono per intero (proprietario, 13/09/2026).
    expect(formaAzione({ tipo: 'allinea', etichetta: 'lunga', riferimento: null })).toEqual({
      dove: 'pagina',
      breve: 'Vai ad Allinea giacenze (tutti gli articoli, tutte le sedi)',
    });
    // Il tono: da fare (ambra) contro da valutare (neutro).
    expect(tonoProblema({ tipo: 'allinea', etichetta: 'x', riferimento: null })).toBe('attenzione');
    expect(tonoProblema({ tipo: 'shopify', etichetta: 'x', riferimento: null })).toBe('valutare');
    expect(formaAzione({ tipo: 'sedi', etichetta: 'lunga', riferimento: 'gid' }).dove).toBe(
      'pagina',
    );
    expect(formaAzione({ tipo: 'apri_ordine', etichetta: 'x', riferimento: 'o1' })).toEqual({
      dove: 'vestiflow',
      breve: 'Apri l’ordine',
    });
    // «Su Shopify» e «nessuna» sono DUE forme: la prima serve al risultato.
    expect(
      formaAzione({ tipo: 'shopify', etichetta: 'Su Shopify: stocca…', riferimento: null }),
    ).toEqual({ dove: 'shopify', breve: 'Su Shopify: stocca…' });
    expect(formaAzione({ tipo: 'nessuna', etichetta: 'Niente', riferimento: null }).dove).toBe(
      'nessuna',
    );
    expect(azioneEseguibile({ tipo: 'shopify', etichetta: 'x', riferimento: null })).toBe(false);
    expect(etichettaDove('shopify')).toBe('Su Shopify');
    expect(etichettaDove('pagina')).toBe('In questa pagina');
  });

  it('il CSV: intestazione, BOM, separatore «;», virgolette dove serve, data leggibile', () => {
    const csv = problemiCsv([
      problema({ conseguenza: 'Con "virgolette"; e punto e virgola' }),
      problema({ tipo: 'ordine', nome: '#1010', sede: null, dettaglio: null, rilevatoAt: null }),
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const righe = csv.slice(1).trimEnd().split('\r\n');
    expect(righe[0]).toBe('Tipo;Elemento;Dettaglio;Sede;Causa;Conseguenza;Azione;Rilevato');
    expect(righe[1]).toContain('"Con ""virgolette""; e punto e virgola"');
    expect(righe[1]).toContain('2026-09-13 01:14');
    expect(righe[2]).toBe(
      'Ordine;#1010;;;Quantità senza base: lettura del canale fallita;Base non stabilita: la lettura del canale è fallita.;«Allinea giacenze su Shopify»;',
    );
  });
});
