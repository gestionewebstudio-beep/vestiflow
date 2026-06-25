import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { isAppError } from '@core/models/app-error.model';
import type { Location } from '@core/models/location.model';
import { isShopifyManagedLocation } from '@core/utils/location-selection.util';
import {
  shouldShowLocationSelectionGrantedHint,
  shouldShowLocationSelectionLockedMessage,
} from '@core/utils/location-selection-lock.util';
import { ButtonComponent } from '@shared/components/button/button.component';

import { InventoryService } from '@features/inventory/services/inventory.service';

@Component({
  selector: 'app-location-licensing-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent],
  templateUrl: './location-licensing-panel.component.html',
  styleUrl: './location-licensing-panel.component.scss',
})
export class LocationLicensingPanelComponent {
  private readonly inventory = inject(InventoryService);

  readonly locations = input.required<readonly Location[]>();
  readonly licensedLocationCount = input.required<number>();
  readonly canManage = input(true);
  readonly selectionLocked = input(false);
  readonly selectionChangeGranted = input(false);

  readonly saved = output<void>();

  protected readonly submitLoading = signal(false);
  protected readonly submitError = signal<string | null>(null);

  private readonly selectedIds = signal<readonly string[]>([]);

  protected readonly selectableLocations = computed(() =>
    this.locations().filter((location) => location.isActive && isShopifyManagedLocation(location)),
  );

  protected readonly selectedCount = computed(() => this.selectedIds().length);

  protected readonly selectionOverLimit = computed(
    () => this.selectedCount() > this.licensedLocationCount(),
  );

  protected readonly limitErrorMessage = computed(() => {
    const limit = this.licensedLocationCount();
    if (this.selectedCount() <= limit) {
      return null;
    }

    return limit === 1
      ? 'Il tuo piano include 1 sola sede operativa.'
      : `Il tuo piano include al massimo ${limit} sedi operative.`;
  });

  protected readonly canSave = computed(
    () => this.canManage() && !this.submitLoading() && !this.selectionOverLimit(),
  );

  protected readonly showLockedMessage = computed(() =>
    shouldShowLocationSelectionLockedMessage({
      locationSelectionLocked: this.selectionLocked(),
      locationSelectionChangeGranted: this.selectionChangeGranted(),
    }),
  );

  protected readonly showGrantedHint = computed(() =>
    shouldShowLocationSelectionGrantedHint({
      locationSelectionLocked: this.selectionLocked(),
      locationSelectionChangeGranted: this.selectionChangeGranted(),
    }),
  );

  constructor() {
    effect(() => {
      const licensed = this.locations()
        .filter((location) => location.licensedInVf)
        .map((location) => location.id);
      this.selectedIds.set(licensed);
    });
  }

  protected isSelected(locationId: string): boolean {
    return this.selectedIds().includes(locationId);
  }

  protected toggleLocation(locationId: string): void {
    if (!this.canManage() || this.submitLoading()) {
      return;
    }

    const current = this.selectedIds();

    if (current.includes(locationId)) {
      this.selectedIds.set(current.filter((id) => id !== locationId));
      return;
    }

    this.selectedIds.set([...current, locationId]);
  }

  protected onSave(): void {
    if (!this.canSave()) {
      return;
    }

    const ids = this.selectedIds();

    this.submitLoading.set(true);
    this.submitError.set(null);

    this.inventory.setLicensedLocations(ids).subscribe({
      next: () => {
        this.submitLoading.set(false);
        this.saved.emit();
      },
      error: (err: unknown) => {
        this.submitLoading.set(false);
        this.submitError.set(
          isAppError(err) ? err.message : 'Salvataggio sedi non riuscito. Riprova.',
        );
      },
    });
  }
}
