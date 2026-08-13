import { CompanyFieldsDto } from '../../common/dto/company-fields.dto';

/**
 * Campi anagrafici opzionali del tenant: identificano il **cliente VestiFlow**,
 * quello a cui è intestato il contratto, e li compila l'admin di piattaforma.
 *
 * Non intestano i documenti: quella è l'anagrafica dell'azienda gestita
 * (`CompanyProfile`), che compila il titolare. Stessa forma, dato diverso.
 */
export class TenantProfileFieldsDto extends CompanyFieldsDto {}
