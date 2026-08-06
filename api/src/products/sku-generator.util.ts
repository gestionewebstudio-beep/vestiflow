// Generazione SKU prevedibile (specifica cliente SKU): il pulsante "Genera
// SKU" applica sempre la STESSA logica deterministica -- categoria/tipologia +
// nome abbreviato (o codice modello, se disponibile) + attributi variante
// realmente presenti (colore/taglia o altro, MAI assunti a priori) + un
// progressivo che garantisce l'unicita'. Mai una stringa casuale.
//
// Puro e framework-agnostico: nessuna dipendenza da Prisma/Nest, cosi' resta
// facilmente testabile. La risoluzione dell'unicita' (query DB, incremento
// del progressivo finche' non si trova un codice libero) vive in
// `sku-generator.service.ts`.

/** Segmento categoria: iniziali brevi (es. "Maglie" -> "MAG", "Calzature" -> "CAL"). */
const CATEGORY_SEGMENT_MAX_LENGTH = 3;
/** Segmento nome/modello: piu' margine per restare leggibile (es. "BASIC"). */
const NAME_SEGMENT_MAX_LENGTH = 6;
/** Segmento attributo variante (colore, materiale, ecc.) se non numerico. */
const ATTRIBUTE_SEGMENT_MAX_LENGTH = 3;
/** Cifre del progressivo quando il prodotto non ha attributi variante distintivi. */
export const SKU_BASE_PROGRESSIVE_PAD = 5;
/** Cifre del progressivo di collisione quando il codice ha gia' attributi variante. */
export const SKU_ATTRIBUTE_PROGRESSIVE_PAD = 2;

/** Prefisso di fallback quando non c'e' materiale sufficiente (nome/categoria vuoti). */
const FALLBACK_SEGMENT = 'ART';

/** Range Unicode dei segni diacritici combinanti (per lo strip accenti dopo NFKD). */
const DIACRITICS_PATTERN = /[̀-ͯ]/g;

export interface SkuOptionValueInput {
  readonly name: string;
  readonly value: string;
}

export interface SkuGenerationInput {
  readonly productName: string;
  readonly category?: string | null;
  /**
   * Codice modello esplicito, se in futuro il modello dati lo prevede.
   * Oggi Product non ha un campo dedicato: quando assente si deriva dal nome.
   */
  readonly modelCode?: string | null;
  /** Attributi REALMENTE presenti sulla variante (colore, taglia, o altro). */
  readonly optionValues?: readonly SkuOptionValueInput[];
}

export interface SkuBase {
  /** Codice base (senza progressivo/suffisso di unicita'). */
  readonly base: string;
  /** True se il codice include gia' almeno un attributo variante distintivo. */
  readonly hasAttributeSegments: boolean;
}

/** Rimuove accenti/diacritici (es. "e con accento" -> "e"). */
function stripDiacritics(value: string): string {
  return value.normalize('NFKD').replace(DIACRITICS_PATTERN, '');
}

/** Slug di un segmento: maiuscolo, senza accenti, solo [A-Z0-9], troncato. */
export function slugifySkuSegment(value: string, maxLength?: number): string {
  const slug = stripDiacritics(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
  return maxLength ? slug.slice(0, maxLength) : slug;
}

function isNumericValue(value: string): boolean {
  return /^[0-9]+([.,][0-9]+)?$/.test(value.trim());
}

/**
 * Segmento di un singolo attributo variante (colore, taglia, materiale...).
 * I valori puramente numerici (taglie tipo "42") non vengono troncati: sono
 * gia' brevi e troncarli li renderebbe ambigui o errati.
 */
function attributeSegment(value: string): string {
  if (isNumericValue(value)) {
    return slugifySkuSegment(value);
  }
  return slugifySkuSegment(value, ATTRIBUTE_SEGMENT_MAX_LENGTH);
}

function firstWord(value: string): string {
  return value.trim().split(/\s+/, 1)[0] ?? '';
}

/** Segmento categoria: iniziali brevi della prima parola della categoria. */
function categorySegment(category: string | null | undefined): string {
  const trimmed = category?.trim();
  if (!trimmed) {
    return '';
  }
  return slugifySkuSegment(firstWord(trimmed), CATEGORY_SEGMENT_MAX_LENGTH);
}

/**
 * Segmento nome prodotto: sceglie la parola piu' distintiva del nome,
 * scartando quelle che duplicano semanticamente la categoria (stesso
 * prefisso di 3 lettere, es. "Maglia" quando la categoria e "Maglie" ->
 * entrambe iniziano con "MAG"). Tra le parole rimanenti, viene scelta
 * l'ULTIMA: nei nomi prodotto italiani tipici del retail ("Maglia girocollo
 * Basic") il segmento davvero distintivo (nome/stile del modello) tende a
 * comparire in coda al nome generico. Se non resta nessuna parola dopo il
 * filtro, si ricade sull'intero nome (comportamento prevedibile anche per
 * nomi cortissimi o monoparola).
 */
function nameSegment(productName: string, catSegment: string): string {
  const words = productName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return '';
  }
  const meaningful = catSegment
    ? words.filter((word) => slugifySkuSegment(word, CATEGORY_SEGMENT_MAX_LENGTH) !== catSegment)
    : words;
  const source = meaningful.length > 0 ? meaningful : words;
  const chosen = source[source.length - 1] ?? '';
  return slugifySkuSegment(chosen, NAME_SEGMENT_MAX_LENGTH);
}

/**
 * Costruisce il codice SKU base (senza progressivo) da categoria, nome
 * prodotto (o codice modello, se fornito) e attributi variante realmente
 * presenti. Non tocca il database: la risoluzione dell'unicita' e' a carico
 * del chiamante (vedi `SkuGeneratorService.previewSku`).
 */
export function buildSkuBase(input: SkuGenerationInput): SkuBase {
  const catSegment = categorySegment(input.category);
  const coreSegment = input.modelCode?.trim()
    ? slugifySkuSegment(input.modelCode, NAME_SEGMENT_MAX_LENGTH)
    : nameSegment(input.productName, catSegment);

  const attributeSegments = (input.optionValues ?? [])
    .map((option) => attributeSegment(option.value))
    .filter((segment) => segment.length > 0);

  const segments = [catSegment, coreSegment, ...attributeSegments].filter(
    (segment) => segment.length > 0,
  );

  return {
    base: segments.length > 0 ? segments.join('-') : FALLBACK_SEGMENT,
    hasAttributeSegments: attributeSegments.length > 0,
  };
}

/** Progressivo zero-padded per il codice base (es. "MAG-BASIC" + 125 -> "MAG-BASIC-00125"). */
export function withProgressive(base: string, seq: number): string {
  return `${base}-${String(seq).padStart(SKU_BASE_PROGRESSIVE_PAD, '0')}`;
}

/** Suffisso di collisione breve per codici gia' qualificati da attributi variante. */
export function withCollisionSuffix(base: string, seq: number): string {
  return `${base}-${String(seq).padStart(SKU_ATTRIBUTE_PROGRESSIVE_PAD, '0')}`;
}
