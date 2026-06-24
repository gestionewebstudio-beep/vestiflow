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
  toIsoDateLocal,
  viewMonthFromIso,
} from '@shared/utils/calendar.util';

/**
 * Selettore data custom (Polaris-like), allineato a app-select-menu.
 * Valore ISO `YYYY-MM-DD`; supporta reactive forms via ControlValueAccessor.
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
  readonly placeholder = input<string>('Seleziona data');
  readonly compact = input<boolean>(false);
  readonly fullWidth = input<boolean>(false);
  readonly invalid = input<boolean>(false);
  readonly describedBy = input<string>();
  readonly min = input<string>();
  readonly max = input<string>();
  /** Valore controllato (ISO `YYYY-MM-DD`); omit per usare solo reactive forms. */
  readonly value = input<string | undefined>(undefined);

  readonly valueChange = output<string>();

  protected readonly open = signal(false);
  protected readonly disabled = signal(false);
  private readonly valueState = signal('');
  private readonly viewYear = signal(new Date().getFullYear());
  private readonly viewMonthIndex = signal(new Date().getMonth());

  protected readonly weekdayLabels = CALENDAR_WEEKDAY_LABELS_IT;

  protected readonly displayLabel = computed(() => {
    const formatted = formatItalianInputDate(this.valueState());
    return formatted.length > 0 ? formatted : this.placeholder();
  });

  protected readonly isEmpty = computed(() => this.valueState().length === 0);

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
        this.valueState.set(external.trim());
      }
    });

    effect(() => {
      const view = viewMonthFromIso(this.valueState());
      this.viewYear.set(view.year);
      this.viewMonthIndex.set(view.monthIndex);
    });
  }

  writeValue(value: string | null): void {
    this.valueState.set(value?.trim() ?? '');
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

  private shiftMonth(delta: number): void {
    const date = new Date(this.viewYear(), this.viewMonthIndex() + delta, 1);
    this.viewYear.set(date.getFullYear());
    this.viewMonthIndex.set(date.getMonth());
  }

  private commitValue(value: string): void {
    this.valueState.set(value);
    this.onChange(value);
    this.valueChange.emit(value);
  }
}
