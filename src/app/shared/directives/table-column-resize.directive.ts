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
  private lastWidth = 0;

  onMouseDown(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const hostEl = this.host.nativeElement as HTMLElement;
    const th = hostEl.closest('th');
    if (!(th instanceof HTMLTableCellElement)) {
      return;
    }
    const table = th.closest('table');
    const col = table?.querySelector('colgroup')?.children.item(th.cellIndex) ?? null;

    this.startX = event.clientX;
    this.startWidth = th.getBoundingClientRect().width;
    this.lastWidth = this.startWidth;

    const applyWidth = (widthPx: number): void => {
      const width = `${widthPx}px`;
      th.style.width = width;
      if (col instanceof HTMLTableColElement) {
        col.style.width = width;
      }
      this.lastWidth = widthPx;
    };

    const onMove = (moveEvent: MouseEvent): void => {
      const delta = moveEvent.clientX - this.startX;
      const next = Math.max(this.minWidthPx(), Math.round(this.startWidth + delta));
      applyWidth(next);
    };

    const onUp = (): void => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      this.resized.emit(this.lastWidth);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }
}
