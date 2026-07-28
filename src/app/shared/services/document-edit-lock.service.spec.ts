import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { DocumentEditLockService } from './document-edit-lock.service';

describe('DocumentEditLockService', () => {
  let lock: DocumentEditLockService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [DocumentEditLockService] });
    lock = TestBed.inject(DocumentEditLockService);
  });

  it('una bozza è sempre sbloccata', () => {
    lock.syncOnLoad('doc-draft', false);
    expect(lock.unlocked()).toBe(true);
  });

  it('un confermato mai sbloccato si apre bloccato', () => {
    lock.syncOnLoad('doc-conf-a', true);
    expect(lock.unlocked()).toBe(false);
  });

  it('lo sblocco esplicito rende modificabile', () => {
    lock.syncOnLoad('doc-conf-b', true);
    expect(lock.unlocked()).toBe(false);

    lock.unlock('doc-conf-b');
    expect(lock.unlocked()).toBe(true);
  });

  it('lo sblocco resta valido riaprendo lo stesso documento nella sessione', () => {
    lock.unlock('doc-conf-c');
    // Riapertura del medesimo documento: la sessione ricorda lo sblocco.
    lock.syncOnLoad('doc-conf-c', true);
    expect(lock.unlocked()).toBe(true);
  });
});
