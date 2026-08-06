import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { userInitials } from '@shared/utils/user-initials.util';

@Component({
  selector: 'app-user-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-avatar.component.html',
  styleUrl: './user-avatar.component.scss',
})
export class UserAvatarComponent {
  readonly displayName = input.required<string>();
  readonly email = input.required<string>();
  readonly avatarUrl = input<string | null | undefined>(null);
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly title = input<string>();

  protected readonly initials = computed(() => userInitials(this.displayName(), this.email()));

  protected readonly resolvedTitle = computed(
    () => this.title() ?? (this.displayName().trim() || this.email()),
  );

  protected readonly pixelSize = computed(() => {
    switch (this.size()) {
      case 'sm':
        return 32;
      case 'lg':
        return 96;
      default:
        return 36;
    }
  });
}
