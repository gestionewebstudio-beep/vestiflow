import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import { formatDateTime } from '@core/utils/date.util';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { DataTableRowCardDirective } from '@shared/components/data-table/data-table-row-card.directive';
import { DataTableComponent } from '@shared/components/data-table/data-table.component';
import { DetailFactsComponent } from '@shared/components/detail-facts/detail-facts.component';
import type { DetailFact } from '@shared/components/detail-facts/detail-facts.component';
import { HoverTooltipComponent } from '@shared/components/hover-tooltip/hover-tooltip.component';
import type {
  DataTableSection,
  DataTableSort,
} from '@shared/components/data-table/data-table.model';
import { InlineBannerComponent } from '@shared/components/inline-banner/inline-banner.component';
import { colonna } from '@shared/table-columns/column-catalog';
import { ordinaPerColonne } from '@shared/table-columns/column-sort.util';
import type { ResolvedTableColumn } from '@shared/table-columns/table-column.model';

import type {
  ShopifySetupDirection,
  ShopifySetupDto,
  ShopifySetupFase,
  ShopifySetupIrrisoltoDto,
  ShopifySetupNonDeterminabileDto,
  ShopifySetupQuantitaRigaDto,
} from '../../models/shopify-setup.dto';
import { faseDelPercorso, situazioneDi } from '../../models/shopify-setup.dto';
import { ShopifyLocationChoicesComponent } from '../shopify-location-choices/shopify-location-choices.component';
import type { ShopifySetupSedeScelta } from '../shopify-location-choices/shopify-location-choices.component';

// Il tipo della scelta vive nel componente delle scelte; chi ospita il
// pannello lo trova anche da qui.
export type { ShopifySetupSedeScelta };

/**
 * ⭐ La PRIMA CONNESSIONE a tre fasi VISIBILI (`docs/27` §1): scelte iniziali,
 *    sedi, controllo e conferma. Componente dumb: mostra lo stato che riceve ed
 *    emette i comandi; chi lo ospita parla con l’API.
 *
 * ⚠️ Le fasi restano tutte a schermo, con quella corrente aperta: chi arriva
 *    alla terza vede da dove è passato, e «Indietro» ha un posto dove andare.
 */
@Component({
  selector: 'app-shopify-setup-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    BadgeComponent,
    ButtonComponent,
    HoverTooltipComponent,
    DataTableComponent,
    DetailFactsComponent,
    DataTableRowCardDirective,
    InlineBannerComponent,
    ShopifyLocationChoicesComponent,
  ],
  templateUrl: './shopify-setup-panel.component.html',
  styleUrl: './shopify-setup-panel.component.scss',
})
export class ShopifySetupPanelComponent {
  readonly setup = input.required<ShopifySetupDto>();
  /** Un comando è in corso: i pulsanti aspettano. */
  readonly busy = input(false);
  readonly errore = input<string | null>(null);
  /** L’attivazione dura oltre il timeout: lo smart rilegge lo stato e lo dice qui. */
  readonly attesa = input<string | null>(null);

  readonly direzioneScelta = output<ShopifySetupDirection>();
  readonly sedeScelta = output<ShopifySetupSedeScelta>();
  readonly anteprimaRichiesta = output<void>();
  readonly confermata = output<void>();
  readonly indietro = output<'scelte' | 'sedi'>();
  readonly attivazioneRichiesta = output<void>();
  readonly aggiornamentoRichiesto = output<void>();
  /** «Vedi problemi»: la scheda dei problemi è di chi ospita il pannello. */
  readonly problemiRichiesti = output<void>();

  protected readonly fase = computed<ShopifySetupFase>(() => faseDelPercorso(this.setup().status));
  protected readonly attivato = computed(() => this.setup().status === 'attivato');
  protected readonly inTrasferimento = computed(
    () => this.setup().status === 'trasferimento' || this.setup().trasferimentoInCorso,
  );
  protected readonly interrotto = computed(() => this.setup().status === 'interrotto');
  protected readonly trasferito = computed(() => this.setup().status === 'trasferito');
  /** Le scelte si cambiano solo prima della conferma. */
  protected readonly modificabile = computed(() =>
    ['scelte', 'sedi', 'controllo'].includes(this.setup().status ?? ''),
  );

  // ── Dopo l'attivazione: la situazione di oggi, e lo storico richiudibile ──
  /** I problemi aperti ADESSO (13/09/2026): il badge conta questi, non una fotografia. */
  protected readonly problemiAperti = computed(() => situazioneDi(this.setup()).problemi.length);
  protected readonly dataAttivazione = computed(() => {
    const at = this.setup().activatedAt;
    return at ? formatDateTime(at) : '—';
  });
  /**
   * ⭐ «Percorso concluso» e «tutte le operazioni riuscite» sono DUE cose
   *    (proprietario, 13/09/2026): il percorso può essere concluso con
   *    l'allineamento fermo o con esclusi. Lo stato dell'esito, col suo colore.
   */
  protected readonly esitoSintesi = computed((): { testo: string; tono: 'success' | 'warning' } => {
    const e = this.setup().esito;
    if (!e) {
      return { testo: 'esito non registrato', tono: 'warning' };
    }
    if (e.interruzione) {
      return { testo: 'trasferimento interrotto', tono: 'warning' };
    }
    const att = e.attivazione;
    if (att?.base.fermo) {
      return { testo: 'allineamento delle quantità fermo', tono: 'warning' };
    }
    const nonAllineate = att?.base.nonAllineate ?? e.allinea?.nonAllineate ?? 0;
    const falliti = (e.catalogo?.failed ?? 0) + (att?.ordini.falliti ?? 0);
    if (nonAllineate > 0 || falliti > 0 || e.esclusi.length > 0) {
      const esclusi = e.esclusi.length || nonAllineate;
      return {
        testo: `riuscita con ${esclusi} ${esclusi === 1 ? 'escluso' : 'esclusi'}`,
        tono: 'warning',
      };
    }
    return { testo: 'tutte le operazioni riuscite', tono: 'success' };
  });
  /** Una riga di numeri: che cosa ha fatto la partenza. */
  protected readonly sintesiStorico = computed(() => {
    const e = this.setup().esito;
    if (!e) {
      return '';
    }
    const parti: string[] = [];
    if (e.catalogo) {
      parti.push(`catalogo ${e.catalogo.imported} importati/pubblicati`);
    }
    if (e.quantita) {
      parti.push(`quantità ${e.quantita.scritte} scritte su ${e.quantita.coppie}`);
    }
    if (e.attivazione) {
      parti.push(`ordini ${e.attivazione.ordini.acquisiti} acquisiti`);
      parti.push(
        e.attivazione.base.fermo
          ? 'allineamento fermo'
          : `allineamento ${e.attivazione.base.allineate + e.attivazione.base.giaAllineate} su ${e.attivazione.base.totale}`,
      );
    }
    return parti.join(' · ');
  });

  protected formatta(iso: string): string {
    return formatDateTime(iso);
  }

  // ── Lo stepper (14/09/2026): ogni fase è fatta, corrente o futura ──
  /** Lo stato di una fase rispetto a quella corrente; a percorso concluso sono tutte fatte. */
  protected statoFase(n: 1 | 2 | 3): 'fatta' | 'corrente' | 'futura' {
    if (this.attivato()) {
      return 'fatta';
    }
    const corrente = { scelte: 1, sedi: 2, controllo: 3 }[this.fase()];
    if (n < corrente) {
      return 'fatta';
    }
    return n === corrente ? 'corrente' : 'futura';
  }

  /** «fase 2 di 3 · Sedi», per il titolo a percorso in corso. */
  protected readonly etichettaFase = computed(() => {
    const nomi = { scelte: 'Scelte iniziali', sedi: 'Sedi', controllo: 'Controllo e conferma' };
    const corrente = { scelte: 1, sedi: 2, controllo: 3 }[this.fase()];
    return `fase ${corrente} di 3 · ${nomi[this.fase()]}`;
  });

  /** La riga della fase 3: conferma, trasferimento e attivazione, con le date che ci sono. */
  protected readonly cronologiaFase3 = computed(() => {
    const s = this.setup();
    const parti: string[] = [];
    if (s.confirmedAt) {
      parti.push(`confermata il ${formatDateTime(s.confirmedAt)}`);
    }
    const e = s.esito;
    if (e?.interruzione) {
      parti.push('trasferimento interrotto');
    } else if (e?.finishedAt) {
      parti.push(`trasferimento concluso il ${formatDateTime(e.finishedAt)}`);
    } else if (this.inTrasferimento()) {
      parti.push('trasferimento in corso');
    }
    if (s.activatedAt) {
      parti.push(`attivata il ${formatDateTime(s.activatedAt)}`);
    }
    if (parti.length === 0) {
      return s.anteprima
        ? `anteprima calcolata il ${formatDateTime(s.anteprima.computedAt)}, da confermare`
        : 'anteprima da calcolare';
    }
    const testo = parti.join(' · ');
    return testo.charAt(0).toUpperCase() + testo.slice(1);
  });

  /**
   * ⭐ I QUATTRO FATTI della prima connessione conclusa, in testa: direzione, catalogo,
   *    sedi, ordini (proposta approvata il 14/09/2026). Sostituiscono la frase di
   *    numeri che ripeteva quello che stava nelle fasi.
   */
  protected readonly riepilogoAttivato = computed((): readonly DetailFact[] => {
    const s = this.setup();
    const e = s.esito;
    const a = s.anteprima;
    const fatti: DetailFact[] = [
      {
        label: 'Direzione iniziale',
        value: this.etichettaDirezione(s.direction),
        note:
          s.direction === 'shopify_to_vestiflow'
            ? 'catalogo e quantità presi dal negozio'
            : 'articoli pubblicati e quantità allineate a VestiFlow',
      },
    ];
    if (e?.catalogo) {
      const esclusi = e.esclusi.length;
      fatti.push({
        label: 'Catalogo',
        value: `${e.catalogo.imported} articoli importati/pubblicati`,
        note:
          esclusi > 0
            ? `${esclusi} ${esclusi === 1 ? 'escluso' : 'esclusi'}: ${e.esclusi
                .map((x) => x.motivo)
                .filter((m, i, arr) => arr.indexOf(m) === i)
                .join(', ')}`
            : e.catalogo.failed > 0
              ? `${e.catalogo.failed} falliti`
              : undefined,
      });
    }
    if (a) {
      fatti.push({
        label: 'Sedi',
        value: `${this.conteggioSedi(a.sedi.collegate.length, 'collegata', 'collegate')} · ${this.conteggioSedi(a.sedi.lasciate.length, 'lasciata fuori', 'lasciate fuori')}`,
        note: 'le sedi di oggi in «Connessione e sedi»',
      });
    }
    if (e?.attivazione) {
      const o = e.attivazione.ordini;
      fatti.push({
        label: 'Ordini aperti',
        value: `${o.acquisiti} acquisiti${o.senzaSede > 0 ? ` · ${o.senzaSede} senza sede` : ''}${o.falliti > 0 ? ` · ${o.falliti} falliti` : ''}`,
        note:
          o.senzaSede > 0
            ? `nessun impegno per ${o.senzaSede === 1 ? 'quello' : 'quei ' + o.senzaSede} senza sede: da risolvere nei problemi`
            : 'diventati impegni all’attivazione',
      });
    }
    return fatti;
  });

  /** Il codice diventa una frase: «sede_non_stoccata» non si legge. */
  protected etichettaNonDeterminabile(motivo: ShopifySetupNonDeterminabileDto['motivo']): string {
    switch (motivo) {
      case 'sede_non_stoccata':
        return 'articolo non stoccato in quella location su Shopify';
      case 'articolo_assente':
        return 'articolo assente su Shopify';
      case 'quantita_assente':
        return 'Shopify non espone la quantità';
      case 'lettura_fallita':
        return 'lettura da Shopify fallita';
      default:
        return motivo;
    }
  }

  protected readonly sediSenzaScelta = computed(
    () => this.setup().locations.filter((l) => l.choice === null).length,
  );

  protected readonly puoConfermare = computed(() => {
    const s = this.setup();
    if (s.status === 'interrotto') {
      return true;
    }
    return s.status === 'controllo' && s.anteprima !== null && s.anteprima.blocchi.length === 0;
  });

  // ── Le variazioni previste sul MOTORE comune (`docs/26`, come A3 e A26) ──
  // ⭐ Righe articolo × sede con due quantità: un elenco di consultazione, con
  //    ordinamento e card sotto `lg`. Colonne risolte qui, senza servizio delle
  //    preferenze: è un componente dumb, come `product-stock-table`.
  // ⚠️ Nessuna riga totali: l’anteprima porta al più 200 righe su
  //    `righeTotali`, e la somma delle righe rese sarebbe il totale della
  //    VISTA, non del perimetro (`regole-stile-ui`, «La riga TOTALI»).
  protected readonly ordineQuantita = signal<readonly DataTableSort[]>([]);
  protected readonly rigaQuantitaId = (r: ShopifySetupQuantitaRigaDto): string =>
    `${r.sku ?? r.articolo}·${r.variante ?? ''}·${r.sede}`;

  protected readonly colonneQuantita: readonly ResolvedTableColumn[] = [
    { id: 'articolo', label: 'Articolo', defaultVisible: true, cardTitle: true, pinned: false },
    { id: 'variante', label: 'Variante', defaultVisible: true, defaultWidthPx: 160, pinned: false },
    { ...colonna('location', { defaultVisible: true, defaultWidthPx: 160 }), pinned: false },
    {
      id: 'attuale',
      label: 'Attuale',
      numeric: true,
      summable: false,
      defaultVisible: true,
      defaultWidthPx: 100,
      pinned: false,
    },
    {
      id: 'prevista',
      label: 'Prevista',
      numeric: true,
      summable: false,
      defaultVisible: true,
      defaultWidthPx: 100,
      pinned: false,
    },
  ];

  protected readonly testoQuantita = (r: ShopifySetupQuantitaRigaDto, id: string): string => {
    switch (id) {
      case 'articolo':
        return r.articolo;
      case 'variante':
        return r.variante || r.sku || '—';
      case 'location':
        return r.sede;
      case 'attuale':
        return String(r.attuale);
      case 'prevista':
        return String(r.prevista);
      default:
        return '';
    }
  };

  private readonly numeroQuantita = (r: ShopifySetupQuantitaRigaDto, id: string): number | null =>
    id === 'attuale' ? r.attuale : id === 'prevista' ? r.prevista : null;

  protected readonly sezioniQuantita = computed(
    (): readonly DataTableSection<ShopifySetupQuantitaRigaDto>[] => [
      {
        id: 'variazioni',
        rows: ordinaPerColonne(
          this.setup().anteprima?.quantita.righe ?? [],
          this.ordineQuantita(),
          { cellText: this.testoQuantita, numeroDi: this.numeroQuantita },
        ),
      },
    ],
  );

  protected etichettaIrrisolto(tipo: ShopifySetupIrrisoltoDto['tipo']): string {
    switch (tipo) {
      case 'articolo':
        return 'Articolo';
      case 'coppia':
        return 'Quantità';
      case 'ordine':
        return 'Ordine';
    }
  }

  /** «1 collegata · 4 lasciate fuori»: il numero accorda la parola (13/09/2026). */
  protected conteggioSedi(n: number, singolare: string, plurale: string): string {
    return `${n} ${n === 1 ? singolare : plurale}`;
  }

  protected etichettaDirezione(direction: ShopifySetupDirection | null): string {
    switch (direction) {
      case 'shopify_to_vestiflow':
        return 'Shopify → VestiFlow';
      case 'vestiflow_to_shopify':
        return 'VestiFlow → Shopify';
      default:
        return 'Da scegliere';
    }
  }

  protected etichettaFaseTrasferimento(fase: 'catalogo' | 'quantita' | 'concluso'): string {
    switch (fase) {
      case 'catalogo':
        return 'Catalogo in corso';
      case 'quantita':
        return 'Quantità in corso';
      default:
        return 'Concluso';
    }
  }
}
