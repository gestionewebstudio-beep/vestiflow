import type { Customer } from '@core/models/customer.model';
import type { EntityId, IsoDateString } from '@core/models/common.model';

// Anagrafica clienti mock (tenant-aware). cust-001/002/003 coincidono con i
// clienti referenziati dalle vendite mock (coerenza cross-feature).

const TENANT_ID: EntityId = 'tenant-demo';
const CREATED_AT: IsoDateString = '2025-10-01T09:00:00.000Z';

export const MOCK_CUSTOMERS: readonly Customer[] = [
  {
    id: 'cust-001',
    tenantId: TENANT_ID,
    firstName: 'Giulia',
    lastName: 'Bianchi',
    email: 'giulia.bianchi@example.com',
    phone: '+39 333 1234567',
    address: {
      line1: 'Via Toledo 45',
      city: 'Napoli',
      province: 'NA',
      postalCode: '80134',
      country: 'IT',
    },
    createdAt: CREATED_AT,
    updatedAt: '2026-06-01T10:00:00.000Z',
  },
  {
    id: 'cust-002',
    tenantId: TENANT_ID,
    firstName: 'Marco',
    lastName: 'Rossi',
    email: 'marco.rossi@example.com',
    phone: '+39 340 7654321',
    address: {
      line1: 'Corso Buenos Aires 12',
      city: 'Milano',
      province: 'MI',
      postalCode: '20124',
      country: 'IT',
    },
    notes: 'Preferisce ritiro in negozio.',
    createdAt: CREATED_AT,
    updatedAt: '2026-05-28T15:30:00.000Z',
  },
  {
    id: 'cust-003',
    tenantId: TENANT_ID,
    firstName: 'Elena',
    lastName: 'Verdi',
    email: 'elena.verdi@example.com',
    address: {
      line1: 'Via del Corso 101',
      city: 'Roma',
      province: 'RM',
      postalCode: '00186',
      country: 'IT',
    },
    createdAt: CREATED_AT,
    updatedAt: '2026-05-20T11:00:00.000Z',
  },
  {
    id: 'cust-004',
    tenantId: TENANT_ID,
    firstName: 'Luca',
    lastName: 'Esposito',
    email: 'luca.esposito@example.com',
    phone: '+39 328 9988776',
    createdAt: CREATED_AT,
    updatedAt: '2026-05-15T09:45:00.000Z',
  },
  {
    id: 'cust-005',
    tenantId: TENANT_ID,
    firstName: 'Sara',
    lastName: 'Romano',
    email: 'sara.romano@example.com',
    notes: 'Iscritta alla newsletter; taglia abituale S.',
    createdAt: CREATED_AT,
    updatedAt: '2026-05-12T17:20:00.000Z',
  },
  {
    id: 'cust-006',
    tenantId: TENANT_ID,
    firstName: 'Davide',
    lastName: 'Greco',
    phone: '+39 347 1122334',
    createdAt: CREATED_AT,
    updatedAt: '2026-04-30T14:00:00.000Z',
  },
  {
    id: 'cust-007',
    tenantId: TENANT_ID,
    firstName: 'Francesca',
    lastName: 'Marini',
    email: 'francesca.marini@example.com',
    phone: '+39 366 5566778',
    address: {
      line1: 'Via Indipendenza 8',
      city: 'Bologna',
      province: 'BO',
      postalCode: '40121',
      country: 'IT',
    },
    createdAt: CREATED_AT,
    updatedAt: '2026-04-22T10:10:00.000Z',
  },
  {
    id: 'cust-008',
    tenantId: TENANT_ID,
    firstName: 'Antonio',
    lastName: 'Ferrara',
    email: 'antonio.ferrara@example.com',
    notes: 'Cliente storico del negozio di Napoli.',
    createdAt: CREATED_AT,
    updatedAt: '2026-03-18T16:40:00.000Z',
  },
];
