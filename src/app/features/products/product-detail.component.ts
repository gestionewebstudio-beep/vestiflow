import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-product-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<h1>Dettaglio prodotto</h1>',
})
export class ProductDetailComponent {}
