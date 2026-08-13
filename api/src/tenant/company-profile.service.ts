import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import type {
  CompanyProfileDto,
  CompanyProfileFieldsDto,
  UpdateCompanyProfileDto,
} from './dto/company-profile.dto';

/** Le colonne comuni alle due anagrafiche (azienda gestita e attivazione). */
const SHARED_SELECT = {
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
} as const;

/** Solo l'azienda gestita porta ciò che serve a intestare un documento fiscale. */
const PROFILE_SELECT = {
  ...SHARED_SELECT,
  email: true,
  website: true,
  taxRegime: true,
  reaOffice: true,
  reaNumber: true,
  shareCapitalMinor: true,
  soleShareholder: true,
  inLiquidation: true,
} as const;

type SharedRow = { readonly [K in keyof typeof SHARED_SELECT]: string | null };

type ProfileRow = SharedRow & {
  readonly email: string | null;
  readonly website: string | null;
  readonly taxRegime: string | null;
  readonly reaOffice: string | null;
  readonly reaNumber: string | null;
  readonly shareCapitalMinor: number | null;
  readonly soleShareholder: boolean | null;
  readonly inLiquidation: boolean;
};

function sharedFields(
  row: SharedRow,
): Omit<
  CompanyProfileFieldsDto,
  | 'email'
  | 'website'
  | 'taxRegime'
  | 'reaOffice'
  | 'reaNumber'
  | 'shareCapitalMinor'
  | 'soleShareholder'
  | 'inLiquidation'
> & { readonly sdiCode: string | null } {
  return {
    legalName: row.legalName,
    vatNumber: row.vatNumber,
    fiscalCode: row.fiscalCode,
    phone: row.phone,
    pec: row.pec,
    sdiCode: null,
    iban: row.iban,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    province: row.province,
    postalCode: row.postalCode,
    countryCode: row.countryCode,
  };
}

/**
 * Anagrafica dell'azienda gestita nel gestionale: quella che intesta documenti
 * e stampe. La compila il titolare, ed è distinta dai dati di attivazione del
 * cliente che stanno sul `Tenant` (vedi il commento sul model `CompanyProfile`).
 */
@Injectable()
export class CompanyProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async get(tenantId: string): Promise<CompanyProfileDto> {
    const [profile, tenant] = await Promise.all([
      this.prisma.companyProfile.findUnique({
        where: { tenantId },
        select: { ...PROFILE_SELECT, sdiCode: true },
      }),
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { ...SHARED_SELECT, sdiCode: true, name: true },
      }),
    ]);

    if (!tenant) {
      throw new NotFoundException('Azienda non trovata');
    }

    return {
      profile: profile ? this.toProfileDto(profile) : null,
      activationDefaults: {
        ...sharedFields(tenant),
        sdiCode: tenant.sdiCode,
        // Regime fiscale, REA e capitale sociale non esistono nei dati di
        // attivazione: l'admin di piattaforma non li chiede, e non c'è niente
        // da precompilare.
        email: null,
        website: null,
        taxRegime: null,
        reaOffice: null,
        reaNumber: null,
        shareCapitalMinor: null,
        soleShareholder: null,
        inLiquidation: false,
        // Senza ragione sociale nei dati di attivazione resta il nome del
        // cliente: è comunque il punto di partenza più utile da rileggere.
        legalName: tenant.legalName ?? tenant.name,
      },
    };
  }

  async update(tenantId: string, dto: UpdateCompanyProfileDto): Promise<CompanyProfileDto> {
    const data = {
      legalName: dto.legalName ?? null,
      vatNumber: dto.vatNumber ?? null,
      fiscalCode: dto.fiscalCode ?? null,
      phone: dto.phone ?? null,
      email: dto.email ?? null,
      website: dto.website ?? null,
      pec: dto.pec ?? null,
      sdiCode: dto.sdiCode ?? null,
      iban: dto.iban ?? null,
      addressLine1: dto.addressLine1 ?? null,
      addressLine2: dto.addressLine2 ?? null,
      city: dto.city ?? null,
      province: dto.province ?? null,
      postalCode: dto.postalCode ?? null,
      // Un indirizzo senza nazione non serve a nessuno, e in una fattura
      // elettronica il campo Nazione è obbligatorio: se c'è la via e manca la
      // nazione, è Italia.
      countryCode: dto.countryCode ?? (dto.addressLine1 ? 'IT' : null),
      taxRegime: dto.taxRegime ?? null,
      reaOffice: dto.reaOffice ?? null,
      reaNumber: dto.reaNumber ?? null,
      shareCapitalMinor: dto.shareCapitalMinor ?? null,
      soleShareholder: dto.soleShareholder ?? null,
      inLiquidation: dto.inLiquidation ?? false,
    };

    await this.prisma.companyProfile.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
    });

    return this.get(tenantId);
  }

  private toProfileDto(
    row: ProfileRow & { readonly sdiCode: string | null },
  ): CompanyProfileFieldsDto {
    return {
      ...sharedFields(row),
      sdiCode: row.sdiCode,
      email: row.email,
      website: row.website,
      taxRegime: row.taxRegime,
      reaOffice: row.reaOffice,
      reaNumber: row.reaNumber,
      shareCapitalMinor: row.shareCapitalMinor,
      soleShareholder: row.soleShareholder,
      inLiquidation: row.inLiquidation,
    };
  }
}
