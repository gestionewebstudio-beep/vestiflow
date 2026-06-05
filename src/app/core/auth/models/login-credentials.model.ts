/** Payload di login prodotto dalla form e consumato dall'AuthGateway. */
export interface LoginCredentials {
  readonly email: string;
  readonly password: string;
}
