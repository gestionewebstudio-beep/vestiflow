import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '@core/auth';
import {
  canAccessSalesSection,
  canAccessSuppliersSection,
  canViewDocFamily,
} from '@core/permissions/tenant-permissions.util';
import type { User } from '@core/models/user.model';

import { DOCUMENT_HUB_GROUPS, type DocumentHubItem } from './models/documents-hub.model';

/**
 * Hub tipologie documento (Danea-style): Documenti → scelta tipologia → lista dedicata.
 *
 * Le card si filtrano sulla famiglia a cui portano: mostrarle tutte
 * significherebbe offrire porte che il guard di rotta rimbalza in silenzio.
 * Un gruppo che resta senza card sparisce con il suo titolo.
 */
@Component({
  selector: 'app-documents-hub',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './documents-hub.component.html',
  styleUrl: './documents-hub.component.scss',
})
export class DocumentsHubComponent {
  private readonly authService = inject(AuthService);

  protected readonly groups = computed(() => {
    const user = this.authService.currentUser();
    return DOCUMENT_HUB_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => this.isVisible(item, user)),
    })).filter((group) => group.items.length > 0);
  });

  private isVisible(item: DocumentHubItem, user: User | null): boolean {
    if (item.family) {
      return canViewDocFamily(user, item.family) && this.canEnterSection(item, user);
    }
    // Voce senza famiglia: vive già dietro la sezione Documenti, che è la
    // porta di questa schermata.
    return true;
  }

  /** La sezione che la rotta di destinazione esige oltre alla famiglia. */
  private canEnterSection(item: DocumentHubItem, user: User | null): boolean {
    switch (item.section) {
      case 'suppliers':
        return canAccessSuppliersSection(user);
      case 'sales':
        return canAccessSalesSection(user);
      default:
        return true;
    }
  }
}
