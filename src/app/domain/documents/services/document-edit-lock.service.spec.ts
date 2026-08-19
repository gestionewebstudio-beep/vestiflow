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

  // ── L'istanza che eredita uno sblocco lo ADOTTA ───────────────────────────
  //
  // Il passaggio new → /:id/edit distrugge la maschera e ne ricrea un'altra:
  // la seconda istanza eredita lo sblocco dal set di sessione. Se si limitasse
  // a leggerlo, nessuno lo rilascerebbe piu' all'uscita e l'id resterebbe nel
  // set per sempre — da li' in poi quel documento non si sarebbe mai piu'
  // riaperto protetto. E' il difetto che ha fatto sembrare il blocco «non
  // agganciato»: funzionava la prima volta e mai piu'.
  it('un documento riaperto dopo la chiusura torna protetto', () => {
    // Prima istanza: sblocca e poi esce (destroy del TestBed).
    lock.unlock('doc-f');
    expect(lock.unlocked()).toBe(true);
    TestBed.resetTestingModule();

    // Seconda istanza, stessa sessione: il documento e' di nuovo protetto.
    TestBed.configureTestingModule({ providers: [DocumentEditLockService] });
    const secondo = TestBed.inject(DocumentEditLockService);
    secondo.syncOnLoad('doc-f');
    expect(secondo.unlocked()).toBe(false);
  });

  it('l’istanza che eredita lo sblocco lo rilascia alla propria uscita', () => {
    // Prima istanza: sblocca e conserva attraverso il cambio di rotta.
    lock.unlock('doc-g');
    lock.preserveAcrossReload();
    TestBed.resetTestingModule();

    // Seconda istanza (rotta nuova): eredita lo sblocco e lo adotta.
    TestBed.configureTestingModule({ providers: [DocumentEditLockService] });
    const seconda = TestBed.inject(DocumentEditLockService);
    seconda.syncOnLoad('doc-g');
    expect(seconda.unlocked()).toBe(true);
    TestBed.resetTestingModule();

    // Terza istanza: la seconda ha rilasciato uscendo, quindi torna protetto.
    TestBed.configureTestingModule({ providers: [DocumentEditLockService] });
    const terza = TestBed.inject(DocumentEditLockService);
    terza.syncOnLoad('doc-g');
    expect(terza.unlocked()).toBe(false);
  });
});
