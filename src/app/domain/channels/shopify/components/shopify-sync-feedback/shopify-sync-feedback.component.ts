import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-shopify-sync-feedback',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shopify-sync-feedback.component.html',
  styleUrl: './shopify-sync-feedback.component.scss',
})
export class ShopifySyncFeedbackComponent {
  readonly message = input.required<string>();
  readonly tone = input<'success' | 'warning'>('success');

  readonly dismissed = output<void>();
}
