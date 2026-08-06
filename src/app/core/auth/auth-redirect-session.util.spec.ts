import { describe, expect, it } from 'vitest';

import { parseAuthRedirectFlowType } from './auth-redirect-session.util';

describe('parseAuthRedirectFlowType', () => {
  it('riconosce invito e recupero password', () => {
    expect(parseAuthRedirectFlowType('invite')).toBe('invite');
    expect(parseAuthRedirectFlowType('recovery')).toBe('recovery');
    expect(parseAuthRedirectFlowType('signup')).toBe('unknown');
    expect(parseAuthRedirectFlowType(null)).toBeNull();
  });
});
