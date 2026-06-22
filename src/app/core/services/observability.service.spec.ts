import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_CONFIG } from '@core/config/app-config.token';

import { ObservabilityService } from './observability.service';

describe('ObservabilityService', () => {
  let service: ObservabilityService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ObservabilityService,
        { provide: APP_CONFIG, useValue: { production: false, apiBaseUrl: '' } },
      ],
    });
    service = TestBed.inject(ObservabilityService);
  });

  it('captureException logga su console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    service.captureException(new Error('boom'), { route: '/products' });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('captureMessage debug viene ignorato in produzione', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        ObservabilityService,
        { provide: APP_CONFIG, useValue: { production: true, apiBaseUrl: '' } },
      ],
    });
    const prodService = TestBed.inject(ObservabilityService);
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    prodService.captureMessage('debug msg', 'debug');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('trackEvent logga nome evento', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    service.trackEvent('login_success');
    expect(spy).toHaveBeenCalledWith('[observability] event: login_success', {});
    spy.mockRestore();
  });
});
