export interface ActiveSupportSessionContext {
  readonly sessionId: string;
  readonly targetTenantId: string;
  readonly targetTenantName: string;
  readonly expiresAt: string;
}
