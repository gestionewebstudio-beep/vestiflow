import { describe, expect, it } from 'vitest';

import {
  ARTICOLI_COLLAUDO,
  gidSinteticoAmmesso,
  SEDI_COLLAUDO,
  TENANT_COLLAUDO,
} from './collaudo-shopify.dataset';

/**
 * Il dataset del piano di collaudo e' un DOCUMENTO eseguibile: queste prove verificano che
 * i casi che dichiara di rappresentare siano davvero rappresentati.
 *
 * ⛔ **Senza, il dataset puo' perdere un caso in silenzio.** Se qualcuno «pulisse» le due
 *    righe omonime perche' sembrano un doppione, lo scenario D3 smetterebbe di essere
 *    rappresentabile e nessuno se ne accorgerebbe finche' non prova a eseguirlo.
 */
describe('dataset del collaudo Shopify', () => {
  it('ha DUE tenant: l isolamento non si prova con uno solo', () => {
    const tenant = new Set(ARTICOLI_COLLAUDO.map((a) => a.tenant));
    expect(tenant.size).toBe(2);
    expect(tenant).toContain(TENANT_COLLAUDO.alfa.id);
    expect(tenant).toContain(TENANT_COLLAUDO.beta.id);
  });

  it('ha PIU` sedi, e una deliberatamente senza canale', () => {
    const sedi = Object.values(SEDI_COLLAUDO);
    expect(sedi.length).toBeGreaterThanOrEqual(3);
    expect(sedi.some((s) => s.etichetta === 'ALFA-SENZA-CANALE')).toBe(true);
  });

  it('ha due sedi OMONIME in tenant diversi — il caso F2', () => {
    const omonime = Object.values(SEDI_COLLAUDO).filter((s) => s.nome === 'Negozio Collaudo');
    expect(omonime).toHaveLength(2);
    expect(new Set(omonime.map((s) => s.tenant)).size).toBe(2);
  });

  it('rappresenta D2: un articolo SENZA identificativi', () => {
    const senza = ARTICOLI_COLLAUDO.filter((a) => a.sku === null && a.barcode === null);
    expect(senza.length).toBeGreaterThan(0);
    expect(senza[0]!.caso).toContain('D2');
  });

  it('rappresenta D3: due articoli omonimi nello STESSO tenant', () => {
    const perNome = new Map<string, number>();
    for (const a of ARTICOLI_COLLAUDO.filter((x) => x.tenant === TENANT_COLLAUDO.alfa.id)) {
      perNome.set(a.nome, (perNome.get(a.nome) ?? 0) + 1);
    }
    expect([...perNome.values()].some((n) => n > 1)).toBe(true);
  });

  it('rappresenta D4: due articoli con lo STESSO SKU', () => {
    const perSku = new Map<string, number>();
    for (const a of ARTICOLI_COLLAUDO.filter((x) => x.tenant === TENANT_COLLAUDO.alfa.id)) {
      if (a.sku) perSku.set(a.sku, (perSku.get(a.sku) ?? 0) + 1);
    }
    expect([...perSku.entries()].filter(([, n]) => n > 1)).toHaveLength(1);
  });

  it('rappresenta l isolamento: stesso nome e stesso SKU in due tenant', () => {
    const alfa = ARTICOLI_COLLAUDO.filter((a) => a.tenant === TENANT_COLLAUDO.alfa.id);
    const beta = ARTICOLI_COLLAUDO.filter((a) => a.tenant === TENANT_COLLAUDO.beta.id);
    expect(beta.some((b) => alfa.some((a) => a.nome === b.nome && a.sku === b.sku))).toBe(true);
  });

  it('ogni articolo dichiara QUALE scenario serve', () => {
    for (const a of ARTICOLI_COLLAUDO) {
      expect(a.caso.length, `${a.codice} non dichiara il proprio caso`).toBeGreaterThan(10);
    }
  });

  it('gli identificativi sono unici, e i codici riconoscibili', () => {
    expect(new Set(ARTICOLI_COLLAUDO.map((a) => a.id)).size).toBe(ARTICOLI_COLLAUDO.length);
    expect(new Set(ARTICOLI_COLLAUDO.map((a) => a.codice)).size).toBe(ARTICOLI_COLLAUDO.length);
    for (const a of ARTICOLI_COLLAUDO) {
      expect(a.codice.startsWith('CLD-'), `${a.codice} non e riconoscibile`).toBe(true);
    }
  });

  // ⛔ La rete che impedisce di portare un GID inventato su un negozio vero.
  it('i GID sintetici stanno nella fascia riservata, e quelli veri no', () => {
    for (const a of ARTICOLI_COLLAUDO) {
      if (a.gid) expect(gidSinteticoAmmesso(a.gid), a.gid).toBe(true);
    }
    // Un GID plausibile di un negozio reale NON deve passare per sintetico.
    expect(gidSinteticoAmmesso('gid://shopify/Product/7654321098')).toBe(false);
    expect(gidSinteticoAmmesso('gid://shopify/Product/12345')).toBe(false);
  });
});
