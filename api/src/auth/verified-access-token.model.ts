/** JWT Supabase verificato: identità Auth + livello di assurance MFA. */
export interface VerifiedAccessToken {
  readonly authUserId: string;
  readonly assuranceLevel: 'aal1' | 'aal2';
}
