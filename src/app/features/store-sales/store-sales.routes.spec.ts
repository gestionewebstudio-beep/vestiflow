import type { Route } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { DocumentStatus, DocumentType } from '@core/models/document.model';
import { TenantChannelProfile } from '@core/models/tenant-channel-profile.model';
import { UserRole, type User } from '@core/models/user.model';
import { retailSalesRegisterGuard } from '@core/guards/retail-sales.guard';
import { tenantWorkspaceGuard } from '@core/guards/tenant-workspace.guard';
import { unsavedChangesGuard } from '@core/guards/unsaved-changes.guard';
import { REQUIRED_TENANT_PERMISSION_GROUPS_KEY } from '@core/permissions/tenant-permissions.util';

import { routes as appRoutes } from '../../app.routes';
import { storeSaleDocumentRoutes } from '../documents/documents.routes';
import { salesDocumentRegisterConfig } from '../documents/models/document-sales-register.config';
import { DOCUMENT_ROW_OPENS, documentRowPath } from '../documents/models/document-routing.util';
import { storeSalesRegisterRoutes } from './store-sales.routes';
import {
  STORE_SALE_EDIT_SEGMENT,
  STORE_SALE_ROOT_PATH,
  STORE_SALE_ROUTE_SEGMENT,
  requireStoreSaleMode,
  storeSaleEditPath,
} from '@domain/store-sales/models/store-sale-routing.util';

/** Titolare con la cassa aperta: il filtro permessi ha prove sue altrove. */
const TITOLARE_BANCO = {
  role: UserRole.Owner,
  tenantChannelProfile: TenantChannelProfile.Shopify,
} as unknown as User;

/**
 * Le rotte del modulo **Vendite al banco** — presidio di `11` C 3.
 *
 * ⛔ Il censimento del 19/08/2026 ha misurato che **nessuno script di CI legava
 * rotte e permessi**, né la config dell'elenco a una rotta esistente: config e
 * rotte potevano divergere restando verdi. Questo file è quella rete.
 *
 * Le prove non guardano una stringa: guardano **le regole** che la migrazione
 * poteva rompere in silenzio.
 */

const piatte = (rotte: readonly Route[]): readonly Route[] =>
  rotte.flatMap((r) => [r, ...piatte(r.children ?? [])]);

const mountBanco = piatte(appRoutes).find((r) => r.path === 'vendita-al-banco');

describe('il mount del modulo', () => {
  it('esiste, sotto /app', () => {
    expect(mountBanco).toBeDefined();
  });

  /**
   * ⛔ La trappola più grave del censimento. Prima la maschera ereditava la
   * guardia dal mount `sales` e l'elenco da `documents`. Un mount nuovo in cima
   * ad `/app` **non eredita niente**: senza questa riga un operatore di
   * piattaforma entrerebbe nel gestionale di un cliente, e niente lo direbbe.
   */
  it('⛔ ripete tenantWorkspaceGuard: in cima ad /app non si eredita niente', () => {
    expect(mountBanco?.canActivate).toContain(tenantWorkspaceGuard);
  });

  it('la radice dichiarata nel registro corrisponde al mount', () => {
    expect(STORE_SALE_ROOT_PATH).toBe(`/app/${mountBanco?.path}`);
  });
});

describe('le due creazioni', () => {
  const perSegmento = (segmento: string) =>
    storeSalesRegisterRoutes.find((r) => r.path === segmento);

  it('una rotta di creazione per ogni segmento del registro', () => {
    for (const segmento of Object.values(STORE_SALE_ROUTE_SEGMENT)) {
      expect(perSegmento(segmento), `manca la rotta ${segmento}`).toBeDefined();
    }
  });

  it('e una di MODIFICA per ognuno, con lo stesso tipo nei data', () => {
    for (const modo of ['sale', 'return'] as const) {
      const rotta = storeSalesRegisterRoutes.find(
        (r) => r.path === `${STORE_SALE_EDIT_SEGMENT[modo]}/:id/edit`,
      );
      expect(rotta, `manca la modifica per ${modo}`).toBeDefined();
      expect(requireStoreSaleMode(rotta?.data ?? {})).toBe(modo);
    }
  });

  it('quattro rotte in tutto: due creazioni e due modifiche', () => {
    expect(storeSalesRegisterRoutes).toHaveLength(4);
  });

  /**
   * ⚠️ Quattro dichiarazioni, nessuna ridondante: se una rotta perde
   * `retailSalesRegisterGuard` la maschera si apre a chi non ha
   * `retail.register`; se perde `unsavedChangesGuard` si esce da un carrello in
   * corso senza conferma — compreso passando da Vendita a Reso, che è
   * esattamente il caso deciso il 19/08.
   */
  it('⛔ ENTRAMBE portano ENTRAMBE le guardie', () => {
    for (const rotta of storeSalesRegisterRoutes) {
      expect(rotta.canActivate, `${rotta.path}: manca retailSalesRegisterGuard`).toContain(
        retailSalesRegisterGuard,
      );
      expect(rotta.canDeactivate, `${rotta.path}: manca unsavedChangesGuard`).toContain(
        unsavedChangesGuard,
      );
    }
  });

  it('⛔ ognuna dichiara il proprio modo, e il lettore lo accetta', () => {
    expect(requireStoreSaleMode(perSegmento(STORE_SALE_ROUTE_SEGMENT.sale)?.data ?? {})).toBe(
      'sale',
    );
    expect(requireStoreSaleMode(perSegmento(STORE_SALE_ROUTE_SEGMENT.return)?.data ?? {})).toBe(
      'return',
    );
  });

  it('nessuna rotta della maschera è senza modo: il componente lancerebbe', () => {
    for (const rotta of storeSalesRegisterRoutes) {
      expect(() => requireStoreSaleMode(rotta.data ?? {}), `${rotta.path}`).not.toThrow();
    }
  });

  it('i titoli sono quelli decisi', () => {
    expect(perSegmento(STORE_SALE_ROUTE_SEGMENT.sale)?.title).toBe('Nuova vendita al banco');
    expect(perSegmento(STORE_SALE_ROUTE_SEGMENT.return)?.title).toBe('Nuovo reso al banco');
  });

  it('caricano lo STESSO componente: un solo componente, due rotte', () => {
    const sorgenti = storeSalesRegisterRoutes.map((r) => String(r.loadComponent));
    expect(new Set(sorgenti).size).toBe(1);
  });

  /**
   * ⭐ Il cutover del 21/08/2026, inchiodato. Le quattro rotte portano alla
   * maschera DOCUMENTALE: la vecchia `StoreSaleRegisterComponent` — il
   * carrello — è stata eliminata, e nessuna rotta deve tornarci.
   */
  it('⭐ portano alla maschera documentale, non al carrello', () => {
    for (const rotta of storeSalesRegisterRoutes) {
      // Il percorso del file lo riscrive il bundler; il NOME della classe no.
      expect(String(rotta.loadComponent), `${rotta.path}`).toContain(
        'StoreSaleDocumentFormComponent',
      );
    }
  });
});

describe('elenco e dettaglio', () => {
  const elenco = storeSaleDocumentRoutes.find((r) => r.path === '');
  const dettaglio = storeSaleDocumentRoutes.find((r) => r.path === ':id');

  it('l’elenco è la radice del modulo, il dettaglio è :id', () => {
    expect(elenco).toBeDefined();
    expect(dettaglio).toBeDefined();
  });

  it('il titolo dell’elenco è «Vendite al banco», al plurale', () => {
    expect(elenco?.title).toBe('Vendite al banco');
  });

  /** ⚠️ Non è una svista: ce l'ha solo l'elenco. Uniformarli cambia comportamento. */
  it('⚠️ solo l’elenco ha reuse, il dettaglio no', () => {
    expect(elenco?.data?.['reuse']).toBe(true);
    expect(dettaglio?.data?.['reuse']).toBeUndefined();
  });

  /**
   * Senza il profilo il componente ricade su `'generic'` e mostra il registro
   * generale col filtro Tipo: non un errore, una pagina diversa che sembra
   * funzionare.
   */
  it('⛔ entrambe dichiarano il profilo store-sale', () => {
    expect(elenco?.data?.['documentListProfile']).toBe('store-sale');
    expect(dettaglio?.data?.['documentListProfile']).toBe('store-sale');
  });

  /**
   * ⛔ I gruppi di permesso sono lo specchio del gate di classe dell'API, che
   * NON cambia con l'URL. Rinominare la rotta invita a sostituire la sezione
   * Documenti con Vendite, e il risultato è una pagina che si apre e poi
   * fallisce ogni chiamata con 403.
   */
  it('⛔ i permessi restano quelli, sezione Documenti compresa', () => {
    for (const rotta of [elenco, dettaglio]) {
      const gruppi: unknown = rotta?.data?.[REQUIRED_TENANT_PERMISSION_GROUPS_KEY];
      expect(gruppi, `${rotta?.path}: gruppi di permesso assenti`).toBeDefined();
      expect(JSON.stringify(gruppi)).toContain('documents');
    }
  });
});

describe('l’ordine, che è l’unica cosa che rende le rotte raggiungibili', () => {
  /**
   * ⚠️ Il `:id` del dettaglio cattura qualunque segmento: se venisse prima,
   * «nuova-vendita-al-banco» sarebbe letto come identificativo di documento e
   * la maschera non si aprirebbe mai.
   */
  it('⛔ le creazioni PRIMA del :id del dettaglio', () => {
    const composte = [...storeSalesRegisterRoutes, ...storeSaleDocumentRoutes];
    const primaCreazione = composte.findIndex((r) =>
      Object.values(STORE_SALE_ROUTE_SEGMENT).includes(r.path ?? ''),
    );
    const indiceId = composte.findIndex((r) => r.path === ':id');
    expect(primaCreazione).toBeGreaterThanOrEqual(0);
    expect(indiceId).toBeGreaterThan(primaCreazione);
  });
});

/**
 * ⛔ **Qui c'era `describe('i vecchi indirizzi non restano scoperti')`**, con tre
 * prove che inchiodavano i reindirizzamenti da `/app/sales/register` e da
 * `/app/documents/vendite-negozio` (elenco e dettaglio, e il loro ordine
 * rispetto ai catch-all).
 *
 * ⚠️ **I reindirizzamenti sono stati TOLTI il 25/08/2026**, non sono stati
 * dimenticati: decisione del proprietario — «per ora nessuno lo utilizza, è in
 * fase di realizzazione, possiamo sistemare tutto e in modo pulito». Un
 * indirizzo che sopravvive a se stesso è una seconda strada verso la stessa
 * pagina, e prima o poi qualcuno la scrive nei link.
 *
 * ⭐ **Il vincolo che resta vero** — un redirect senza `pathMatch: 'full'` non
 * trascina i segmenti successivi, e va PRIMA del catch-all `:id` — vale per i
 * reindirizzamenti che esistono ancora (Corrispettivi, Bozze fattura), ed è
 * dove va provato se un domani serve.
 */

describe('la config dell’elenco non può divergere dalla rotta', () => {
  /**
   * ⛔ Il censimento ha misurato che nessun test legava `listPath` a una rotta
   * reale: da lì escono clic di riga, «indietro» del dettaglio e navigazione
   * post-eliminazione, e potevano puntare a un indirizzo inesistente restando
   * verdi.
   */
  it('listPath è la radice del modulo', () => {
    const config = salesDocumentRegisterConfig('store-sale');
    expect(config?.listPath).toBe(STORE_SALE_ROOT_PATH);
  });

  it('createPath porta alla creazione vendita, che esiste come rotta', () => {
    const config = salesDocumentRegisterConfig('store-sale');
    const atteso = `${STORE_SALE_ROOT_PATH}/${STORE_SALE_ROUTE_SEGMENT.sale}`;
    expect(config?.createPath).toBe(atteso);
    expect(
      storeSalesRegisterRoutes.some((r) => `${STORE_SALE_ROOT_PATH}/${r.path}` === atteso),
    ).toBe(true);
  });
});

describe('FASE UI 1 — i due comandi di creazione sull’elenco', () => {
  const config = salesDocumentRegisterConfig('store-sale');

  it('l’elenco non è più di sola consultazione', () => {
    expect(config?.hideCreateAction).toBeUndefined();
  });

  /**
   * ⛔ `11` A2 esclude il menu «Nuovo» a tendina: con due tipi i pulsanti
   * dicono da soli cosa si può creare, il menu costerebbe un clic per
   * scoprirlo. Le Fatture restano a menu perché i tipi sono tre.
   */
  it('⛔ due PULSANTI, non il menu a tendina', () => {
    expect(config?.createVariantsLayout).toBe('buttons');
    expect(config?.createVariants).toHaveLength(2);
  });

  it('le etichette sono quelle decise, per esteso', () => {
    expect(config?.createVariants?.map((v) => v.label)).toEqual([
      'Nuova vendita al banco',
      'Nuovo reso al banco',
    ]);
  });

  /**
   * ⛔ Ogni comando deve portare a una rotta che ESISTE. Il censimento aveva
   * misurato che niente legava la config alle rotte: un pulsante verso un
   * indirizzo inesistente sarebbe rimasto verde.
   */
  it('⛔ ogni pulsante porta a una rotta dichiarata', () => {
    const indirizziReali = storeSalesRegisterRoutes.map((r) => `${STORE_SALE_ROOT_PATH}/${r.path}`);
    for (const variante of config?.createVariants ?? []) {
      expect(indirizziReali, `${variante.label} punta a ${variante.path}`).toContain(variante.path);
    }
  });

  it('i due comandi portano a rotte DIVERSE: un refuso li farebbe coincidere', () => {
    const percorsi = (config?.createVariants ?? []).map((v) => v.path);
    expect(new Set(percorsi).size).toBe(percorsi.length);
  });

  /**
   * ⛔ Le rotte sono protette da `retailSalesRegisterGuard`: senza questo
   * flag chi ha «gestisci documenti» ma non `retail.register` vedrebbe i
   * pulsanti e verrebbe rimbalzato in dashboard. Un comando che porta a un
   * rimbalzo è peggio di un comando assente.
   */
  it('⛔ la creazione chiede retail.register, non «gestisci documenti»', () => {
    expect(config?.createRequiresRetailRegister).toBe(true);
  });

  /** ⛔ FASE UI 1 nasce senza «Elimina»: C 0 è parziale, l'API risponde 409. */
  it('⛔ nessun comando di eliminazione è stato introdotto', () => {
    const etichette = (config?.createVariants ?? []).map((v) => v.label.toLowerCase());
    expect(etichette.some((e) => e.includes('elimin'))).toBe(false);
  });

  /**
   * ⛔ Qui c'era il contrario, e inchiodava lo stato aperto: «la riga NON apre
   * ancora la modifica». C 3b è chiuso il 19/08/2026, e la guardia si capovolge
   * con lui — l'anteprima resta, come flusso separato.
   *
   * ⚠️ E qui si leggeva `config.rowOpensForm`, una configurazione di PROFILO:
   * caduta il 20/08/2026 quando la regola è diventata comune a ogni elenco
   * (`14` §2). La prova ora interroga la fonte comune, che è ciò che decide
   * davvero — e vale anche per la ricerca globale.
   */
  it('⛔ la riga apre la MODIFICA, non l’anteprima', () => {
    for (const tipo of [DocumentType.StoreSale, DocumentType.StoreReturn]) {
      expect(DOCUMENT_ROW_OPENS[tipo]).toBe('form');
      expect(
        documentRowPath({ id: 'd1', type: tipo, status: DocumentStatus.Confirmed }, TITOLARE_BANCO),
      ).toContain('/edit');
    }
  });
});

describe('C 3b — la riga apre la modifica, e la maschera sa caricare', () => {
  // ⚠️ Qui c'era `const config = salesDocumentRegisterConfig('store-sale')`, che
  // serviva a leggere `config.rowOpensForm`: quella configurazione di profilo è
  // caduta il 20/08/2026 quando la regola è diventata comune (`14` §2), e la
  // variabile è rimasta orfana.

  it('⭐ le due rotte di modifica esistono, una per tipo', () => {
    for (const modo of ['sale', 'return'] as const) {
      const rotta = storeSalesRegisterRoutes.find(
        (r) => r.path === `${STORE_SALE_EDIT_SEGMENT[modo]}/:id/edit`,
      );
      expect(rotta, `manca la modifica per ${modo}`).toBeDefined();
    }
  });

  /**
   * ⛔ Stesse guardie della creazione: se una rotta di modifica perdesse
   * `retailSalesRegisterGuard` si aprirebbe a chi non ha `retail.register`, e
   * senza `unsavedChangesGuard` si uscirebbe da un documento in corso senza
   * conferma.
   */
  it('⛔ le modifiche portano ENTRAMBE le guardie, come le creazioni', () => {
    const modifiche = storeSalesRegisterRoutes.filter((r) => String(r.path).endsWith('/:id/edit'));
    expect(modifiche).toHaveLength(2);
    for (const rotta of modifiche) {
      expect(rotta.canActivate, `${rotta.path}`).toContain(retailSalesRegisterGuard);
      expect(rotta.canDeactivate, `${rotta.path}`).toContain(unsavedChangesGuard);
    }
  });

  /**
   * ⛔ Il tipo sta nei `data` anche in modifica, e NON si deduce dal documento
   * caricato: è la regola comune, nata dal difetto misurato in `07` §18 —
   * finché la rotta di modifica era una sola e senza tipo, la maschera si
   * comportava da proforma fino alla risposta della lettura.
   */
  it('⛔ anche in modifica il tipo viene dalla rotta, non dal documento', () => {
    for (const modo of ['sale', 'return'] as const) {
      const rotta = storeSalesRegisterRoutes.find(
        (r) => r.path === `${STORE_SALE_EDIT_SEGMENT[modo]}/:id/edit`,
      );
      expect(requireStoreSaleMode(rotta?.data ?? {})).toBe(modo);
    }
  });

  it('l’indirizzo di modifica si compone dalla fonte unica', () => {
    expect(storeSaleEditPath('sale', 'doc-1')).toBe('/app/vendita-al-banco/vendita/doc-1/edit');
    expect(storeSaleEditPath('return', 'doc-1')).toBe('/app/vendita-al-banco/reso/doc-1/edit');
  });

  it('⛔ i due indirizzi di modifica sono DIVERSI: un refuso li farebbe coincidere', () => {
    expect(storeSaleEditPath('sale', 'x')).not.toBe(storeSaleEditPath('return', 'x'));
  });

  it('⭐ ogni indirizzo composto corrisponde a una rotta dichiarata', () => {
    for (const modo of ['sale', 'return'] as const) {
      const composto = storeSaleEditPath(modo, ':id');
      const dichiarate = storeSalesRegisterRoutes.map((r) => `${STORE_SALE_ROOT_PATH}/${r.path}`);
      expect(dichiarate, `${composto} non ha una rotta`).toContain(composto);
    }
  });

  it('⛔ i segmenti di modifica non collidono con quelli di creazione', () => {
    const tutti = [
      ...Object.values(STORE_SALE_ROUTE_SEGMENT),
      ...Object.values(STORE_SALE_EDIT_SEGMENT),
    ];
    expect(new Set(tutti).size).toBe(tutti.length);
  });

  it('la riga dell’elenco apre la maschera, per ENTRAMBI i tipi', () => {
    expect(
      documentRowPath(
        { id: 'd1', type: DocumentType.StoreSale, status: DocumentStatus.Confirmed },
        TITOLARE_BANCO,
      ),
    ).toBe('/app/vendita-al-banco/vendita/d1/edit');
    expect(
      documentRowPath(
        { id: 'd2', type: DocumentType.StoreReturn, status: DocumentStatus.Confirmed },
        TITOLARE_BANCO,
      ),
    ).toBe('/app/vendita-al-banco/reso/d2/edit');
  });

  /** ⚠️ §2.1: un annullato non si modifica, quindi la riga porta all'anteprima. */
  it('⚠️ un documento ANNULLATO apre l’anteprima, non la maschera', () => {
    expect(
      documentRowPath(
        { id: 'd3', type: DocumentType.StoreSale, status: DocumentStatus.Cancelled },
        TITOLARE_BANCO,
      ),
    ).toBe('/app/vendita-al-banco/d3');
  });
});
