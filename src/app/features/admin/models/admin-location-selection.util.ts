export interface AdminLocationSelectionState {
  readonly locationSelectionLocked: boolean;
  readonly locationSelectionChangeGranted: boolean;
}

export function resolveAdminLocationSelectionStatusLabel(
  state: AdminLocationSelectionState,
): string {
  if (state.locationSelectionChangeGranted) {
    return 'Cambio sede concesso — in attesa che il cliente salvi in Impostazioni.';
  }
  if (state.locationSelectionLocked) {
    return '';
  }
  return 'Il cliente può ancora scegliere le sedi attive (prima configurazione).';
}

export function canAdminGrantLocationSelectionChange(state: AdminLocationSelectionState): boolean {
  return state.locationSelectionLocked && !state.locationSelectionChangeGranted;
}
