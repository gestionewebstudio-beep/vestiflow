import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-orders',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<h1>Ordini Fornitori</h1>',
})
export class OrdersComponent {}
