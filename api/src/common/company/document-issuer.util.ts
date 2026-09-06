import { Prisma } from '@prisma/client';

/**
 * Chi emette il documento: l'azienda gestita nel gestionale, quella che il
 * titolare dichiara in Impostazioni → Dati azienda.
 *
 * Non è il cliente VestiFlow. I campi anagrafici sul `Tenant` dicono a chi è
 * intestato il contratto e li compila l'admin di piattaforma: servono come
 * punto di partenza, non come intestazione dei documenti.
 */
export interface DocumentIssuer {
  readonly legalName: string;
  readonly vatNumber: string | null;
  readonly fiscalCode: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly website: string | null;
  readonly pec: string | null;
  readonly iban: string | null;
  readonly addressLine1: string | null;
  readonly addressLine2: string | null;
  readonly city: string | null;
  readonly province: string | null;
  readonly postalCode: string | null;
  readonly countryCode: string | null;
  /** Regime fiscale FatturaPA; null = RF01 (vedi `tax-regime.constants`). */
  readonly taxRegime: string | null;
  readonly reaOffice: string | null;
  readonly reaNumber: string | null;
  readonly shareCapitalMinor: number | null;
  readonly soleShareholder: boolean | null;
  readonly inLiquidation: boolean;
  /**
   * Da dove arriva. `activation` significa che il titolare non ha ancora
   * compilato la sua anagrafica: vedi `resolveDocumentIssuer`.
   */
  readonly source: 'profile' | 'activation';
}

/** Le colonne da leggere sul tenant, con il profilo azienda agganciato. */
export const ISSUER_TENANT_SELECT = {
  name: true,
  legalName: true,
  vatNumber: true,
  fiscalCode: true,
  phone: true,
  pec: true,
  iban: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  province: true,
  postalCode: true,
  countryCode: true,
  companyProfile: {
    select: {
      legalName: true,
      vatNumber: true,
      fiscalCode: true,
      phone: true,
      email: true,
      website: true,
      pec: true,
      iban: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      province: true,
      postalCode: true,
      countryCode: true,
      taxRegime: true,
      reaOffice: true,
      reaNumber: true,
      shareCapitalMinor: true,
      soleShareholder: true,
      inLiquidation: true,
    },
  },
} satisfies Prisma.TenantSelect;

export type IssuerTenantRow = Prisma.TenantGetPayload<{ select: typeof ISSUER_TENANT_SELECT }>;

/**
 * **O l'una o l'altra, mai un misto.** Se il titolare ha salvato la sua
 * anagrafica, i documenti portano quella e basta — anche i campi che ha
 * lasciato vuoti restano vuoti. Se non l'ha mai salvata, si usano i dati di
 * attivazione: è quello che i documenti fanno da sempre, e toglierlo di colpo
 * lascerebbe senza intestazione ogni negozio che non è ancora passato dalla
 * maschera nuova.
 *
 * Il misto campo per campo sarebbe la cosa peggiore delle due: un indirizzo
 * dell'una accanto alla partita IVA dell'altra, senza che nessuno se ne
 * accorga.
 */
export function resolveDocumentIssuer(tenant: IssuerTenantRow): DocumentIssuer {
  const profile = tenant.companyProfile;
  if (profile) {
    return {
      legalName: profile.legalName?.trim() || tenant.name,
      vatNumber: profile.vatNumber,
      fiscalCode: profile.fiscalCode,
      phone: profile.phone,
      email: profile.email,
      website: profile.website,
      pec: profile.pec,
      iban: profile.iban,
      addressLine1: profile.addressLine1,
      addressLine2: profile.addressLine2,
      city: profile.city,
      province: profile.province,
      postalCode: profile.postalCode,
      countryCode: profile.countryCode,
      taxRegime: profile.taxRegime,
      reaOffice: profile.reaOffice,
      reaNumber: profile.reaNumber,
      shareCapitalMinor: profile.shareCapitalMinor,
      soleShareholder: profile.soleShareholder,
      inLiquidation: profile.inLiquidation,
      source: 'profile',
    };
  }

  return {
    legalName: tenant.legalName?.trim() || tenant.name,
    vatNumber: tenant.vatNumber,
    fiscalCode: tenant.fiscalCode,
    phone: tenant.phone,
    // Regime fiscale, REA e capitale sociale esistono solo sull'azienda
    // gestita: i dati di attivazione non li hanno mai avuti.
    email: null,
    website: null,
    pec: tenant.pec,
    iban: tenant.iban,
    addressLine1: tenant.addressLine1,
    addressLine2: tenant.addressLine2,
    city: tenant.city,
    province: tenant.province,
    postalCode: tenant.postalCode,
    countryCode: tenant.countryCode,
    taxRegime: null,
    reaOffice: null,
    reaNumber: null,
    shareCapitalMinor: null,
    soleShareholder: null,
    inLiquidation: false,
    source: 'activation',
  };
}

/**
 * Lo snapshot dell'intestazione salvato sul documento all'emissione.
 *
 * Un documento emesso non cambia più: se il titolare trasloca, la fattura di
 * marzo si ristampa con l'indirizzo di marzo. Senza snapshot l'intestazione
 * verrebbe riletta viva a ogni stampa, e basterebbe una correzione in
 * anagrafica per riscrivere il passato.
 *
 * Torna `null` per i documenti anteriori allo snapshot: quelli continuano a
 * leggere l'anagrafica corrente, che è ciò che facevano comunque.
 */
export function readIssuerSnapshot(value: unknown): DocumentIssuer | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const legalName = typeof raw['legalName'] === 'string' ? raw['legalName'].trim() : '';
  if (!legalName) {
    return null;
  }

  const text = (key: string): string | null =>
    typeof raw[key] === 'string' && raw[key].trim().length > 0 ? (raw[key] as string) : null;
  const flag = (key: string): boolean | null =>
    typeof raw[key] === 'boolean' ? (raw[key] as boolean) : null;

  return {
    legalName,
    vatNumber: text('vatNumber'),
    fiscalCode: text('fiscalCode'),
    phone: text('phone'),
    email: text('email'),
    website: text('website'),
    pec: text('pec'),
    iban: text('iban'),
    addressLine1: text('addressLine1'),
    addressLine2: text('addressLine2'),
    city: text('city'),
    province: text('province'),
    postalCode: text('postalCode'),
    countryCode: text('countryCode'),
    taxRegime: text('taxRegime'),
    reaOffice: text('reaOffice'),
    reaNumber: text('reaNumber'),
    shareCapitalMinor:
      typeof raw['shareCapitalMinor'] === 'number' ? raw['shareCapitalMinor'] : null,
    soleShareholder: flag('soleShareholder'),
    inLiquidation: raw['inLiquidation'] === true,
    source: raw['source'] === 'activation' ? 'activation' : 'profile',
  };
}

/** Indirizzo su una riga: «Via Roma 1, 80100 Napoli NA». */
export function issuerAddressLine(issuer: DocumentIssuer): string | null {
  const parts = [
    issuer.addressLine1,
    issuer.addressLine2,
    [issuer.postalCode, issuer.city, issuer.province].filter(Boolean).join(' '),
  ].filter((part) => part && part.trim().length > 0);

  return parts.length > 0 ? parts.join(', ') : null;
}
