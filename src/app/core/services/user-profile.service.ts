import { inject, Injectable } from '@angular/core';
import { map, type Observable, timeout } from 'rxjs';

import { AuthService } from '@core/auth';
import { mapUserProfileFromApi, type UserProfileApi } from '@core/auth/fetch-user-profile.util';
import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';
import type { User } from '@core/models/user.model';

const HTTP_TIMEOUT_MS = 30_000;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

@Injectable({ providedIn: 'root' })
export class UserProfileService {
  private readonly http = inject(ApiHttpClient);
  private readonly config = inject(APP_CONFIG);
  private readonly auth = inject(AuthService);

  uploadAvatar(file: File): Observable<User> {
    this.assertAvatarFile(file);
    const formData = new FormData();
    formData.append('file', file);

    return this.http.post<UserProfileApi>(`${this.config.apiBaseUrl}/auth/avatar`, formData).pipe(
      timeout(HTTP_TIMEOUT_MS),
      map((row) => mapUserProfileFromApi(row)),
      map((user) => {
        this.auth.setCurrentUser(user);
        return user;
      }),
    );
  }

  removeAvatar(): Observable<User> {
    return this.http.delete<UserProfileApi>(`${this.config.apiBaseUrl}/auth/avatar`).pipe(
      timeout(HTTP_TIMEOUT_MS),
      map((row) => mapUserProfileFromApi(row)),
      map((user) => {
        this.auth.setCurrentUser(user);
        return user;
      }),
    );
  }

  private assertAvatarFile(file: File): void {
    if (!ALLOWED_TYPES.has(file.type)) {
      throw new Error('Formato non supportato. Usa JPEG, PNG o WebP.');
    }
    if (file.size > MAX_AVATAR_BYTES) {
      throw new Error('Immagine troppo grande (max 2 MB).');
    }
  }
}
