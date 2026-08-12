import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { AuthService } from '@core/auth';
import { render, screen } from '@testing-library/angular';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { DocumentType } from '@core/models/document.model';
import { TenantPermission } from '@core/models/tenant-permission.model';
import type { TenantPermissionKey } from '@core/models/tenant-permission.model';
import { UserRole } from '@core/models/user.model';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import { ProductService } from '@domain/products/services/product.service';

import { StockOperationFormComponent } from './stock-operation-form.component';
import { DocumentService } from '@domain/documents/services/document.service';
import { DocumentCountersService } from '@domain/documents/services/document-counters.service';

const LOCATIONS = [{ id: 'loc-1', name: 'Milano' }];

function operationalLocationsMock() {
  return {
    locations: () => LOCATIONS,
    writeLocations: () => LOCATIONS,
    actionLocations: () => LOCATIONS,
    transferTargetLocations: () => LOCATIONS,
    defaultLocation: () => null,
    suggestedWriteLocation: () => null,
    isFixedSingleStore: () => false,
    fixedSingleStoreLocationId: () => null,
    fixedSingleStoreLabel: () => null,
  };
}

/** Operatore non titolare: conta solo l'elenco permessi, mai il ruolo. */
function clerkWith(permissions: readonly TenantPermissionKey[]) {
  return { role: UserRole.Clerk, permissions: [...permissions] };
}

describe('StockOperationFormComponent', () => {
  async function setup(permissions: readonly TenantPermissionKey[] = []) {
    await render(StockOperationFormComponent, {
      providers: [
        {
          provide: DocumentCountersService,
          useValue: { available: () => of({ counters: [], proposedCounterId: null }) },
        },
        { provide: AuthService, useValue: { currentUser: () => clerkWith(permissions) } },
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { data: {}, queryParamMap: convertToParamMap({}) },
            paramMap: of(convertToParamMap({})),
            data: of({ stockDocumentType: DocumentType.Adjustment }),
          },
        },
        { provide: OperationalLocationsService, useValue: operationalLocationsMock() },
        { provide: ProductService, useValue: { searchVariantSummaries: () => of([]) } },
        {
          provide: DocumentService,
          useValue: {
            getDocumentById: vi.fn(),
            createDocument: vi.fn(),
            updateDocument: vi.fn(),
            confirmDocument: vi.fn(),
          },
        },
      ],
    });
  }

  // Senza «documents.configure» l'ingranaggio accanto alla serie non compare:
  // l'API nega la scrittura delle numerazioni, il comando risponderebbe 403.
  it('nasconde «Gestisci numerazioni» a chi non configura i documenti', async () => {
    await setup();

    expect(screen.queryByRole('button', { name: 'Gestisci numerazioni' })).toBeNull();
  });

  it('mostra «Gestisci numerazioni» a chi ha documents.configure', async () => {
    await setup([TenantPermission.DocumentsConfigure]);

    // Testata mobile e griglia desktop montano entrambe il campo.
    expect(screen.getAllByRole('button', { name: 'Gestisci numerazioni' }).length).toBeGreaterThan(
      0,
    );
  });
});
