import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';

import { LocationContextService } from '@core/services/location-context.service';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import { ButtonComponent } from '@shared/components/button/button.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

import { InventoryTabsComponent } from './components/inventory-tabs/inventory-tabs.component';
import { InventoryService } from './services/inventory.service';

/** Avvio nuova sessione inventario fisico. */
@Component({
  selector: 'app-inventory-count-new',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ButtonComponent, SelectMenuComponent, InventoryTabsComponent],
  templateUrl: './inventory-count-new.component.html',
  styleUrl: './inventory-count-new.component.scss',
})
export class InventoryCountNewComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly inventoryService = inject(InventoryService);
  private readonly locationContext = inject(LocationContextService);
  private readonly router = inject(Router);

  protected readonly submitting = signal(false);
  protected readonly submitError = signal<AppError | null>(null);

  private readonly locations = toSignal(this.inventoryService.getLocations(), {
    initialValue: [] as const,
  });

  protected readonly locationOptions = computed((): readonly SelectMenuOption[] =>
    this.locations().map((location) => ({ value: location.id, label: location.name })),
  );

  protected readonly form = this.fb.group({
    name: this.fb.control(this.defaultSessionName(), {
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(120)],
    }),
    locationId: this.fb.control(this.locationContext.activeLocationId() ?? '', {
      validators: [Validators.required],
    }),
    notes: this.fb.control('', { validators: [Validators.maxLength(500)] }),
  });

  protected cancel(): void {
    void this.router.navigate(['/app/inventory/counts']);
  }

  protected onLocationSelect(value: string | null): void {
    this.form.controls.locationId.setValue(value ?? '');
    this.form.controls.locationId.markAsTouched();
  }

  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.submitError.set(null);

    const raw = this.form.getRawValue();
    this.inventoryService
      .createInventoryCount({
        locationId: raw.locationId,
        name: raw.name.trim(),
        notes: raw.notes.trim() || undefined,
      })
      .pipe(
        catchError((error: unknown) => {
          this.submitting.set(false);
          this.submitError.set(
            isAppError(error)
              ? error
              : {
                  kind: AppErrorKind.Unknown,
                  message: 'Impossibile avviare la sessione inventario.',
                },
          );
          return of(null);
        }),
      )
      .subscribe((session) => {
        if (session) {
          void this.router.navigate(['/app/inventory/counts', session.id]);
        }
      });
  }

  protected fieldInvalid(name: 'name' | 'locationId'): boolean {
    const control = this.form.controls[name];
    return control.invalid && control.touched;
  }

  private defaultSessionName(): string {
    const now = new Date();
    const month = now.toLocaleString('it-IT', { month: 'long' });
    const year = now.getFullYear();
    return `Inventario ${month} ${year}`;
  }
}
