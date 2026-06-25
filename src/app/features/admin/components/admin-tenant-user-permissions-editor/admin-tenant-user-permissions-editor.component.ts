import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { UserRole } from '@core/models/user.model';
import {
  TENANT_PERMISSION_DEFINITIONS,
  TENANT_PERMISSION_GROUP_LABELS,
  defaultPermissionsForRole,
  isTenantPermissionKey,
  type TenantPermissionKey,
} from '@core/models/tenant-permission.model';
import { HoverTooltipComponent } from '@shared/components/hover-tooltip/hover-tooltip.component';

@Component({
  selector: 'app-admin-tenant-user-permissions-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HoverTooltipComponent],
  templateUrl: './admin-tenant-user-permissions-editor.component.html',
  styleUrl: './admin-tenant-user-permissions-editor.component.scss',
})
export class AdminTenantUserPermissionsEditorComponent {
  readonly role = input.required<UserRole>();
  readonly permissions = input.required<readonly TenantPermissionKey[]>();
  readonly compact = input<boolean>(false);

  readonly permissionsChange = output<readonly TenantPermissionKey[]>();

  protected readonly groupLabels = TENANT_PERMISSION_GROUP_LABELS;

  protected readonly permissionGroups = [
    'inventory',
    'catalog',
    'orders',
    'reports',
    'settings',
    'customers',
  ] as const;

  protected definitionsForGroup(
    group: (typeof this.permissionGroups)[number],
  ): typeof TENANT_PERMISSION_DEFINITIONS {
    return TENANT_PERMISSION_DEFINITIONS.filter((definition) => definition.group === group);
  }

  protected isOwnerRole(): boolean {
    return this.role() === UserRole.Owner;
  }

  protected isChecked(key: TenantPermissionKey): boolean {
    return this.permissions().includes(key);
  }

  protected onToggle(key: TenantPermissionKey, checked: boolean): void {
    const current = new Set(this.permissions());
    if (checked) {
      current.add(key);
    } else {
      current.delete(key);
    }
    this.permissionsChange.emit([...current].filter(isTenantPermissionKey));
  }

  protected resetToRoleDefaults(): void {
    this.permissionsChange.emit([...defaultPermissionsForRole(this.role())]);
  }
}
