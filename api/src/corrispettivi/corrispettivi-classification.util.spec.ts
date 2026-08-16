import { SalesOrderSource as PrismaSource } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  ambitoOfSource,
  canaleOfSource,
  sourcesFor,
} from './corrispettivi-classification.util';

/**
 * Le due dimensioni del Registro (`11` §5).
 *
 * Sono test di **classificazione**, non di query: se sbaglia questa mappa, ogni
 * filtro a valle mente in modo coerente — che è il caso peggiore, perché il
 * numero torna sempre e non c'è niente di rosso.
 */
describe('classificazione del Registro Corrispettivi', () => {
  it('ogni origine ha un ambito e un canale, senza buchi', () => {
    for (const source of Object.values(PrismaSource)) {
      expect(ambitoOfSource(source)).toBeDefined();
      expect(canaleOfSource(source)).toBeDefined();
    }
  });

  it('classifica le tre vendite della specifica', () => {
    expect([
      ambitoOfSource(PrismaSource.store),
      canaleOfSource(PrismaSource.store),
    ]).toEqual(['fisico_pos', 'vestiflow']);

    expect([
      ambitoOfSource(PrismaSource.shopify_pos),
      canaleOfSource(PrismaSource.shopify_pos),
    ]).toEqual(['fisico_pos', 'shopify']);

    expect([
      ambitoOfSource(PrismaSource.shopify_online),
      canaleOfSource(PrismaSource.shopify_online),
    ]).toEqual(['online', 'shopify']);
  });

  it('«tutti + tutti» non filtra: nessuna origine viene esclusa', () => {
    // Se tornasse un elenco, un’origine aggiunta domani sparirebbe dal Registro
    // senza che nessuno lo chieda.
    expect(sourcesFor('all', 'all')).toBeUndefined();
    expect(sourcesFor(undefined, undefined)).toBeUndefined();
  });

  it('Fisico/POS + VestiFlow prende la Vendita al banco', () => {
    expect(sourcesFor('fisico_pos', 'vestiflow')).toContain(PrismaSource.store);
    expect(sourcesFor('fisico_pos', 'vestiflow')).not.toContain(PrismaSource.shopify_pos);
  });

  it('Fisico/POS + Shopify prende il POS Shopify e non la Vendita al banco', () => {
    expect(sourcesFor('fisico_pos', 'shopify')).toEqual([PrismaSource.shopify_pos]);
  });

  it('Online + Shopify prende il solo ecommerce', () => {
    expect(sourcesFor('online', 'shopify')).toEqual([PrismaSource.shopify_online]);
  });

  it('Canale Shopify con ambito libero prende ecommerce E POS', () => {
    // È la domanda che il vecchio filtro unico non sapeva porre: teneva fermo
    // l’ambito e non il canale.
    const sources = sourcesFor('all', 'shopify');
    expect(sources).toContain(PrismaSource.shopify_online);
    expect(sources).toContain(PrismaSource.shopify_pos);
    expect(sources).not.toContain(PrismaSource.store);
  });

  it('una combinazione senza vendite dà un insieme VUOTO, non tutto', () => {
    // Online + VestiFlow oggi non esiste. Un `undefined` qui mostrerebbe
    // l’intero registro: la risposta sbagliata alla domanda giusta.
    expect(sourcesFor('online', 'vestiflow')).toEqual([]);
  });
});
