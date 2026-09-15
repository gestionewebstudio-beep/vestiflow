import { ORDINE_SENZA_SEDE_MARCATORE } from './shopify-order-location.util';
import type {
  ShopifySetupEsclusoDto,
  ShopifySetupProblemaAzione,
  ShopifySetupProblemaCausa,
  ShopifySetupProblemaDto,
} from './shopify-setup.model';

/**
 * La SITUAZIONE ATTUALE della sincronizzazione — i problemi ancora aperti,
 * letti ADESSO, ognuno con la causa, la conseguenza e l'azione possibile.
 *
 * ⛔ **Non è l'esito dell'ultimo tentativo.** Misurato sul collaudo il 13/09/2026:
 *    la pagina diceva «84 casi da risolvere a mano» — 82 esclusi PERSISTITI
 *    nell'esito (75 volte lo stesso guasto tecnico, già corretto) più 2 ordini
 *    dall'anteprima — e per i due ordini ripeteva «collega la location» quando
 *    la causa era un permesso mancante. Fotografie, mai rivalutate. Qui ogni
 *    riga viene da un dato letto ora; dell'ultimo tentativo si usa solo la
 *    CAUSA di una coppia che risulta ancora senza base, e la si dichiara tale.
 *
 * ⭐ Funzione pura: chi la chiama legge; qui si decide. Nessuna correzione dei
 *    dati (mandato del proprietario): si nomina e si indica dove andare.
 */

/** Un ordine di canale aperto senza sede, com'è oggi. */
export interface OrdineSenzaSedeAttuale {
  readonly id: string;
  readonly orderNumber: string;
  readonly reviewReason: string | null;
  /** L'ultima valutazione dell'ordine: il motivo è di quel momento. */
  readonly rilevatoAt: Date;
}

/** Una coppia articolo × sede collegata che NON ha una base confermata. */
export interface CoppiaSenzaBaseAttuale {
  readonly variantId: string;
  readonly productId: string;
  readonly locationId: string;
  readonly articolo: string;
  readonly sku: string | null;
  readonly variante: string | null;
  readonly sede: string;
}

/** Un articolo escluso dal trasferimento che oggi risulta ANCORA scollegato. */
export interface ArticoloEsclusoAttuale {
  readonly productId: string;
  readonly nome: string;
  readonly motivo: string;
  readonly dettaglio: string | null;
}

/** Una ricevuta webhook accolta e NON applicata, come la legge l'operatore. */
export interface EventoNonApplicatoAttuale {
  readonly ricevutaId: string;
  readonly topic: string;
  readonly risorsa: string | null;
  readonly esito:
    | 'fallita'
    | 'sospesa_dopo_ripristino'
    | 'scartata_sync_spenta'
    | 'scartata_associazione_cambiata';
  readonly tentativi: number;
  readonly motivo: string | null;
  readonly receivedAt: Date;
}

export interface SituazioneInput {
  /** Gli eventi webhook accolti e non applicati (docs/30 §7.1.2), dal più recente. */
  readonly eventiNonApplicati?: readonly EventoNonApplicatoAttuale[];
  readonly ordiniSenzaSede: readonly OrdineSenzaSedeAttuale[];
  readonly coppieSenzaBase: readonly CoppiaSenzaBaseAttuale[];
  readonly articoliEsclusi: readonly ArticoloEsclusoAttuale[];
  /** Gli esclusi dell'ultimo tentativo: la CAUSA nota di una coppia senza base. */
  readonly esclusiUltimoTentativo: readonly ShopifySetupEsclusoDto[];
  readonly ultimoTentativoAt: string | null;
  /** Ambiti chiesti e non concessi dal token. */
  readonly ambitiMancanti: readonly string[];
  /** Notifiche attese e non registrate sul negozio; `null` = mai verificato. */
  readonly topicMancanti: readonly string[] | null;
  readonly ordiniFallitiAttivazione: number;
}

const AMBITO_FULFILLMENT_ORDERS = 'read_merchant_managed_fulfillment_orders';

/** Il segmento del «Da verificare» che porta il marcatore, senza il marcatore. */
function segmentoSede(reviewReason: string | null): string | null {
  const segmento = (reviewReason ?? '')
    .split(' · ')
    .find((parte) => parte.includes(ORDINE_SENZA_SEDE_MARCATORE));
  if (!segmento) {
    return null;
  }
  return segmento
    .slice(segmento.indexOf(ORDINE_SENZA_SEDE_MARCATORE) + ORDINE_SENZA_SEDE_MARCATORE.length)
    .replace(/^\s*:\s*/, '')
    .trim();
}

const LOCATION_GID = /gid:\/\/shopify\/Location\/\d+/;

/**
 * La causa di un ordine senza sede, letta dal motivo scritto sull'ordine
 * (`motivoSedeNonDeterminabile`). Un motivo scritto PRIMA del 13/09/2026 —
 * «il payload Shopify non porta una location…» — non dice la causa di oggi:
 * si dichiara «da rileggere», e l'azione è reimportare.
 */
export function causaOrdineSenzaSede(reviewReason: string | null): {
  readonly causa: ShopifySetupProblemaCausa;
  readonly locationGid: string | null;
} {
  const testo = segmentoSede(reviewReason) ?? '';
  if (testo.includes(AMBITO_FULFILLMENT_ORDERS)) {
    return { causa: 'ordine_permesso_fulfillment_orders', locationGid: null };
  }
  if (testo.includes('non ha ancora assegnato')) {
    return { causa: 'ordine_assegnazione_in_attesa', locationGid: null };
  }
  if (testo.includes('non è collegata a una sede VestiFlow')) {
    return {
      causa: 'ordine_location_non_collegata',
      locationGid: LOCATION_GID.exec(testo)?.[0] ?? null,
    };
  }
  if (testo.includes('suddivisa fra più sedi')) {
    return { causa: 'ordine_riga_divisa', locationGid: null };
  }
  if (testo.includes('lettura dei fulfillment order è fallita')) {
    return { causa: 'ordine_lettura_fallita', locationGid: null };
  }
  return { causa: 'ordine_sede_da_rileggere', locationGid: null };
}

const CONSEGUENZA_ORDINE =
  'Nessun impegno per le sue righe: la quantità delle varianti coinvolte resta ferma verso Shopify (nessuna pubblicazione, «Allinea» rifiuta).';

function azione(
  tipo: ShopifySetupProblemaAzione['tipo'],
  etichetta: string,
  riferimento?: string | null,
): ShopifySetupProblemaAzione {
  return { tipo, etichetta, riferimento: riferimento ?? null };
}

/**
 * ⭐ Un evento accolto e non applicato (docs/30 §7.1.2, decisioni D2–D4 del 15/09/2026):
 *    «Riprova» solo per le fallite e le sospese dopo un ripristino; le scartate per
 *    sincronizzazione spenta si riallineano con «Importa» (nessun «Riprendi sospesi»),
 *    quelle per associazione cambiata restano documentate e non si spostano.
 */
function problemaEvento(evento: EventoNonApplicatoAttuale): ShopifySetupProblemaDto {
  const nome = `${evento.topic}${evento.risorsa ? ` · ${evento.risorsa}` : ''}`;
  const base = {
    tipo: 'evento' as const,
    riferimento: evento.ricevutaId,
    nome,
    dettaglio: evento.motivo,
    sede: null,
    apri: null,
    rilevatoAt: evento.receivedAt.toISOString(),
  };
  switch (evento.esito) {
    case 'fallita':
      // ⭐ Il MOTIVO sta nell'effetto, non solo nel dettaglio: a schermo (15/09) il dettaglio
      //    finiva in una colonna stretta, troncata — e il motivo di un articolo `syncing` è
      //    ciò che dice all'operatore come sbloccare, e che cosa comporta.
      return {
        ...base,
        causa: 'evento_fallito',
        conseguenza:
          `Notifica di Shopify non applicata dopo ${evento.tentativi} tentativi: ciò che è cambiato là per questa risorsa non è arrivato, e gli eventi successivi della stessa risorsa aspettano.` +
          (evento.motivo ? ` ${evento.motivo}` : ''),
        azione: azione('riprova_evento', 'Rimetti in coda questa notifica, con le stesse protezioni', evento.ricevutaId),
      };
    case 'sospesa_dopo_ripristino':
      return {
        ...base,
        causa: 'evento_sospeso_dopo_ripristino',
        conseguenza:
          'Notifica ancora da applicare al momento del backup: dopo il ripristino non riparte da sola.',
        azione: azione(
          'riprova_evento',
          'Riprova, dopo aver verificato che il negozio collegato sia lo stesso',
          evento.ricevutaId,
        ),
      };
    case 'scartata_sync_spenta':
      return {
        ...base,
        causa: 'evento_scartato_sync_spenta',
        conseguenza:
          'Arrivata con gli aggiornamenti automatici disattivati: non applicata e non si riprova.',
        azione: azione('importa_ordini', 'Riallinea con «Importa ordini» / «Importa catalogo»'),
      };
    case 'scartata_associazione_cambiata':
      return {
        ...base,
        causa: 'evento_scartato_associazione_cambiata',
        conseguenza:
          'Il negozio non è più collegato a questa azienda come quando la notifica è arrivata: nessun effetto, per non applicare eventi vecchi a un altro collegamento.',
        azione: azione('nessuna', 'Nessuna: resta documentata'),
      };
  }
}

function problemaOrdine(ordine: OrdineSenzaSedeAttuale): ShopifySetupProblemaDto {
  const { causa, locationGid } = causaOrdineSenzaSede(ordine.reviewReason);
  const base = {
    tipo: 'ordine' as const,
    causa,
    riferimento: ordine.id,
    nome: ordine.orderNumber,
    dettaglio: null,
    sede: null,
    conseguenza: CONSEGUENZA_ORDINE,
    rilevatoAt: ordine.rilevatoAt.toISOString(),
  };
  switch (causa) {
    case 'ordine_permesso_fulfillment_orders':
      return {
        ...base,
        azione: azione(
          'permessi',
          'Disconnetti e Connetti Shopify: la nuova autorizzazione include il permesso di leggere la sede degli ordini',
        ),
        apri: azione('apri_ordine', 'Apri l’ordine', ordine.id),
      };
    case 'ordine_assegnazione_in_attesa':
      return {
        ...base,
        azione: azione(
          'nessuna',
          'Niente da fare: Shopify deve completare l’assegnazione della sede; all’arrivo l’impegno nasce da solo',
        ),
        apri: azione('apri_ordine', 'Apri l’ordine', ordine.id),
      };
    case 'ordine_location_non_collegata':
      return {
        ...base,
        dettaglio: locationGid,
        azione: azione(
          'sedi',
          'Collega la location Shopify assegnata a una sede VestiFlow, in Sedi; poi reimporta l’ordine',
          locationGid,
        ),
        apri: azione('apri_ordine', 'Apri l’ordine', ordine.id),
      };
    case 'ordine_riga_divisa':
      return {
        ...base,
        azione: azione(
          'nessuna',
          'Limite dichiarato: una riga suddivisa fra più sedi su Shopify si impegna in una sola sede; l’uscita si registra alla spedizione',
        ),
        apri: azione('apri_ordine', 'Apri l’ordine', ordine.id),
      };
    case 'ordine_lettura_fallita':
      return {
        ...base,
        azione: azione('importa_ordini', 'Reimporta gli ordini: la lettura della sede è fallita'),
        apri: azione('apri_ordine', 'Apri l’ordine', ordine.id),
      };
    default:
      return {
        ...base,
        azione: azione(
          'importa_ordini',
          'Reimporta gli ordini: il motivo registrato è precedente alla lettura della sede dai fulfillment order',
        ),
        apri: azione('apri_ordine', 'Apri l’ordine', ordine.id),
      };
  }
}

/** I motivi con cui l'ultimo tentativo ha lasciato una coppia senza base. */
function causaCoppia(motivo: string | undefined): ShopifySetupProblemaCausa {
  switch (motivo) {
    case 'sede_non_stoccata':
    case 'articolo_assente':
    case 'quantita_assente':
      return 'coppia_non_stoccata';
    case 'errore_di_lettura':
    case 'lettura_fallita':
    case 'scrittura_esito_incerto':
      return 'coppia_lettura_fallita';
    case 'ordine_senza_sede':
      return 'coppia_ferma_ordine_senza_sede';
    default:
      return 'coppia_senza_base';
  }
}

function problemaCoppia(
  coppia: CoppiaSenzaBaseAttuale,
  escluso: ShopifySetupEsclusoDto | undefined,
  ultimoTentativoAt: string | null,
  allineaDisponibile: boolean,
): ShopifySetupProblemaDto {
  const causa = causaCoppia(escluso?.motivo);
  const quando = ultimoTentativoAt
    ? ` (ultimo tentativo: ${ultimoTentativoAt.slice(0, 16).replace('T', ' ')})`
    : '';
  const nome = `${coppia.articolo}${coppia.sku ? ` (${coppia.sku})` : ''}`;
  const base = {
    tipo: 'coppia' as const,
    causa,
    riferimento: `${coppia.variantId}:${coppia.locationId}`,
    nome,
    dettaglio: coppia.variante,
    sede: coppia.sede,
    apri: azione('apri_articolo', 'Apri l’articolo', coppia.productId),
    rilevatoAt: ultimoTentativoAt,
  };
  const allinea = allineaDisponibile
    ? azione(
        'allinea',
        '«Allinea giacenze su Shopify»: stabilisce la base per questa coppia con le sue protezioni',
      )
    : azione(
        'allinea',
        '«Allinea giacenze su Shopify» dopo aver risolto gli ordini senza sede: finché ci sono, rifiuta',
      );
  switch (causa) {
    case 'coppia_non_stoccata':
      return {
        ...base,
        conseguenza: `Su Shopify l’articolo non è stoccato in questa location${quando}: la coppia resta senza base e la sua quantità non parte. Se l’articolo non deve vendersi da questa sede, il caso resta così e non blocca nient’altro.`,
        azione: azione(
          'shopify',
          'Su Shopify: stocca l’articolo nella location, se deve vendersi da questa sede; poi «Allinea giacenze» qui',
        ),
      };
    case 'coppia_lettura_fallita':
      return {
        ...base,
        conseguenza: `Base non stabilita: la lettura del canale è fallita${quando}. La quantità di questa coppia non parte finché la base manca.`,
        azione: allinea,
      };
    case 'coppia_ferma_ordine_senza_sede':
      return {
        ...base,
        conseguenza: `Base non stabilita${quando}: un ordine aperto senza sede porta questa variante e la quantità è ferma.`,
        azione: allinea,
      };
    default:
      return {
        ...base,
        conseguenza: `Base non stabilita${quando}: la quantità di questa coppia non parte finché la base manca.`,
        azione: allinea,
      };
  }
}

function problemaArticolo(articolo: ArticoloEsclusoAttuale): ShopifySetupProblemaDto {
  const causa: ShopifySetupProblemaCausa =
    articolo.motivo === 'sku_ambiguo'
      ? 'articolo_sku_ambiguo'
      : articolo.motivo === 'push_fallito' || articolo.motivo === 'pubblicazione_fallita'
        ? 'articolo_pubblicazione_fallita'
        : 'articolo_import_fallito';
  return {
    tipo: 'articolo',
    causa,
    riferimento: articolo.productId,
    nome: articolo.nome,
    dettaglio: articolo.dettaglio,
    sede: null,
    conseguenza:
      causa === 'articolo_sku_ambiguo'
        ? 'Lo stesso SKU esiste dalle due parti senza collegamento: l’articolo non è sincronizzato.'
        : 'L’articolo non è collegato a Shopify: la sincronizzazione lo salta.',
    azione:
      causa === 'articolo_sku_ambiguo'
        ? azione(
            'apri_articolo',
            'Apri l’articolo e collega la variante Shopify giusta',
            articolo.productId,
          )
        : azione(
            'apri_articolo',
            'Apri l’articolo: correggi e riaccendi «Sincronizza con Shopify»',
            articolo.productId,
          ),
    apri: azione('apri_articolo', 'Apri l’articolo', articolo.productId),
    rilevatoAt: null,
  };
}

/** Tutti i problemi aperti adesso, nell'ordine in cui conviene leggerli. */
export function situazioneAttuale(input: SituazioneInput): readonly ShopifySetupProblemaDto[] {
  const problemi: ShopifySetupProblemaDto[] = [];

  if (input.ambitiMancanti.length > 0) {
    const fo = input.ambitiMancanti.includes(AMBITO_FULFILLMENT_ORDERS);
    problemi.push({
      tipo: 'connessione',
      causa: 'connessione_ambiti_mancanti',
      riferimento: 'ambiti',
      nome: input.ambitiMancanti.join(', '),
      dettaglio: null,
      sede: null,
      conseguenza: fo
        ? 'Senza il permesso di leggere i fulfillment order la sede degli ordini online non si determina: nessun impegno, quantità ferme.'
        : 'Il token non ha tutti i permessi che VestiFlow chiede: alcune operazioni verso Shopify falliranno.',
      azione: azione(
        'permessi',
        'Disconnetti e Connetti Shopify: la nuova autorizzazione chiede i permessi mancanti',
      ),
      apri: null,
      rilevatoAt: null,
    });
  }

  if (input.topicMancanti && input.topicMancanti.length > 0) {
    problemi.push({
      tipo: 'connessione',
      causa: 'connessione_webhook_mancanti',
      riferimento: 'webhook',
      nome: input.topicMancanti.join(', '),
      dettaglio: null,
      sede: null,
      conseguenza:
        'Gli eventi di questi tipi non arrivano: ciò che cambia su Shopify per quella via si vede solo con un import manuale.',
      azione: azione('webhook', 'Registra le notifiche mancanti'),
      apri: null,
      rilevatoAt: null,
    });
  }

  for (const ordine of input.ordiniSenzaSede) {
    problemi.push(problemaOrdine(ordine));
  }

  const allineaDisponibile = input.ordiniSenzaSede.length === 0;
  const esclusiPerCoppia = new Map(
    input.esclusiUltimoTentativo
      .filter((e) => e.tipo === 'coppia')
      .map((e) => [e.riferimento, e] as const),
  );
  for (const coppia of input.coppieSenzaBase) {
    problemi.push(
      problemaCoppia(
        coppia,
        esclusiPerCoppia.get(`${coppia.variantId}:${coppia.locationId}`),
        input.ultimoTentativoAt,
        allineaDisponibile,
      ),
    );
  }

  for (const articolo of input.articoliEsclusi) {
    problemi.push(problemaArticolo(articolo));
  }

  for (const evento of input.eventiNonApplicati ?? []) {
    problemi.push(problemaEvento(evento));
  }

  if (input.ordiniFallitiAttivazione > 0) {
    problemi.push({
      tipo: 'ordine',
      causa: 'ordini_acquisizione_fallita',
      riferimento: 'attivazione',
      nome: `${input.ordiniFallitiAttivazione} ordini`,
      dettaglio: null,
      sede: null,
      conseguenza:
        'All’attivazione questi ordini aperti non sono stati acquisiti: nessun impegno per loro.',
      azione: azione('importa_ordini', 'Ripeti «Importa ordini»'),
      apri: null,
      rilevatoAt: input.ultimoTentativoAt,
    });
  }

  return problemi;
}
