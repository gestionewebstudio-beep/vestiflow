import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-product-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<h1>Prodotti</h1>',
})
export class ProductListComponent {}
