import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { DocumentEditLockService } from './document-edit-lock.service';

describe('DocumentEditLockService', () => {
  let lock: DocumentEditLockService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [DocumentEditLockService] });
    lock = TestBed.inject(DocumentEditLockService);
  });

  // La regola è una frase sola, uguale per ogni tipo documento: un documento
  // che si riapre nasce bloccato. Non c'è più il ramo «se è bozza è sbloccato»,
  // che era la complicazione da cui nascevano le differenze fra le maschere.
  it('un documento riaperto si apre bloccato', () => {
    lock.syncOnLoad('doc-a');
    expect(lock.unlocked()).toBe(false);
  });

  it('senza id non ha nulla da sbloccare', () => {
    lock.syncOnLoad(null);
    expect(lock.unlocked()).toBe(false);
  });

  it('lo sblocco esplicito rende modificabile', () => {
    lock.syncOnLoad('doc-b');
    expect(lock.unlocked()).toBe(false);

    lock.unlock('doc-b');
    expect(lock.unlocked()).toBe(true);
  });

  it('lo sblocco resta valido riaprendo lo stesso documento nella sessione', () => {
    lock.unlock('doc-c');
    // Riapertura del medesimo documento: la sessione ricorda lo sblocco.
    lock.syncOnLoad('doc-c');
    expect(lock.unlocked()).toBe(true);
  });

  it('lo sblocco di un documento non vale per un altro', () => {
    lock.unlock('doc-d');
    lock.syncOnLoad('doc-e');
    expect(lock.unlocked()).toBe(false);
  });
});
