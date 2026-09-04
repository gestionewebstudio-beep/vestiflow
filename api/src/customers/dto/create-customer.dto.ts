import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Payload cliente: i dati anagrafici/fiscali/di contatto finiscono sul
 * soggetto canonico (Party), i dati commerciali sul ruolo cliente.
 * Denominazione: serve la ragione sociale OPPURE nome e cognome
 * (validazione nel service, non qui).
 */
export class CreateCustomerDto {
  // ── Soggetto (Party) ───────────────────────────────────────────────
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  vatNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  taxCode?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEmail()
  pec?: string;

  /** Codice destinatario SDI: 7 caratteri (6 per la PA). */
  @IsOptional()
  @IsString()
  @MaxLength(7)
  sdiCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  /** Cellulare: secondo recapito del soggetto (Danea: «Cell.»). */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  mobilePhone?: string;

  /**
   * IBAN del soggetto — il conto su cui SI PAGA lui.
   *
   * ⚠️ **Sta sul soggetto, quindi è lo STESSO del ruolo fornitore**: se questo
   * cliente è anche fornitore, l'IBAN è uno solo e si aggiorna da entrambe le
   * schede. È il conto della persona giuridica, non un patto commerciale.
   *
   * 34 caratteri è il massimo dello standard, ed è l'unico controllo qui: la
   * cifra di verifica è un avviso lato maschera, non un blocco.
   */
  @IsOptional()
  @IsString()
  @MaxLength(34)
  iban?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  province?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  countryCode?: string;

  // ── Ruolo cliente (dati commerciali) ───────────────────────────────
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  code?: string;

  /**
   * Stato del RUOLO cliente. Spento, il cliente esce dalle tendine dei
   * documenti nuovi (`listAll` filtra `isActive: true`) e non si perde niente:
   * ordini, documenti e collegamenti restano — `ANAGRAFICA-CANONICA-SPEC`.
   */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  customerDiscount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  paymentTerms?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  transportResponsible?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  documentCreationAlert?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  documentCreationNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  commercialNotes?: string;

  /** Aggiunge/riattiva il ruolo fornitore sullo stesso soggetto (nessuna copia). */
  @IsOptional()
  @IsBoolean()
  alsoSupplier?: boolean;
}
