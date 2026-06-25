export interface LocationSelectionLockState {
  readonly locationSelectionLocked: boolean;
  readonly locationSelectionChangeGranted: boolean;
}

/** Il tenant può salvare una nuova selezione sedi (prima config o sblocco admin). */
export function canChangeLicensedLocationSelection(state: LocationSelectionLockState): boolean {
  return !state.locationSelectionLocked || state.locationSelectionChangeGranted;
}

export function shouldShowLocationSelectionLockedMessage(
  state: LocationSelectionLockState,
): boolean {
  return state.locationSelectionLocked && !state.locationSelectionChangeGranted;
}

export function shouldShowLocationSelectionGrantedHint(state: LocationSelectionLockState): boolean {
  return state.locationSelectionChangeGranted;
}
