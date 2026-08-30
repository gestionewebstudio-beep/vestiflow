import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';

import { ButtonComponent } from '@shared/components/button/button.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import {
  TABLE_VIEW_PRESET_LABELS,
  TableViewPresetId,
  type TableViewId,
  type TableViewPresetId as PresetId,
} from '@shared/table-columns/table-column.model';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';

/**
 * Pannello selezione colonne e viste salvate (§7.1).
 * Dumb rispetto al dominio: opera solo su TableViewId registrato.
 */
@Component({
  selector: 'app-table-column-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'table-column-picker-host',
    '(document:click)': 'onDocumentClick($event)',
  },
  imports: [ButtonComponent, SelectMenuComponent],
  templateUrl: './table-column-picker.component.html',
  styleUrl: './table-column-picker.component.scss',
})
export class TableColumnPickerComponent {
  private readonly preferences = inject(TableColumnPreferenceService);

  readonly viewId = input.required<TableViewId>();

  /**
   * Le frecce ↑↓ che spostano una colonna compaiono solo dove **fanno
   * qualcosa** (specifica §6.1).
   *
   * Il pannello è condiviso da undici schermate. Sui sei elenchi che leggono
   * l'ordine delle colonne — registro documenti, giacenze, movimenti,
   * situazione, ordini cliente, fornitori — le frecce funzionano. Su Prodotti,
   * Clienti e su **tutte le maschere documento** sono **inerti**: quelle tabelle
   * hanno un ordine fisso, e la freccia si preme senza che accada niente.
   *
   * Un comando che finge di funzionare è peggio di un comando che manca: chi lo
   * preme non conclude «non si può», conclude «non ha funzionato», e ci riprova.
   * Dove l'ordine non si sposta, le frecce non ci sono; le spunte mostra/nascondi
   * restano.
   *
   * Acceso di default: chi lo spegne è la minoranza, e un valore predefinito
   * che rompe undici schermate se qualcuno se ne dimentica non è un buon
   * valore predefinito.
   */
  readonly reorderable = input(true);

  /*
    ⭐ **A sola icona**, per le barre strette. Il nome resta nell'`aria-label`:
    sparisce alla vista, non a chi legge con uno screen reader.

    ⚠️ L'icona è `pi-table` e il pannello si intitola «Colonne visibili»: chi la
    preme trova subito la parola, quindi il simbolo non deve indovinarsi da solo.
  */
  readonly iconOnly = input(false);

  protected readonly open = signal(false);

  protected readonly presetOptions = computed((): readonly SelectMenuOption[] =>
    (Object.values(TableViewPresetId) as PresetId[]).map((id) => ({
      value: id,
      label: TABLE_VIEW_PRESET_LABELS[id],
    })),
  );

  protected readonly viewState = computed(() => this.preferences.state(this.viewId())());

  protected readonly columnRows = computed(() => {
    const defs = this.preferences.columnDefs(this.viewId());
    const state = this.viewState();
    const hidden = new Set(state.hiddenColumnIds);
    return defs.map((def) => ({
      ...def,
      visible: !hidden.has(def.id),
      pinned: state.pinnedColumnIds.includes(def.id),
    }));
  });

  protected togglePanel(): void {
    this.open.update((value) => !value);
  }

  protected closePanel(): void {
    this.open.set(false);
  }

  protected onPresetChange(value: string | null): void {
    if (!value) {
      return;
    }
    this.preferences.applyPreset(this.viewId(), value as PresetId);
  }

  protected toggleColumn(columnId: string): void {
    this.preferences.toggleColumn(this.viewId(), columnId);
  }

  protected moveUp(columnId: string): void {
    this.preferences.moveColumn(this.viewId(), columnId, -1);
  }

  protected moveDown(columnId: string): void {
    this.preferences.moveColumn(this.viewId(), columnId, 1);
  }

  protected togglePin(columnId: string): void {
    this.preferences.togglePin(this.viewId(), columnId);
  }

  protected resetColumns(): void {
    this.preferences.resetToDefault(this.viewId());
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (!this.open()) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }
    const host = (target as HTMLElement).closest('.table-column-picker');
    if (!host) {
      this.closePanel();
    }
  }
}
