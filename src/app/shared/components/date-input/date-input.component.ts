import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  forwardRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import {
  CALENDAR_WEEKDAY_LABELS_IT,
  buildCalendarMonthGrid,
  clampIsoDate,
  formatCalendarMonthLabel,
  formatItalianInputDate,
  parseItalianDateInput,
  toIsoDateLocal,
  viewMonthFromIso,
} from '@shared/utils/calendar.util';

/**
 * Campo data con digitazione manuale (`GG/MM/AAAA`, normalizza `1/7/2026`)
 * e calendario Polaris-like. Valore ISO `YYYY-MM-DD`; supporta reactive forms
 * via ControlValueAccessor. Date incomplete o inesistenti mostrano un errore
 * leggibile senza sporcare il valore del form.
 */
@Component({
  selector: 'app-date-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DateInputComponent),
      multi: true,
    },
  ],
  host: {
    class: 'date-input-host',
    '[class.date-input-host--full]': 'fullWidth()',
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'close()',
  },
  imports: [],
  templateUrl: './date-input.component.html',
  styleUrl: './date-input.component.scss',
})
export class DateInputComponent implements ControlValueAccessor {
  private readonly hostElement: HTMLElement = inject(ElementRef<HTMLElement>)
    .nativeElement as HTMLElement;

  readonly inputId = input<string>();
  readonly ariaLabel = input.required<string>();
  readonly placeholder = input<string>('GG/MM/AAAA');
  readonly compact = input<boolean>(false);
  readonly fullWidth = input<boolean>(false);
  readonly invalid = input<boolean>(false);
  readonly describedBy = input<string>();
  readonly min = input<string>();
  readonly max = input<string>();
  /** Valore controllato (ISO `YYYY-MM-DD`); omit per usare solo reactive forms. */
  readonly value = input<string | undefined>(undefined);

  readonly valueChange = output<string>();
  readonly triggerKeydown = output<KeyboardEvent>();
  readonly triggerBlur = output<void>();

  protected readonly open = signal(false);
  protected readonly disabled = signal(false);
  private readonly valueState = signal('');
  /** Testo digitato dall'utente (può divergere dal valore finché non è valido). */
  protected readonly inputText = signal('');
  /** true quando il testo digitato non è una data valida (errore leggibile). */
  protected readonly parseError = signal(false);
  private readonly viewYear = signal(new Date().getFullYear());
  private readonly viewMonthIndex = signal(new Date().getMonth());

  protected readonly weekdayLabels = CALENDAR_WEEKDAY_LABELS_IT;

  protected readonly errorId = computed(() => {
    const id = this.inputId();
    return id ? `${id}-parse-error` : 'date-input-parse-error';
  });

  protected readonly describedByIds = computed(() => {
    const ids = [this.describedBy(), this.parseError() ? this.errorId() : null].filter(Boolean);
    return ids.length > 0 ? ids.join(' ') : null;
  });

  protected readonly monthLabel = computed(() =>
    formatCalendarMonthLabel(this.viewYear(), this.viewMonthIndex()),
  );

  protected readonly calendarDays = computed(() =>
    buildCalendarMonthGrid(this.viewYear(), this.viewMonthIndex(), this.valueState(), new Date()),
  );

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor() {
    effect(() => {
      const external = this.value();
      if (external !== undefined) {
        this.applyExternalValue(external.trim());
      }
    });

    effect(() => {
      const view = viewMonthFromIso(this.valueState());
      this.viewYear.set(view.year);
      this.viewMonthIndex.set(view.monthIndex);
    });
  }

  writeValue(value: string | null): void {
    this.applyExternalValue(value?.trim() ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
    if (isDisabled) {
      this.close();
    }
  }

  protected toggle(): void {
    if (this.disabled()) {
      return;
    }

    const willOpen = !this.open();
    if (willOpen) {
      const view = viewMonthFromIso(this.valueState());
      this.viewYear.set(view.year);
      this.viewMonthIndex.set(view.monthIndex);
    }
    this.open.set(willOpen);
  }

  protected close(): void {
    this.open.set(false);
  }

  protected onFieldInput(text: string): void {
    this.inputText.set(text);
    this.parseError.set(false);
  }

  protected onFieldKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.commitTypedValue();
    }
    this.triggerKeydown.emit(event);
  }

  protected onFieldBlur(): void {
    this.commitTypedValue();
    this.triggerBlur.emit();
    this.onTouched();
  }

  protected selectDay(iso: string): void {
    const next = clampIsoDate(iso, this.min(), this.max());
    this.commitValue(next);
    this.close();
  }

  protected selectToday(): void {
    this.selectDay(toIsoDateLocal(new Date()));
  }

  protected clearValue(): void {
    this.commitValue('');
    this.close();
  }

  protected previousMonth(): void {
    this.shiftMonth(-1);
  }

  protected nextMonth(): void {
    this.shiftMonth(1);
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (!this.open()) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }

    if (!this.hostElement.contains(target)) {
      this.close();
    }
  }

  /** Interpreta il testo digitato: vuoto = cancella, valido = normalizza. */
  private commitTypedValue(): void {
    const text = this.inputText().trim();
    if (!text) {
      this.parseError.set(false);
      if (this.valueState() !== '') {
        this.commitValue('');
      }
      return;
    }

    const iso = parseItalianDateInput(text);
    if (!iso) {
      this.parseError.set(true);
      return;
    }

    this.parseError.set(false);
    this.commitValue(clampIsoDate(iso, this.min(), this.max()));
  }

  private applyExternalValue(value: string): void {
    this.valueState.set(value);
    this.inputText.set(formatItalianInputDate(value));
    this.parseError.set(false);
  }

  private shiftMonth(delta: number): void {
    const date = new Date(this.viewYear(), this.viewMonthIndex() + delta, 1);
    this.viewYear.set(date.getFullYear());
    this.viewMonthIndex.set(date.getMonth());
  }

  private commitValue(value: string): void {
    this.valueState.set(value);
    this.inputText.set(formatItalianInputDate(value));
    this.parseError.set(false);
    this.onChange(value);
    this.valueChange.emit(value);
  }
}
