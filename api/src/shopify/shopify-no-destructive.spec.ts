import { readFileSync } from 'node:fs';

/**
 * VestiFlow non cancella prodotti ne' varianti su Shopify — mai, e non come
 * evoluzione futura (docs/24 §11.1).
 *
 * ⛔ La guardia che gia' esisteva leggeva SOLO il client GraphQL, dove la
 *    cancellazione non c'era mai stata. Quella vera viveva nel client REST —
 *    `DELETE /products/{id}.json` — e nessuna prova la sorvegliava: e' il buco
 *    che questo file chiude, coprendo entrambi i client.
 *
 * ⚠️ Si leggono i SORGENTI, non i metodi del prototipo: una chiamata puo'
 *    rientrare come `fetch` scritta a mano, senza comparire come metodo
 *    pubblico. Il testo del file la mostra comunque.
 *
 * ⚠️ Le DELETE dei WEBHOOK restano ammesse: `deleteWebhooksForAddress` cancella
 *    sottoscrizioni, non catalogo. La guardia cerca cancellazioni di prodotti e
 *    varianti, non la parola «delete».
 */
describe('Shopify — nessuna cancellazione remota di catalogo esprimibile', () => {
  const REST = 'src/shopify/shopify-admin.client.ts';
  const GRAPHQL = 'src/shopify/shopify-graphql.client.ts';

  /**
   * Toglie i commenti prima di cercare: i commenti NOMINANO le cancellazioni
   * per spiegare perche' non si usano, ed e' giusto che restino leggibili.
   * Senza questo filtro la guardia arrosserebbe sulla propria spiegazione.
   */
  const soloCodice = (percorso: string): string =>
    readFileSync(percorso, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

  it('nel client REST nessuna DELETE punta a prodotti o varianti', () => {
    const codice = soloCodice(REST);

    // Ogni `method: 'DELETE'` col testo che lo precede: e' li' che sta il path
    // della richiesta, e quindi la risposta a «DELETE di che cosa?».
    const finestre = [...codice.matchAll(/method:\s*'DELETE'/g)].map((match) =>
      codice.slice(Math.max(0, (match.index ?? 0) - 300), match.index ?? 0),
    );

    const suCatalogo = finestre.filter(
      (finestra) => /\/products\//.test(finestra) || /\/variants\//.test(finestra),
    );

    expect(suCatalogo).toEqual([]);
  });

  it('nel client GraphQL nessuna mutation distruttiva di catalogo', () => {
    const codice = soloCodice(GRAPHQL);

    expect(codice).not.toMatch(/\bproductDelete\b/);
    expect(codice).not.toMatch(/\bproductVariantsBulkDelete\b/);
    expect(codice).not.toMatch(/\bproductVariantDelete\b/);
  });

  it('nessuno dei due client espone un metodo che cancelli prodotti o varianti', () => {
    for (const percorso of [REST, GRAPHQL]) {
      const codice = soloCodice(percorso);

      // Metodi il cui NOME promette una cancellazione di catalogo. I webhook
      // non sono catalogo, quindi `deleteWebhooksForAddress` non rientra.
      const metodi = codice.match(/^\s*(?:async\s+)?\w+\s*\(/gm) ?? [];
      const distruttiviDiCatalogo = metodi
        .map((riga) => riga.trim())
        .filter((riga) => /^(?:async\s+)?(delete|destroy)\w*(Product|Variant)/i.test(riga));

      expect(distruttiviDiCatalogo).toEqual([]);
    }
  });
});
