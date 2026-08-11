import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { UserRole } from '@core/models/user.model';
import {
  DOCUMENT_FAMILY_LABELS,
  DOCUMENT_PERMISSION_FAMILIES,
  SENSITIVE_ACTION_PERMISSIONS,
  TENANT_PERMISSION_DEFINITIONS,
  TENANT_PERMISSION_GROUP_LABELS,
  VIEW_ONLY_DOCUMENT_FAMILIES,
  defaultPermissionsForRole,
  docManagePermission,
  docViewPermission,
  isTenantPermissionKey,
  type DocumentPermissionFamily,
  type TenantPermissionKey,
} from '@core/models/tenant-permission.model';
import { HoverTooltipComponent } from '@shared/components/hover-tooltip/hover-tooltip.component';

/**
 * Editor permessi «sezioni + documenti + azioni»: le sezioni sono le porte
 * della sidebar, la matrice documenti decide Consulta/Gestisci per famiglia
 * («Gestisci» implica «Consulta»), le azioni completano — con le sensibili
 * (costi d'acquisto in testa) evidenziate.
 */
@Component({
  selector: 'app-user-permissions-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HoverTooltipComponent],
  templateUrl: './user-permissions-editor.component.html',
  styleUrl: './user-permissions-editor.component.scss',
})
export class UserPermissionsEditorComponent {
  readonly role = input.required<UserRole>();
  readonly permissions = input.required<readonly TenantPermissionKey[]>();
  readonly compact = input<boolean>(false);

  readonly permissionsChange = output<readonly TenantPermissionKey[]>();

  protected readonly groupLabels = TENANT_PERMISSION_GROUP_LABELS;
  protected readonly familyLabels = DOCUMENT_FAMILY_LABELS;
  protected readonly families = DOCUMENT_PERMISSION_FAMILIES;

  protected readonly sectionDefinitions = TENANT_PERMISSION_DEFINITIONS.filter(
    (definition) => definition.group === 'sections',
  );

  /** Gruppi azioni, senza le sezioni (hanno il loro blocco) e senza le sensibili. */
  protected readonly actionGroups = (
    ['inventory', 'catalog', 'sales', 'reports', 'settings', 'customers'] as const
  )
    .map((group) => ({
      label: TENANT_PERMISSION_GROUP_LABELS[group],
      definitions: TENANT_PERMISSION_DEFINITIONS.filter(
        (definition) =>
          definition.group === group && !SENSITIVE_ACTION_PERMISSIONS.includes(definition.key),
      ),
    }))
    .filter((group) => group.definitions.length > 0);

  protected readonly sensitiveDefinitions = SENSITIVE_ACTION_PERMISSIONS.map((key) =>
    TENANT_PERMISSION_DEFINITIONS.find((definition) => definition.key === key),
  ).filter((definition): definition is (typeof TENANT_PERMISSION_DEFINITIONS)[number] =>
    Boolean(definition),
  );

  protected isOwnerRole(): boolean {
    return this.role() === UserRole.Owner;
  }

  protected isChecked(key: TenantPermissionKey): boolean {
    return this.permissions().includes(key);
  }

  protected familyHasManage(family: DocumentPermissionFamily): boolean {
    return !VIEW_ONLY_DOCUMENT_FAMILIES.includes(family);
  }

  protected familyViewChecked(family: DocumentPermissionFamily): boolean {
    // «Gestisci» implica «Consulta»: la casella riflette l'accesso effettivo.
    return this.isChecked(docViewPermission(family)) || this.isChecked(docManagePermission(family));
  }

  protected familyManageChecked(family: DocumentPermissionFamily): boolean {
    return this.isChecked(docManagePermission(family));
  }

  protected onToggle(key: TenantPermissionKey, checked: boolean): void {
    const current = new Set(this.permissions());
    if (checked) {
      current.add(key);
    } else {
      current.delete(key);
    }
    this.emit(current);
  }

  protected onFamilyViewToggle(family: DocumentPermissionFamily, checked: boolean): void {
    const current = new Set(this.permissions());
    if (checked) {
      current.add(docViewPermission(family));
    } else {
      // Togliere la consultazione toglie anche la gestione: non esiste
      // «gestisce ma non vede».
      current.delete(docViewPermission(family));
      current.delete(docManagePermission(family));
    }
    this.emit(current);
  }

  protected onFamilyManageToggle(family: DocumentPermissionFamily, checked: boolean): void {
    const current = new Set(this.permissions());
    if (checked) {
      current.add(docViewPermission(family));
      current.add(docManagePermission(family));
    } else {
      current.delete(docManagePermission(family));
    }
    this.emit(current);
  }

  protected resetToRoleDefaults(): void {
    this.permissionsChange.emit([...defaultPermissionsForRole(this.role())]);
  }

  private emit(keys: ReadonlySet<TenantPermissionKey>): void {
    this.permissionsChange.emit([...keys].filter(isTenantPermissionKey));
  }
}
