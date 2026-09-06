import {
  Validators,
  type AbstractControl,
  type NonNullableFormBuilder,
  type ValidationErrors,
  type ValidatorFn,
} from '@angular/forms';

import { parseMoneyInput } from '@core/utils/money.util';

import { italianVatValidator, optionalEmailValidator } from './company-fields.validators';

/**
 * Anagrafica dell'azienda gestita nel gestionale: è quella che intesta
 * documenti, stampe e XML, e la compila il titolare.
 *
 * Distinta dai dati di attivazione del cliente (`TenantCompany`), che compila
 * l'admin di piattaforma: stessa forma, dato diverso. Vedi il commento sul
 * model Prisma `CompanyProfile`.
 */
export interface CompanyFields {
  readonly legalName: string | null;
  readonly vatNumber: string | null;
  readonly fiscalCode: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly website: string | null;
  readonly pec: string | null;
  readonly sdiCode: string | null;
  /** IBAN di incasso: precompila i dati pagamento in fattura. */
  readonly iban: string | null;
  readonly addressLine1: string | null;
  readonly addressLine2: string | null;
  readonly city: string | null;
  readonly province: string | null;
  readonly postalCode: string | null;
  readonly countryCode: string | null;
  /** Regime fiscale FatturaPA; null = RF01 (ordinario). */
  readonly taxRegime: string | null;
  readonly reaOffice: string | null;
  readonly reaNumber: string | null;
  /** Capitale sociale in centesimi. */
  readonly shareCapitalMinor: number | null;
  /** null = non dichiarato, true = socio unico, false = più soci. */
  readonly soleShareholder: boolean | null;
  readonly inLiquidation: boolean;
}

export interface CompanyProfile {
  /** `null` finché il titolare non ha mai salvato. */
  readonly profile: CompanyFields | null;
  /** Dati di attivazione del cliente, offerti come precompilazione. */
  readonly activationDefaults: CompanyFields;
}

export interface CompanyFieldsDto {
  readonly legalName: string | null;
  readonly vatNumber: string | null;
  readonly fiscalCode: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly website: string | null;
  readonly pec: string | null;
  readonly sdiCode: string | null;
  readonly iban: string | null;
  readonly addressLine1: string | null;
  readonly addressLine2: string | null;
  readonly city: string | null;
  readonly province: string | null;
  readonly postalCode: string | null;
  readonly countryCode: string | null;
  readonly taxRegime: string | null;
  readonly reaOffice: string | null;
  readonly reaNumber: string | null;
  readonly shareCapitalMinor: number | null;
  readonly soleShareholder: boolean | null;
  readonly inLiquidation: boolean;
}

export interface CompanyProfileDto {
  readonly profile: CompanyFieldsDto | null;
  readonly activationDefaults: CompanyFieldsDto;
}

/** L'ordine è quello della maschera: serve anche a costruire il form. */
export const COMPANY_FIELD_NAMES = [
  'legalName',
  'vatNumber',
  'fiscalCode',
  'addressLine1',
  'addressLine2',
  'postalCode',
  'city',
  'province',
  'countryCode',
  'phone',
  'pec',
  'sdiCode',
  'iban',
] as const;

export type CompanyFieldName = (typeof COMPANY_FIELD_NAMES)[number];

export const EMPTY_COMPANY_FIELDS: CompanyFields = {
  legalName: null,
  vatNumber: null,
  fiscalCode: null,
  phone: null,
  email: null,
  website: null,
  pec: null,
  sdiCode: null,
  iban: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  province: null,
  postalCode: null,
  countryCode: null,
  taxRegime: null,
  reaOffice: null,
  reaNumber: null,
  shareCapitalMinor: null,
  soleShareholder: null,
  inLiquidation: false,
};

function trimToNull(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

function companyFieldsFromDto(dto: CompanyFieldsDto): CompanyFields {
  return {
    legalName: trimToNull(dto.legalName),
    vatNumber: trimToNull(dto.vatNumber),
    fiscalCode: trimToNull(dto.fiscalCode),
    phone: trimToNull(dto.phone),
    email: trimToNull(dto.email),
    website: trimToNull(dto.website),
    pec: trimToNull(dto.pec),
    sdiCode: trimToNull(dto.sdiCode),
    iban: trimToNull(dto.iban),
    addressLine1: trimToNull(dto.addressLine1),
    addressLine2: trimToNull(dto.addressLine2),
    city: trimToNull(dto.city),
    province: trimToNull(dto.province),
    postalCode: trimToNull(dto.postalCode),
    countryCode: trimToNull(dto.countryCode),
    taxRegime: trimToNull(dto.taxRegime),
    reaOffice: trimToNull(dto.reaOffice),
    reaNumber: trimToNull(dto.reaNumber),
    shareCapitalMinor: dto.shareCapitalMinor ?? null,
    soleShareholder: dto.soleShareholder ?? null,
    inLiquidation: dto.inLiquidation === true,
  };
}

export function companyProfileFromDto(dto: CompanyProfileDto): CompanyProfile {
  return {
    profile: dto.profile ? companyFieldsFromDto(dto.profile) : null,
    activationDefaults: companyFieldsFromDto(dto.activationDefaults),
  };
}

/**
 * I controlli dei campi anagrafici, con le stesse regole in entrambe le
 * maschere che li usano — quella del titolare e quella dell'admin. Una partita
 * IVA ha undici cifre di qua e di là: due copie divergerebbero e basta.
 */
export function createCompanyFieldsControls(fb: NonNullableFormBuilder) {
  return {
    legalName: fb.control('', { validators: [Validators.maxLength(160)] }),
    vatNumber: fb.control('', { validators: [Validators.maxLength(16), italianVatValidator()] }),
    fiscalCode: fb.control('', { validators: [Validators.maxLength(16)] }),
    phone: fb.control('', { validators: [Validators.maxLength(30)] }),
    pec: fb.control('', { validators: [Validators.maxLength(255), optionalEmailValidator()] }),
    sdiCode: fb.control('', { validators: [Validators.maxLength(7)] }),
    iban: fb.control('', { validators: [Validators.maxLength(34)] }),
    addressLine1: fb.control('', { validators: [Validators.maxLength(200)] }),
    addressLine2: fb.control('', { validators: [Validators.maxLength(200)] }),
    city: fb.control('', { validators: [Validators.maxLength(100)] }),
    province: fb.control('', { validators: [Validators.maxLength(100)] }),
    postalCode: fb.control('', { validators: [Validators.maxLength(20)] }),
    countryCode: fb.control('IT', { validators: [Validators.maxLength(2)] }),
  };
}

/** Valori pronti da dare a `patchValue`: `null` diventa stringa vuota. */
export function companyFieldsFormValue(fields: CompanyFields): Record<CompanyFieldName, string> {
  return {
    legalName: fields.legalName ?? '',
    vatNumber: fields.vatNumber ?? '',
    fiscalCode: fields.fiscalCode ?? '',
    addressLine1: fields.addressLine1 ?? '',
    addressLine2: fields.addressLine2 ?? '',
    postalCode: fields.postalCode ?? '',
    city: fields.city ?? '',
    province: fields.province ?? '',
    countryCode: fields.countryCode ?? '',
    phone: fields.phone ?? '',
    pec: fields.pec ?? '',
    sdiCode: fields.sdiCode ?? '',
    iban: fields.iban ?? '',
  };
}

/**
 * Payload per l'API: il campo vuoto **non viene inviato**, e l'API lo azzera.
 * È la stessa semantica di sostituzione in entrambe le maschere.
 */
function optionalText(value: string | number | boolean | null | undefined): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return undefined;
  }
  const trimmed = (typeof value === 'string' ? value : String(value)).trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function companyFieldsPayload(
  raw: Record<string, string | number | boolean | null | undefined>,
): Record<string, string | undefined> {
  return {
    legalName: optionalText(raw['legalName']),
    vatNumber: optionalText(raw['vatNumber']),
    fiscalCode: optionalText(raw['fiscalCode']),
    phone: optionalText(raw['phone']),
    pec: optionalText(raw['pec']),
    sdiCode: optionalText(raw['sdiCode']),
    iban: optionalText(raw['iban']),
    addressLine1: optionalText(raw['addressLine1']),
    addressLine2: optionalText(raw['addressLine2']),
    city: optionalText(raw['city']),
    province: optionalText(raw['province']),
    postalCode: optionalText(raw['postalCode']),
    countryCode: optionalText(raw['countryCode']),
  };
}

/**
 * I controlli della maschera del titolare: i campi comuni più quelli che
 * esistono solo sull'azienda gestita. La maschera admin usa i soli comuni —
 * regime fiscale e Registro Imprese non li dichiara chi attiva l'account.
 */
export function createCompanyProfileControls(fb: NonNullableFormBuilder) {
  return {
    ...createCompanyFieldsControls(fb),
    email: fb.control('', { validators: [Validators.maxLength(255), optionalEmailValidator()] }),
    website: fb.control('', { validators: [Validators.maxLength(255)] }),
    taxRegime: fb.control(''),
    reaOffice: fb.control('', { validators: [Validators.maxLength(2)] }),
    reaNumber: fb.control('', { validators: [Validators.maxLength(20)] }),
    /** In euro, come lo scrive l'operatore: la conversione in centesimi è nel payload. */
    shareCapital: fb.control('', { validators: [shareCapitalValidator()] }),
    /** '' = non dichiarato, 'SU' = socio unico, 'SM' = più soci. */
    soleShareholder: fb.control(''),
    inLiquidation: fb.control(false),
  };
}

export function companyProfileFormValue(fields: CompanyFields): Record<string, string | boolean> {
  return {
    ...companyFieldsFormValue(fields),
    email: fields.email ?? '',
    website: fields.website ?? '',
    taxRegime: fields.taxRegime ?? '',
    reaOffice: fields.reaOffice ?? '',
    reaNumber: fields.reaNumber ?? '',
    shareCapital: shareCapitalToInput(fields.shareCapitalMinor),
    soleShareholder: fields.soleShareholder === null ? '' : fields.soleShareholder ? 'SU' : 'SM',
    inLiquidation: fields.inLiquidation,
  };
}

/** Centesimi → «10000,00» per il campo; vuoto se non dichiarato. */
export function shareCapitalToInput(amountMinor: number | null): string {
  if (amountMinor === null) {
    return '';
  }
  return (amountMinor / 100).toFixed(2).replace('.', ',');
}

export function companyProfilePayload(
  raw: Record<string, string | number | boolean | null | undefined>,
): Record<string, string | number | boolean | undefined> {
  const shareCapital = parseMoneyInput(String(raw['shareCapital'] ?? ''));
  const soleShareholder = String(raw['soleShareholder'] ?? '');

  return {
    ...companyFieldsPayload(raw),
    email: optionalText(raw['email']),
    website: optionalText(raw['website']),
    taxRegime: optionalText(raw['taxRegime']),
    reaOffice: optionalText(raw['reaOffice'])?.toUpperCase(),
    reaNumber: optionalText(raw['reaNumber']),
    shareCapitalMinor: shareCapital ? shareCapital.amountMinor : undefined,
    // Campo vuoto = non dichiarato: il payload non lo porta, e l'API lo azzera.
    soleShareholder: soleShareholder === '' ? undefined : soleShareholder === 'SU',
    inLiquidation: raw['inLiquidation'] === true,
  };
}

/**
 * Un capitale sociale scritto male non si salva a metà: o è un importo o il
 * campo è vuoto. È l'unico campo numerico della maschera.
 */
function shareCapitalValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = String(control.value ?? '').trim();
    if (!value) {
      return null;
    }
    const parsed = parseMoneyInput(value);
    return parsed && parsed.amountMinor >= 0 ? null : { shareCapital: true };
  };
}

/** C'è qualcosa da precompilare? Un pulsante che non riempie nulla non si mostra. */
export function hasAnyCompanyField(fields: CompanyFields): boolean {
  return Object.values(fields).some((value) => Boolean(value));
}

/**
 * I campi senza i quali una stampa o una fattura elettronica escono monche.
 * È un avviso, non un blocco: l'anagrafica si compila quando si può, e nel
 * frattempo il gestionale funziona (regole-gestionale, «controlli come warning»).
 */
export function missingEssentialCompanyFields(fields: CompanyFields | null): readonly string[] {
  if (!fields) {
    return ['Ragione sociale', 'Partita IVA', 'Indirizzo'];
  }
  const missing: string[] = [];
  if (!fields.legalName) {
    missing.push('Ragione sociale');
  }
  if (!fields.vatNumber) {
    missing.push('Partita IVA');
  }
  if (!fields.addressLine1 || !fields.city) {
    missing.push('Indirizzo');
  }
  return missing;
}
