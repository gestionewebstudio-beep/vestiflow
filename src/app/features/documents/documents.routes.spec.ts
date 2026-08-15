import type { Route } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { DocumentType } from '@core/models/document.model';
import { docManagePermission } from '@core/models/tenant-permission.model';
import { REQUIRED_TENANT_PERMISSION_GROUPS_KEY } from '@core/permissions/tenant-permissions.util';
import {
  SALES_FORM_DOCUMENT_TYPES,
  isSalesFormDocumentType,
} from '@domain/documents/models/document-sales.util';

import { documentsRoutes } from './documents.routes';
import { SALES_FORM_ROUTE_SEGMENT } from './models/document-routing.util';

/**
 * Le rotte della maschera vendita — regressione di `07-…§18`.
 *
 * La maschera serve quattro tipi con regole fiscali diverse. Finché la rotta di
 * modifica era una sola e senza tipo (`sales/:id/edit`), il form lo deduceva dal
 * documento **caricato** e fino alla risposta della GET si comportava da
 * proforma: su una fattura stampava «non valida ai fini IVA».
 *
 * Questi test non guardano un tipo: guardano **la regola**. Un quinto tipo
 * aggiunto alla famiglia li fa fallire finché non ha la sua rotta — che è il
 * momento giusto per accorgersene.
 */
describe('documentsRoutes — il tipo è noto prima della lettura', () => {
  const flatten = (routes: readonly Route[]): readonly Route[] =>
    routes.flatMap((route) => [route, ...flatten(route.children ?? [])]);

  const allRoutes = flatten(documentsRoutes);

  /** Le rotte che aprono la maschera vendita, riconosciute dal componente vero. */
  const salesFormRoutes = async (): Promise<readonly Route[]> => {
    const { SalesDocumentFormComponent } = await import('./sales-document-form.component');
    const found: Route[] = [];
    for (const route of allRoutes) {
      if (!route.loadComponent) {
        continue;
      }
      if ((await route.loadComponent()) === SalesDocumentFormComponent) {
        found.push(route);
      }
    }
    return found;
  };

  it('ogni rotta che apre la maschera vendita dichiara il proprio tipo', async () => {
    const routes = await salesFormRoutes();

    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      const declared = route.data?.['salesDocumentType'] as string | undefined;
      expect(declared, `la rotta "${route.path}" non dichiara salesDocumentType`).toBeDefined();
      expect(
        isSalesFormDocumentType(declared as DocumentType),
        `la rotta "${route.path}" dichiara un tipo che la maschera vendita non gestisce`,
      ).toBe(true);
    }
  });

  it('ogni tipo ha ESATTAMENTE una rotta di creazione e una di modifica', async () => {
    const routes = await salesFormRoutes();

    for (const type of SALES_FORM_DOCUMENT_TYPES) {
      const own = routes.filter((route) => route.data?.['salesDocumentType'] === type);
      const paths = own.map((route) => route.path).sort();

      expect(paths, `rotte del tipo ${type}`).toEqual([
        `${SALES_FORM_ROUTE_SEGMENT[type]}/:id/edit`,
        `${SALES_FORM_ROUTE_SEGMENT[type]}/new`,
      ]);
    }
  });

  it('la vecchia rotta senza tipo non esiste più', () => {
    expect(allRoutes.map((route) => route.path)).not.toContain('sales/:id/edit');
  });

  it('i tre tipi della famiglia Fattura chiedono il permesso della loro famiglia', async () => {
    const routes = await salesFormRoutes();
    const family = [
      DocumentType.InvoiceDraft,
      DocumentType.InvoiceAccompanying,
      DocumentType.CreditNote,
    ];

    for (const type of family) {
      for (const route of routes.filter((r) => r.data?.['salesDocumentType'] === type)) {
        // Le rotte per tipo chiedono il permesso ESATTO: prima, l'unica rotta di
        // modifica accettava «gestisci fatture OPPURE proforma» e lasciava il
        // rifiuto all'API — cioè a maschera già aperta e compilata.
        const groups = JSON.stringify(route.data?.[REQUIRED_TENANT_PERMISSION_GROUPS_KEY]);

        expect(groups, `permessi della rotta "${route.path}"`).toContain(
          docManagePermission('invoice'),
        );
        expect(groups).not.toContain(docManagePermission('proforma'));
      }
    }
  });
});
