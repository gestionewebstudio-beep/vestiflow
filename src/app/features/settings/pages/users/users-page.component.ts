import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, of } from 'rxjs';

import { AuthService } from '@core/auth';
import { isAppError } from '@core/models/app-error.model';
import {
  defaultPermissionsForRole,
  type TenantPermissionKey,
} from '@core/models/tenant-permission.model';
import { UserRole } from '@core/models/user.model';
import { TENANT_USER_ROLE_LABELS } from '@core/models/user-role-labels.util';
import { resolveEffectivePermissions } from '@core/permissions/user-permissions.util';
import { isLicensedOperationalLocation } from '@core/utils/location-selection.util';
import { BackButtonComponent } from '@shared/components/back-button/back-button.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { InlineSpinnerComponent } from '@shared/components/inline-spinner/inline-spinner.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import { UserPermissionsEditorComponent } from '@domain/users/components/user-permissions-editor/user-permissions-editor.component';
import {
  tenantUserRequiresAssignedLocation,
  type TenantUser,
} from '@domain/users/models/tenant-user.model';
import { TenantUsersService } from '@domain/users/services/tenant-users.service';

/** Ruoli assegnabili dal titolare: il ruolo titolare resta all'assistenza Vestiflow. */
const ASSIGNABLE_ROLES = [UserRole.Admin, UserRole.Manager, UserRole.Clerk] as const;

/**
 * Impostazioni → Utenti (solo titolare): crea gli account dei dipendenti,
 * assegna ruoli, sedi e permessi. Gli invarianti veri (no self-edit, titolari
 * intoccabili, niente ruolo titolare) sono applicati dall'API; qui la UI li
 * rispecchia nascondendo le azioni non consentite.
 */
@Component({
  selector: 'app-settings-users-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    BackButtonComponent,
    ButtonComponent,
    ConfirmDialogComponent,
    ErrorStateComponent,
    InlineSpinnerComponent,
    SelectMenuComponent,
    TableSkeletonComponent,
    UserPermissionsEditorComponent,
  ],
  templateUrl: './users-page.component.html',
  styleUrl: './users-page.component.scss',
})
export class UsersPageComponent {
  private readonly tenantUsers = inject(TenantUsersService);
  private readonly operationalLocations = inject(OperationalLocationsService);
  private readonly authService = inject(AuthService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly UserRole = UserRole;
  protected readonly roleLabels = TENANT_USER_ROLE_LABELS;
  protected readonly roleOptions = ASSIGNABLE_ROLES.map((role) => ({
    value: role,
    label: TENANT_USER_ROLE_LABELS[role],
  }));

  protected readonly users = signal<readonly TenantUser[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly createLoading = signal(false);
  protected readonly createError = signal<string | null>(null);
  protected readonly createSuccess = signal(false);
  protected readonly rowSavingId = signal<string | null>(null);
  protected readonly rowDeletingId = signal<string | null>(null);
  protected readonly rowError = signal<string | null>(null);
  protected readonly deleteDialogOpen = signal(false);
  protected readonly userPendingDelete = signal<TenantUser | null>(null);
  protected readonly expandedPermissionsUserId = signal<string | null>(null);
  protected readonly createFormOpen = signal(false);
  protected readonly createPermissions = signal<readonly TenantPermissionKey[]>(
    defaultPermissionsForRole(UserRole.Clerk),
  );

  /** Sedi assegnabili: quelle licenziate e attive nel piano del negozio. */
  protected readonly locationOptions = computed(() =>
    this.operationalLocations
      .allTenantLocations()
      .filter(isLicensedOperationalLocation)
      .map((location) => ({ value: location.id, label: location.name })),
  );

  protected readonly hasActiveLocations = computed(() => this.locationOptions().length > 0);

  protected readonly createForm = this.fb.group({
    displayName: this.fb.control('', {
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(120)],
    }),
    email: this.fb.control('', { validators: [Validators.required, Validators.email] }),
    password: this.fb.control('', {
      validators: [Validators.required, Validators.minLength(8), Validators.maxLength(128)],
    }),
    role: this.fb.control<UserRole>(UserRole.Clerk, { validators: [Validators.required] }),
    hasAllLocationsAccess: this.fb.control(true),
    assignedLocationIds: this.fb.control<readonly string[]>([]),
    defaultLocationId: this.fb.control(''),
  });

  constructor() {
    this.loadUsers();
  }

  protected reload(): void {
    this.loadUsers();
  }

  protected isOwnerRole(role: UserRole): boolean {
    return role === UserRole.Owner;
  }

  /** Titolari e il proprio account sono read-only qui (invariante server-side). */
  protected canEditUser(user: TenantUser): boolean {
    if (this.isOwnerRole(user.role)) {
      return false;
    }
    return user.id !== this.authService.currentUser()?.id;
  }

  protected lockedRowHint(user: TenantUser): string {
    if (this.isOwnerRole(user.role)) {
      return 'Titolare — accesso completo. Si gestisce con l’assistenza Vestiflow.';
    }
    return 'Il tuo account: si gestisce dal profilo, non da questa pagina.';
  }

  protected createShowsAllLocationsToggle(): boolean {
    return this.createForm.controls.role.value === UserRole.Admin;
  }

  protected createRequiresLocation(): boolean {
    const role = this.createForm.controls.role.value;
    if (tenantUserRequiresAssignedLocation(role)) {
      return true;
    }
    return role === UserRole.Admin && !this.createForm.controls.hasAllLocationsAccess.value;
  }

  protected rowShowsAllLocationsToggle(role: UserRole): boolean {
    return role === UserRole.Admin;
  }

  protected rowRequiresLocation(user: TenantUser): boolean {
    if (tenantUserRequiresAssignedLocation(user.role)) {
      return true;
    }
    return user.role === UserRole.Admin && !user.hasAllLocationsAccess;
  }

  protected createDefaultLocationOptions(): readonly { value: string; label: string }[] {
    if (this.createUserHasFullLocationAccess()) {
      return this.locationOptions();
    }
    const assigned = new Set(this.createForm.controls.assignedLocationIds.value);
    return this.locationOptions().filter((option) => assigned.has(option.value));
  }

  private createUserHasFullLocationAccess(): boolean {
    const role = this.createForm.controls.role.value;
    return role === UserRole.Admin && this.createForm.controls.hasAllLocationsAccess.value;
  }

  /** Se la predefinita scelta non è più tra le opzioni valide, si azzera (mai forzarne un'altra). */
  private syncCreateDefaultLocation(): void {
    const current = this.createForm.controls.defaultLocationId.value;
    if (!current) {
      return;
    }
    const valid = this.createDefaultLocationOptions().some((option) => option.value === current);
    if (!valid) {
      this.createForm.controls.defaultLocationId.setValue('');
    }
  }

  protected rowDefaultLocationOptions(
    user: TenantUser,
  ): readonly { value: string; label: string }[] {
    if (user.role === UserRole.Admin && user.hasAllLocationsAccess) {
      return this.locationOptions();
    }
    const assigned = new Set(user.assignedLocationIds);
    return this.locationOptions().filter((option) => assigned.has(option.value));
  }

  protected deleteDialogMessage(): string {
    const user = this.userPendingDelete();
    if (!user) {
      return '';
    }
    return `Rimuoverai l'account di ${user.displayName} (${user.email}). L'accesso al gestionale verrà revocato e non potrà più accedere.`;
  }

  protected openDeleteDialog(user: TenantUser): void {
    if (!this.canEditUser(user) || this.rowDeletingId()) {
      return;
    }
    this.userPendingDelete.set(user);
    this.deleteDialogOpen.set(true);
  }

  protected confirmDeleteUser(): void {
    const user = this.userPendingDelete();
    if (!user || this.rowDeletingId()) {
      return;
    }

    this.rowDeletingId.set(user.id);
    this.rowError.set(null);

    this.tenantUsers
      .deleteUser(user.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.rowDeletingId.set(null);
          this.deleteDialogOpen.set(false);
          this.userPendingDelete.set(null);
          if (this.expandedPermissionsUserId() === user.id) {
            this.expandedPermissionsUserId.set(null);
          }
          this.users.update((rows) => rows.filter((row) => row.id !== user.id));
        },
        error: (err: unknown) => {
          this.rowDeletingId.set(null);
          this.rowError.set(isAppError(err) ? err.message : 'Eliminazione utente non riuscita.');
        },
      });
  }

  protected cancelDeleteUser(): void {
    this.userPendingDelete.set(null);
  }

  protected togglePermissionsPanel(userId: string): void {
    this.expandedPermissionsUserId.update((current) => (current === userId ? null : userId));
  }

  protected permissionsExpanded(userId: string): boolean {
    return this.expandedPermissionsUserId() === userId;
  }

  protected toggleCreateForm(): void {
    if (this.createFormOpen()) {
      this.closeCreateForm();
      return;
    }
    if (!this.hasActiveLocations()) {
      return;
    }
    this.createFormOpen.set(true);
    this.createError.set(null);
    this.createSuccess.set(false);
  }

  protected closeCreateForm(): void {
    this.createFormOpen.set(false);
    this.createError.set(null);
  }

  protected effectivePermissions(user: TenantUser): readonly TenantPermissionKey[] {
    return resolveEffectivePermissions({
      role: user.role,
      permissions: [...user.permissions],
    });
  }

  protected onCreateRoleSelect(value: string | null): void {
    if (!value || !this.isAssignableRole(value)) {
      return;
    }
    this.createForm.controls.role.setValue(value);
    this.createPermissions.set([...defaultPermissionsForRole(value)]);

    if (value === UserRole.Admin) {
      if (this.createForm.controls.hasAllLocationsAccess.value) {
        this.createForm.controls.assignedLocationIds.setValue([]);
      }
      this.syncCreateDefaultLocation();
      return;
    }
    this.createForm.controls.hasAllLocationsAccess.setValue(true);
    this.syncCreateDefaultLocation();
  }

  protected onCreateAllLocationsAccessToggle(checked: boolean): void {
    this.createForm.controls.hasAllLocationsAccess.setValue(checked);
    if (checked) {
      this.createForm.controls.assignedLocationIds.setValue([]);
    }
    this.syncCreateDefaultLocation();
  }

  protected onCreateLocationsSelect(values: readonly string[]): void {
    this.createForm.controls.assignedLocationIds.setValue([...values]);
    this.syncCreateDefaultLocation();
  }

  protected onCreateDefaultLocationSelect(value: string | null): void {
    this.createForm.controls.defaultLocationId.setValue(value ?? '');
  }

  protected onCreatePermissionsChange(permissions: readonly TenantPermissionKey[]): void {
    this.createPermissions.set(permissions);
  }

  protected onRowRoleSelect(user: TenantUser, value: string | null): void {
    if (!value || !this.isAssignableRole(value)) {
      return;
    }
    this.saveUser(user, {
      role: value,
      permissions: [...defaultPermissionsForRole(value)],
    });
  }

  protected onRowAllLocationsAccessToggle(user: TenantUser, checked: boolean): void {
    this.saveUser(user, {
      hasAllLocationsAccess: checked,
      assignedLocationIds: checked ? [] : [...user.assignedLocationIds],
    });
  }

  protected onRowLocationsSelect(user: TenantUser, values: readonly string[]): void {
    this.saveUser(user, { assignedLocationIds: [...values] });
  }

  protected onRowDefaultLocationSelect(user: TenantUser, value: string | null): void {
    const next = value || null;
    if (next === user.defaultLocationId) {
      return;
    }
    this.saveUser(user, { defaultLocationId: next });
  }

  protected onRowActiveToggle(user: TenantUser, checked: boolean): void {
    this.saveUser(user, { isActive: checked });
  }

  protected onRowPermissionsChange(
    user: TenantUser,
    permissions: readonly TenantPermissionKey[],
  ): void {
    this.saveUser(user, { permissions: [...permissions] });
  }

  protected submitCreate(): void {
    this.createForm.markAllAsTouched();
    if (this.createForm.invalid || this.createLoading()) {
      return;
    }

    const raw = this.createForm.getRawValue();
    const requiresLocations = this.createRequiresLocation();
    if (requiresLocations && raw.assignedLocationIds.length === 0) {
      this.createError.set('Seleziona almeno una sede operativa.');
      return;
    }

    this.createLoading.set(true);
    this.createError.set(null);
    this.createSuccess.set(false);

    this.tenantUsers
      .createUser({
        displayName: raw.displayName.trim(),
        email: raw.email.trim(),
        password: raw.password,
        role: raw.role,
        ...(raw.defaultLocationId ? { defaultLocationId: raw.defaultLocationId } : {}),
        hasAllLocationsAccess: raw.role === UserRole.Admin ? raw.hasAllLocationsAccess : false,
        assignedLocationIds: requiresLocations ? [...raw.assignedLocationIds] : [],
        permissions: [...this.createPermissions()],
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.createLoading.set(false);
          this.createSuccess.set(true);
          this.createFormOpen.set(false);
          this.createPermissions.set(defaultPermissionsForRole(UserRole.Clerk));
          this.createForm.reset({
            displayName: '',
            email: '',
            password: '',
            role: UserRole.Clerk,
            hasAllLocationsAccess: true,
            assignedLocationIds: [],
            defaultLocationId: '',
          });
          this.loadUsers();
        },
        error: (err: unknown) => {
          this.createLoading.set(false);
          this.createError.set(isAppError(err) ? err.message : 'Creazione utente non riuscita.');
        },
      });
  }

  private saveUser(
    user: TenantUser,
    patch: {
      role?: UserRole;
      hasAllLocationsAccess?: boolean;
      assignedLocationIds?: readonly string[];
      defaultLocationId?: string | null;
      isActive?: boolean;
      permissions?: readonly TenantPermissionKey[];
    },
  ): void {
    if (!this.canEditUser(user) || this.rowSavingId()) {
      return;
    }
    this.rowSavingId.set(user.id);
    this.rowError.set(null);

    this.tenantUsers
      .updateUser(user.id, patch)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.rowSavingId.set(null);
          this.users.update((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
        },
        error: (err: unknown) => {
          this.rowSavingId.set(null);
          this.rowError.set(isAppError(err) ? err.message : 'Salvataggio non riuscito.');
        },
      });
  }

  private loadUsers(): void {
    this.loading.set(true);
    this.loadError.set(false);

    this.tenantUsers
      .listUsers()
      .pipe(
        catchError(() => {
          this.loadError.set(true);
          return of([] as readonly TenantUser[]);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((rows) => {
        this.users.set(rows);
        this.loading.set(false);
      });
  }

  private isAssignableRole(value: string): value is (typeof ASSIGNABLE_ROLES)[number] {
    return (ASSIGNABLE_ROLES as readonly string[]).includes(value);
  }
}
