import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-inventory',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<h1>Magazzino</h1>',
})
export class InventoryComponent {}
