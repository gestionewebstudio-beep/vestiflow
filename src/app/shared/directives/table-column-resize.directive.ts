import { Directive, ElementRef, inject, input, output } from '@angular/core';

/** Handle di resize colonna tabella (trascinamento bordo header). */
@Directive({
  selector: '[appTableColumnResize]',
  host: {
    class: 'table-column-resize',
    '(mousedown)': 'onMouseDown($event)',
  },
})
export class TableColumnResizeDirective {
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly minWidthPx = input(48);
  readonly resized = output<number>();

  private startX = 0;
  private startWidth = 0;

  onMouseDown(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const hostEl = this.host.nativeElement as HTMLElement;
    const th = hostEl.closest('th');
    if (!(th instanceof HTMLTableCellElement)) {
      return;
    }
    this.startX = event.clientX;
    this.startWidth = th.getBoundingClientRect().width;

    const onMove = (moveEvent: MouseEvent): void => {
      const delta = moveEvent.clientX - this.startX;
      const next = Math.max(this.minWidthPx(), Math.round(this.startWidth + delta));
      this.resized.emit(next);
    };

    const onUp = (): void => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }
}
