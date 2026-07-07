import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '@core/auth';
import { canManageDocuments } from '@core/permissions/tenant-permissions.util';
import { ButtonComponent } from '@shared/components/button/button.component';

import { DOCUMENT_HUB_GROUPS } from './models/documents-hub.model';

/**
 * Hub tipologie documento (Danea-style): Documenti → scelta tipologia → lista dedicata.
 */
@Component({
  selector: 'app-documents-hub',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ButtonComponent],
  templateUrl: './documents-hub.component.html',
  styleUrl: './documents-hub.component.scss',
})
export class DocumentsHubComponent {
  private readonly authService = inject(AuthService);

  protected readonly groups = DOCUMENT_HUB_GROUPS;
  protected readonly canManageDocuments = computed(() =>
    canManageDocuments(this.authService.currentUser()),
  );
}
