import { describe, expect, it } from 'vitest';

import { userInitials } from './user-initials.util';

describe('userInitials', () => {
  it('usa prima e ultima iniziale del display name', () => {
    expect(userInitials('Mario Rossi', 'mario@example.com')).toBe('MR');
  });

  it('usa solo prima iniziale con nome singolo', () => {
    expect(userInitials('Mario', 'mario@example.com')).toBe('M');
  });

  it('fallback sulla email se display name vuoto', () => {
    expect(userInitials('  ', 'admin@vestiflow.it')).toBe('A');
  });
});
