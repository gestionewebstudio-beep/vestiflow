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

  /*
    ⛔ **QUI C'ERA `reorderable`, e con lui le frecce ↑↓** — tolte il
    01/09/2026 su decisione del proprietario: «lasciamo solo default e
    personalizzata, e queste incidono solo su quali sono attive e quali no».

    Il commento che stava qui difendeva una distinzione — «sui sei elenchi che
    leggono l'ordine funzionano, altrove sono inerti» — e il principio era
    giusto: «un comando che finge di funzionare è peggio di un comando che
    manca». ⚠️ **Ma anche dove "funzionavano" fingevano a metà**: le righe di
    questo pannello sono sempre in ordine di DEFINIZIONE, mentre la freccia
    spostava la colonna in `columnOrder`, cioè nella tabella dietro il
    pannello. Si premeva e nel pannello non si muoveva niente. E poiché
    `columnOrder` contiene anche le colonne nascoste, una pressione su due
    scambiava con una colonna invisibile: nessun effetto nemmeno nella tabella.

    ⭐ Ora l'ordine è quello dichiarato ovunque, e non c'è più niente da
    spegnere: le spunte mostra/nascondi e il blocco a sinistra restano.
  */

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
