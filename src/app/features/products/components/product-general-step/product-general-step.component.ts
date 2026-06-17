import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import type { Subscription } from 'rxjs';

import { ProductStatus } from '@core/models/product.model';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

import type { ProductGeneralDraft } from '../../models/product-form.model';
import { productStatusLabel } from '../../models/product-status.util';

type RequiredField = 'name' | 'brand' | 'category' | 'season';

interface StatusOption {
  readonly value: ProductStatus;
  readonly label: string;
}

const STATUS_OPTIONS: readonly StatusOption[] = [
  { value: ProductStatus.Active, label: productStatusLabel(ProductStatus.Active) },
  { value: ProductStatus.Draft, label: productStatusLabel(ProductStatus.Draft) },
  { value: ProductStatus.Archived, label: productStatusLabel(ProductStatus.Archived) },
];

/**
 * Step "Dati generali" del wizard prodotto (presentazionale).
 * Possiede un Reactive Form tipizzato e comunica le modifiche al wizard via
 * `valueChange`. Il gating (validità dello step) è derivato dal wizard sul draft,
 * così questo componente resta privo di stato globale e logica di navigazione.
 */
@Component({
  selector: 'app-product-general-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, SelectMenuComponent],
  templateUrl: './product-general-step.component.html',
  styleUrl: './product-general-step.component.scss',
})
export class ProductGeneralStepComponent implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  /** Valore iniziale dello step (dal draft del wizard). Seedato una volta al load. */
  readonly value = input.required<ProductGeneralDraft>();
  readonly valueChange = output<ProductGeneralDraft>();

  /** Sorgenti select (facets da getFilterOptions, fornite dal wizard). */
  readonly categories = input<readonly string[]>([]);
  readonly seasons = input<readonly string[]>([]);

  protected readonly statusSelectOptions: readonly SelectMenuOption[] = STATUS_OPTIONS.map(
    (option) => ({
      value: option.value,
      label: option.label,
    }),
  );

  // Valore iniziale del draft, catturato una volta: se in edit non e' tra i
  // facets viene comunque incluso nella select per non perderlo.
  private readonly initialCategory = signal('');
  private readonly initialSeason = signal('');

  protected readonly categoryOptions = computed(() =>
    this.withCurrent(this.categories(), this.initialCategory()),
  );
  protected readonly seasonOptions = computed(() =>
    this.withCurrent(this.seasons(), this.initialSeason()),
  );

  protected readonly form = this.fb.group({
    name: this.fb.control('', [Validators.required]),
    brand: this.fb.control('', [Validators.required]),
    category: this.fb.control('', [Validators.required]),
    season: this.fb.control('', [Validators.required]),
    status: this.fb.control<ProductStatus>(ProductStatus.Draft),
    description: this.fb.control(''),
  });

  // takeUntilDestroyed() gestisce l'unsubscribe; il campo evita subscription "ignorate".
  private valueChangesSub: Subscription | null = null;

  ngOnInit(): void {
    const initial = this.value();
    this.initialCategory.set(initial.category);
    this.initialSeason.set(initial.season);
    this.form.setValue(initial, { emitEvent: false });
    this.valueChangesSub = this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.valueChange.emit(this.form.getRawValue()));
  }

  protected showError(field: RequiredField): boolean {
    const control = this.form.controls[field];
    return control.invalid && control.touched;
  }

  protected onStatusSelect(value: string | null): void {
    if (value) {
      this.form.controls.status.setValue(value as ProductStatus);
    }
  }

  /** Include il valore corrente tra le opzioni se non gia' presente (edit legacy). */
  private withCurrent(list: readonly string[], current: string): readonly string[] {
    const value = current.trim();
    return value && !list.includes(value) ? [value, ...list] : list;
  }
}
