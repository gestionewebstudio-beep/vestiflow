import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import { describe, expect, it } from 'vitest';

import { AuthService } from '@core/auth';
import { TenantChannelProfile } from '@core/models/tenant-channel-profile.model';
import {
  docManagePermission,
  docViewPermission,
  TenantPermission,
} from '@core/models/tenant-permission.model';
import type { TenantPermissionKey } from '@core/models/tenant-permission.model';
import type { User } from '@core/models/user.model';
import { UserRole } from '@core/models/user.model';

import { DocumentsHubComponent } from './documents-hub.component';
import { DOCUMENT_HUB_GROUPS } from './models/documents-hub.model';

/**
 * L'hub è l'indice dei documenti: mostrare una card che il guard di rotta
 * rimbalza è peggio che non mostrarla, perché l'operatore la interpreta come
 * un guasto. Le card si filtrano sulla famiglia, e un gruppo rimasto vuoto
 * sparisce col suo titolo.
 */
function utente(permissions: readonly TenantPermissionKey[]): User {
  return {
    id: 'u1',
    tenantId: 't1',
    email: 'commessa@example.com',
    displayName: 'Commessa',
    avatarUrl: null,
    role: UserRole.Clerk,
    storeIds: [],
    isActive: true,
    isPlatformAdmin: false,
    tenantChannelProfile: TenantChannelProfile.Shopify,
    tenantName: 'Cliente test',
    hasAllLocationsAccess: true,
    assignedLocationIds: [],
    assignedLocations: [],
    defaultLocationId: null,
    defaultLocation: null,
    permissions: [...permissions],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

async function apri(user: User | null): Promise<void> {
  await render(DocumentsHubComponent, {
    providers: [provideRouter([]), { provide: AuthService, useValue: { currentUser: () => user } }],
  });
}

describe('DocumentsHubComponent — card filtrate per famiglia', () => {
  it('mostra solo le famiglie che l’utente può consultare', async () => {
    await apri(utente([TenantPermission.SectionDocuments, docViewPermission('goods_receipt')]));

    expect(screen.getByText('Arrivi merce')).toBeTruthy();
    expect(screen.queryByText('Fattura')).toBeNull();
    expect(screen.queryByText('Preventivi')).toBeNull();
  });

  it('nasconde il titolo del gruppo rimasto senza card', async () => {
    await apri(utente([TenantPermission.SectionDocuments, docViewPermission('goods_receipt')]));

    expect(screen.getByText('Acquisti e fornitori')).toBeTruthy();
    expect(screen.queryByText('Magazzino')).toBeNull();
  });

  it('lascia sempre visibili le voci senza famiglia, già coperte dalla sezione', async () => {
    await apri(utente([TenantPermission.SectionDocuments, docViewPermission('goods_receipt')]));

    expect(screen.getByText('Tutti i documenti')).toBeTruthy();
  });

  it('con «Gestisci» ma senza «Consulta» la card resta: gestire implica consultare', async () => {
    await apri(utente([TenantPermission.SectionDocuments, docManagePermission('invoice')]));

    expect(screen.getByText('Fatture')).toBeTruthy();
  });

  /**
   * Una sola porta per la famiglia Fattura — deciso il 16/08.
   *
   * Erano tre card verso lo stesso elenco, ciascuna con il filtro preimpostato;
   * e finché il filtro decideva anche cosa si creava, sembravano tre documenti
   * diversi. Sciolto quel legame (vedi `document-list.component.ts`), tre porte
   * per una stanza sola raccontano una struttura che non esiste.
   */
  it('la famiglia Fattura ha UNA sola scorciatoia, non tre', async () => {
    await apri(utente([TenantPermission.SectionDocuments, docManagePermission('invoice')]));

    expect(screen.getAllByText('Fatture')).toHaveLength(1);
    expect(screen.queryByText('Fattura accompagnatoria')).toBeNull();
    expect(screen.queryByText('Nota di credito')).toBeNull();
  });

  it('la scorciatoia non preimposta più un tipo: porta all elenco intero', () => {
    const voci = DOCUMENT_HUB_GROUPS.flatMap((gruppo) => gruppo.items).filter(
      (voce) => voce.family === 'invoice',
    );

    expect(voci).toHaveLength(1);
    expect(voci[0]!.queryParams).toBeUndefined();
    expect(voci[0]!.route).toEqual(['/app/documents/fattura']);
  });

  it('senza permessi non resta nessuna card di famiglia', async () => {
    await apri(utente([TenantPermission.SectionDocuments]));

    expect(screen.queryByText('Arrivi merce')).toBeNull();
    expect(screen.queryByText('Ordini cliente')).toBeNull();
    expect(screen.getByText('Tutti i documenti')).toBeTruthy();
  });

  // La cassa non ha una famiglia documento: la governa `retail.register`, e le
  // sue tre condizioni sono le stesse che chiedono sidebar e guard di rotta.
  // Prima erano scritte in tre modi diversi e la card si vedeva comunque.
  it('nasconde «Vendita al banco» a chi non ha il permesso di battere', async () => {
    await apri(utente([TenantPermission.SectionDocuments, TenantPermission.SectionSales]));

    expect(screen.queryByText('Vendita al banco')).toBeNull();
  });

  it('mostra «Vendita al banco» con sezione Vendite e permesso di cassa', async () => {
    await apri(
      utente([
        TenantPermission.SectionDocuments,
        TenantPermission.SectionSales,
        TenantPermission.RetailRegister,
      ]),
    );

    expect(screen.getByText('Vendita al banco')).toBeTruthy();
  });

  it('nasconde la cassa a chi ha il permesso ma non la sezione Vendite', async () => {
    await apri(utente([TenantPermission.SectionDocuments, TenantPermission.RetailRegister]));

    expect(screen.queryByText('Vendita al banco')).toBeNull();
  });

  // «Ordini fornitore» e «Ordini cliente» sono le due sole card che portano
  // fuori dalla sezione Documenti: le loro rotte chiedono anche la sezione di
  // destinazione. Mostrarle con la sola famiglia produce una porta che il guard
  // rimbalza — il difetto che questo filtro esiste per evitare.
  it('nasconde «Ordini fornitore» senza la sezione Fornitori', async () => {
    await apri(utente([TenantPermission.SectionDocuments, docViewPermission('supplier_order')]));

    expect(screen.queryByText('Ordini fornitore')).toBeNull();
  });

  it('mostra «Ordini fornitore» con famiglia e sezione Fornitori', async () => {
    await apri(
      utente([
        TenantPermission.SectionDocuments,
        TenantPermission.SectionSuppliers,
        docViewPermission('supplier_order'),
      ]),
    );

    expect(screen.getByText('Ordini fornitore')).toBeTruthy();
  });

  it('nasconde «Ordini cliente» senza la sezione Vendite', async () => {
    await apri(utente([TenantPermission.SectionDocuments, docViewPermission('sales_order')]));

    expect(screen.queryByText('Ordini cliente')).toBeNull();
  });
});
