import { describe, expect, it, vi } from 'vitest';

import { ToastService } from './toast.service';

describe('ToastService', () => {
  it('accoda e rimuove un toast di errore', () => {
    vi.useFakeTimers();
    const service = new ToastService();

    service.showError('Errore di rete');
    expect(service.toasts()).toHaveLength(1);
    expect(service.toasts()[0]?.message).toBe('Errore di rete');

    service.dismiss(service.toasts()[0]!.id);
    expect(service.toasts()).toHaveLength(0);

    vi.useRealTimers();
  });

  it('ignora messaggi vuoti', () => {
    const service = new ToastService();
    service.showInfo('   ');
    expect(service.toasts()).toHaveLength(0);
  });
});
