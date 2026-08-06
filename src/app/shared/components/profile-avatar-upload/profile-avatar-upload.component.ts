import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { isAppError } from '@core/models/app-error.model';
import type { User } from '@core/models/user.model';
import { UserProfileService } from '@core/services/user-profile.service';
import { AvatarCropDialogComponent } from '@shared/components/avatar-crop-dialog/avatar-crop-dialog.component';
import { AvatarPreviewDialogComponent } from '@shared/components/avatar-preview-dialog/avatar-preview-dialog.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { UserAvatarComponent } from '@shared/components/user-avatar/user-avatar.component';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

@Component({
  selector: 'app-profile-avatar-upload',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AvatarCropDialogComponent,
    AvatarPreviewDialogComponent,
    ButtonComponent,
    UserAvatarComponent,
  ],
  templateUrl: './profile-avatar-upload.component.html',
  styleUrl: './profile-avatar-upload.component.scss',
})
export class ProfileAvatarUploadComponent {
  private readonly userProfile = inject(UserProfileService);
  private readonly destroyRef = inject(DestroyRef);

  readonly user = input.required<User>();

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly cropOpen = signal(false);
  protected readonly cropImageSrc = signal<string | null>(null);
  protected readonly previewOpen = signal(false);

  private pendingFileName = 'avatar.jpg';

  constructor() {
    this.destroyRef.onDestroy(() => this.revokeCropPreview());
  }

  protected onFileSelected(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    inputEl.value = '';
    if (!file || this.loading()) {
      return;
    }

    const validationError = this.validateImageFile(file);
    if (validationError) {
      this.error.set(validationError);
      return;
    }

    this.error.set(null);
    this.revokeCropPreview();
    this.pendingFileName = this.buildAvatarFileName(file.name);
    this.cropImageSrc.set(URL.createObjectURL(file));
    this.cropOpen.set(true);
  }

  protected onCropConfirmed(blob: Blob): void {
    if (this.loading()) {
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    const file = new File([blob], this.pendingFileName, { type: blob.type });

    this.userProfile
      .uploadAvatar(file)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.loading.set(false);
          this.closeCropDialog();
        },
        error: (err: unknown) => {
          this.loading.set(false);
          this.error.set(this.readUploadError(err));
        },
      });
  }

  protected onCropDismissed(): void {
    if (!this.loading()) {
      this.closeCropDialog();
    }
  }

  protected openPreview(): void {
    if (this.user().avatarUrl && !this.loading()) {
      this.previewOpen.set(true);
    }
  }

  protected onPreviewDismissed(): void {
    this.previewOpen.set(false);
  }

  protected avatarPreviewLabel(): string {
    const user = this.user();
    return user.displayName.trim() || user.email;
  }

  protected removeAvatar(): void {
    if (this.loading() || !this.user().avatarUrl) {
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    this.userProfile
      .removeAvatar()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.loading.set(false),
        error: (err: unknown) => {
          this.loading.set(false);
          if (isAppError(err)) {
            this.error.set(err.message);
            return;
          }
          this.error.set('Rimozione foto non riuscita.');
        },
      });
  }

  private closeCropDialog(): void {
    this.cropOpen.set(false);
    this.revokeCropPreview();
  }

  private revokeCropPreview(): void {
    const src = this.cropImageSrc();
    if (src) {
      URL.revokeObjectURL(src);
    }
    this.cropImageSrc.set(null);
  }

  private validateImageFile(file: File): string | null {
    if (!ALLOWED_TYPES.has(file.type)) {
      return 'Formato non supportato. Usa JPEG, PNG o WebP.';
    }
    if (file.size > MAX_AVATAR_BYTES) {
      return 'Immagine troppo grande (max 2 MB).';
    }
    if (!file.type.startsWith('image/')) {
      return 'Seleziona un file immagine.';
    }
    return null;
  }

  private buildAvatarFileName(originalName: string): string {
    const base = originalName.replace(/\.[^.]+$/, '') || 'avatar';
    return `${base}-cropped.jpg`;
  }

  private readUploadError(err: unknown): string {
    if (err instanceof Error && err.message) {
      return err.message;
    }
    if (isAppError(err)) {
      return err.message;
    }
    return 'Caricamento foto non riuscito.';
  }
}
