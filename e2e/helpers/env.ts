export interface E2eCredentials {
  readonly email: string;
  readonly password: string;
  readonly mfaCode?: string;
}

export function hasE2eCredentials(): boolean {
  return Boolean(process.env.E2E_USER_EMAIL?.trim() && process.env.E2E_USER_PASSWORD?.trim());
}

export function hasE2eClerkCredentials(): boolean {
  return Boolean(process.env.E2E_CLERK_EMAIL?.trim() && process.env.E2E_CLERK_PASSWORD?.trim());
}

export function e2eCredentials(): E2eCredentials {
  const email = process.env.E2E_USER_EMAIL?.trim();
  const password = process.env.E2E_USER_PASSWORD?.trim();

  if (!email || !password) {
    throw new Error('E2E_USER_EMAIL and E2E_USER_PASSWORD are required for authenticated tests.');
  }

  return {
    email,
    password,
    mfaCode: process.env.E2E_MFA_CODE?.trim(),
  };
}

export function e2eClerkCredentials(): E2eCredentials {
  const email = process.env.E2E_CLERK_EMAIL?.trim();
  const password = process.env.E2E_CLERK_PASSWORD?.trim();

  if (!email || !password) {
    throw new Error(
      'E2E_CLERK_EMAIL and E2E_CLERK_PASSWORD are required for clerk permission tests.',
    );
  }

  return {
    email,
    password,
    mfaCode: process.env.E2E_CLERK_MFA_CODE?.trim() || process.env.E2E_MFA_CODE?.trim(),
  };
}
