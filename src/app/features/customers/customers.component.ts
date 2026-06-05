import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-customers',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<h1>Clienti</h1>',
})
export class CustomersComponent {}
