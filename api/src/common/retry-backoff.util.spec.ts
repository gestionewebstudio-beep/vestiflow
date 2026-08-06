import { describe, expect, it, vi } from 'vitest';

import { retryWithBackoff } from './retry-backoff.util';

describe('retryWithBackoff', () => {
  it('successo al primo colpo: nessun retry, nessuna attesa', async () => {
    const operation = vi.fn().mockResolvedValue('ok');
    const onRetry = vi.fn();
    await expect(retryWithBackoff(operation, { delaysMs: [1, 1], onRetry })).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('fallimenti transitori: riprova e alla fine riesce, notificando ogni retry', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('rete giù'))
      .mockRejectedValueOnce(new Error('ancora giù'))
      .mockResolvedValue('ok');
    const onRetry = vi.fn();
    await expect(retryWithBackoff(operation, { delaysMs: [1, 1, 1], onRetry })).resolves.toBe(
      'ok',
    );
    expect(operation).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenNthCalledWith(1, 1, expect.any(Error));
  });

  it('attese esaurite: rilancia l’ULTIMO errore', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('sempre giù'));
    await expect(retryWithBackoff(operation, { delaysMs: [1] })).rejects.toThrowError(
      'sempre giù',
    );
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('nessuna attesa configurata: un solo tentativo', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(retryWithBackoff(operation, { delaysMs: [] })).rejects.toThrowError('boom');
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
