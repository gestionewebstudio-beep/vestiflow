import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let service: ThemeService;
  let doc: Document;

  beforeEach(() => {
    const storage = new Map<string, string>();

    doc = document.implementation.createHTMLDocument('test');
    Object.defineProperty(doc, 'defaultView', {
      value: {
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => storage.set(key, value),
        },
        matchMedia: () => ({ matches: false, addEventListener: vi.fn() }),
      },
      configurable: true,
    });

    TestBed.configureTestingModule({
      providers: [ThemeService, { provide: DOCUMENT, useValue: doc }],
    });
    service = TestBed.inject(ThemeService);
    TestBed.flushEffects();
  });

  it('applica data-theme light di default al primo avvio (light-first)', () => {
    expect(service.mode()).toBe('light');
    expect(service.resolvedTheme()).toBe('light');
    expect(doc.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('setMode dark aggiorna resolvedTheme e data-theme', () => {
    service.setMode('dark');
    TestBed.flushEffects();
    expect(service.resolvedTheme()).toBe('dark');
    expect(doc.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('toggle alterna tra light e dark', () => {
    service.setMode('light');
    service.toggle();
    expect(service.resolvedTheme()).toBe('dark');
    service.toggle();
    expect(service.resolvedTheme()).toBe('light');
  });
});
