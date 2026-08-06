import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { DOCUMENT_HUB_GROUPS } from './models/documents-hub.model';

/**
 * Hub tipologie documento (Danea-style): Documenti → scelta tipologia → lista dedicata.
 */
@Component({
  selector: 'app-documents-hub',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './documents-hub.component.html',
  styleUrl: './documents-hub.component.scss',
})
export class DocumentsHubComponent {
  protected readonly groups = DOCUMENT_HUB_GROUPS;
}
