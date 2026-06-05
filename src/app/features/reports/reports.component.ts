import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-reports',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<h1>Report</h1>',
})
export class ReportsComponent {}
