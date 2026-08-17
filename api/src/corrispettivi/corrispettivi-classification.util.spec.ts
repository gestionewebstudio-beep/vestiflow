import { SalesOrderSource as PrismaSource } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  CORRISPETTIVI_SOURCES,
  classificationOfSource,
  isCorrispettivoSource,
  sourcesFor,
} from './corrispettivi-classification.util';

/**
 * Le due domande del Registro, **in quest'ordine**: chi entra, e poi come si
 * classifica. Sono test di classificazione, non di query: se sbaglia questa
 * mappa, ogni filtro a valle mente **in modo coerente** — il caso peggiore,
 * perché il numero torna sempre e non c'è niente di rosso.
 */
describe('classificazione del Registro Corrispettivi', () => {
  describe('prima domanda: questo evento è un corrispettivo?', () => {
    it("l'Ordine cliente manuale NON è un corrispettivo", () => {
      // È un impegno commerciale: si prende al telefono, in ufficio, per email,
      // e non dice niente su come avverrà la vendita. L'effetto economico
      // arriva dal documento che lo conclude, non dalla sua origine.
      expect(isCorrispettivoSource(PrismaSource.manual)).toBe(false);
      expect(classificationOfSource(PrismaSource.manual)).toBeNull();
      expect(CORRISPETTIVI_SOURCES).not.toContain(PrismaSource.manual);
    });

    it('le tre vendite vere lo sono', () => {
      for (const source of [
        PrismaSource.shopify_online,
        PrismaSource.shopify_pos,
        PrismaSource.store,
      ]) {
        expect(isCorrispettivoSource(source)).toBe(true);
      }
    });

    it('ogni origine ha una decisione esplicita, nessuna dimenticata', () => {
      // Il Record è esaustivo: un valore nuovo non compila finché qualcuno non
      // dichiara se entra e con quale classificazione, oppure che non entra.
      for (const source of Object.values(PrismaSource)) {
        expect(classificationOfSource(source)).not.toBeUndefined();
      }
    });
  });

  describe('seconda domanda: ambito e canale delle righe ammesse', () => {
    it('classifica le tre vendite della specifica', () => {
      expect(classificationOfSource(PrismaSource.store)).toEqual({
        ambito: 'fisico_pos',
        canale: 'vestiflow',
      });
      expect(classificationOfSource(PrismaSource.shopify_pos)).toEqual({
        ambito: 'fisico_pos',
        canale: 'shopify',
      });
      expect(classificationOfSource(PrismaSource.shopify_online)).toEqual({
        ambito: 'online',
        canale: 'shopify',
      });
    });
  });

  describe('selezione delle origini', () => {
    it('«tutti + tutti» filtra comunque: scarta ciò che non è un corrispettivo', () => {
      // ⚠️ Prima tornava `undefined` per «non restringere», e con quella forma
      // gli ordini manuali entravano: due, per 229,36 €.
      const sources = sourcesFor('all', 'all');
      expect(sources).not.toContain(PrismaSource.manual);
      expect(sources).toEqual([...CORRISPETTIVI_SOURCES]);
      expect(sourcesFor(undefined, undefined)).toEqual([...CORRISPETTIVI_SOURCES]);
    });

    it('Fisico/POS + VestiFlow prende la sola Vendita al banco', () => {
      expect(sourcesFor('fisico_pos', 'vestiflow')).toEqual([PrismaSource.store]);
    });

    it('Fisico/POS + Shopify prende il solo POS Shopify', () => {
      expect(sourcesFor('fisico_pos', 'shopify')).toEqual([PrismaSource.shopify_pos]);
    });

    it('Online + Shopify prende il solo ecommerce', () => {
      expect(sourcesFor('online', 'shopify')).toEqual([PrismaSource.shopify_online]);
    });

    it('Canale Shopify con ambito libero prende ecommerce E POS', () => {
      // È la domanda che il vecchio filtro unico non sapeva porre: teneva fermo
      // l'ambito e non il canale.
      const sources = sourcesFor('all', 'shopify');
      expect(sources).toContain(PrismaSource.shopify_online);
      expect(sources).toContain(PrismaSource.shopify_pos);
      expect(sources).not.toContain(PrismaSource.store);
    });

    it('Fisico/POS senza canale prende entrambe le vendite fisiche', () => {
      const sources = sourcesFor('fisico_pos', 'all');
      expect(sources).toContain(PrismaSource.shopify_pos);
      expect(sources).toContain(PrismaSource.store);
      expect(sources).not.toContain(PrismaSource.manual);
    });

    it('una combinazione senza vendite dà un insieme VUOTO, non tutto', () => {
      // Online + VestiFlow oggi non esiste. Mostrare tutto sarebbe la risposta
      // sbagliata alla domanda giusta.
      expect(sourcesFor('online', 'vestiflow')).toEqual([]);
    });

    it('«Tutti» è davvero Online + Fisico/POS, sul dataset dei corrispettivi', () => {
      // La matematica del filtro deve tornare sull'insieme AMMESSO, non su
      // tutti i valori possibili di SalesOrderSource: è ciò che permette a
      // `manual` di restare fuori senza rompere l'asse.
      const tutti = sourcesFor('all', 'all').slice().sort();
      const somma = [...sourcesFor('online', 'all'), ...sourcesFor('fisico_pos', 'all')].sort();
      expect(somma).toEqual(tutti);
    });
  });
});
