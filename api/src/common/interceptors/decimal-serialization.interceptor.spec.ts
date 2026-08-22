import { Prisma } from '@prisma/client';
import { of, lastValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';

import type { CallHandler, ExecutionContext } from '@nestjs/common';

import {
  DecimalSerializationInterceptor,
  normalizeDecimals,
} from './decimal-serialization.interceptor';

/**
 * ⛔ **La verifica che conta è su `JSON.stringify`, non sul tipo TypeScript.**
 * Il difetto nasce proprio perché il compilatore non vede la serializzazione: un
 * `Prisma.Decimal` ha `toJSON()` che restituisce una stringa, e il tipo di
 * ritorno di un controller è inferito. Asserire `typeof === 'number'` sul valore
 * in memoria non basterebbe — bisogna guardare il JSON che esce davvero.
 */
describe('DecimalSerializationInterceptor', () => {
  const dec = (v: string) => new Prisma.Decimal(v);
  const jsonDi = (v: unknown) => JSON.parse(JSON.stringify(v));

  describe('⛔ il difetto, dimostrato prima di correggerlo', () => {
    it('un Decimal grezzo si serializza come STRINGA', () => {
      // È lo stato di partenza, e va inchiodato: se un giorno Prisma cambiasse
      // comportamento, questo test lo direbbe invece di lasciarci un
      // interceptor che non serve più a niente.
      expect(jsonDi({ prezzo: dec('2049.1803') })).toEqual({ prezzo: '2049.1803' });
      expect(typeof jsonDi({ prezzo: dec('2049.1803') }).prezzo).toBe('string');
    });
  });

  describe('⭐ dopo la normalizzazione è un numero JSON', () => {
    it('il campo esce come number, non come string', () => {
      const out = jsonDi(normalizeDecimals({ prezzo: dec('2049.1803') }));

      expect(out).toEqual({ prezzo: 2049.1803 });
      expect(typeof out.prezzo).toBe('number');
    });

    it('e il VALORE non cambia: la coda sopravvive intatta', () => {
      // Il netto esatto di 25,00 ivati al 22%, che è il caso che ha originato
      // tutto il lavoro sulla precisione.
      const out = jsonDi(normalizeDecimals({ netto: dec('2049.1803') }));

      expect(out.netto).toBe(2049.1803);
      // ⭐ Il giro torna allo stesso CENTESIMO, che è il requisito — non allo
      // stesso micro-centesimo, che nessuno guarda. 2500/1,22 vale
      // 2049,18032786…: conservandone quattro cifre di centesimo, il ritorno
      // ivato dà 2499,999966, e al centesimo è di nuovo 2500,00.
      expect(Math.round(out.netto * 1.22)).toBe(2500);
      // ⛔ E che la coda serva NON è un'opinione: misurato il 22/08/2026 su
      // tutti i prezzi ivati da 1,00 a 200,00 EUR al 22%, arrotondare il netto
      // all'intero perde un centesimo nel **18,0%** dei casi (3589 su 19901) —
      // «un prezzo su cinque», come dice `regole-gestionale`. Con quattro cifre
      // di centesimo: **zero**.
      //
      // Un caso vero fra quelli, il primo: 1,03 EUR ivato.
      const nettoIntero = Math.round(103 / 1.22); // 84 centesimi
      expect(Math.round(nettoIntero * 1.22)).toBe(102); // ⛔ torna 1,02, non 1,03

      const nettoConCoda = Math.round((103 / 1.22) * 10000) / 10000; // 84,4262
      expect(Math.round(nettoConCoda * 1.22)).toBe(103); // ⭐ torna 1,03
    });

    it('anche annidato in oggetti e array', () => {
      const risposta = {
        id: 'doc-1',
        totale: dec('12345'),
        righe: [
          { sku: 'A', prezzo: dec('2049.1803'), sconto: dec('13.6') },
          { sku: 'B', prezzo: dec('999.5'), sconto: dec('0') },
        ],
        annidato: { profondo: { valore: dec('1.0001') } },
      };

      const out = jsonDi(normalizeDecimals(risposta));

      expect(out.totale).toBe(12345);
      expect(out.righe[0].prezzo).toBe(2049.1803);
      expect(out.righe[0].sconto).toBe(13.6);
      expect(out.righe[1].prezzo).toBe(999.5);
      expect(out.annidato.profondo.valore).toBe(1.0001);
      for (const riga of out.righe) {
        expect(typeof riga.prezzo).toBe('number');
        expect(typeof riga.sconto).toBe('number');
      }
    });

    it('passa dall’interceptor come da una risposta vera', async () => {
      const interceptor = new DecimalSerializationInterceptor();
      const handler = { handle: () => of({ prezzo: dec('2049.1803') }) } as CallHandler;

      const out = await lastValueFrom(
        interceptor.intercept({} as ExecutionContext, handler),
      );

      expect(jsonDi(out)).toEqual({ prezzo: 2049.1803 });
    });
  });

  describe('⛔ ciò che NON deve toccare', () => {
    it('le date restano date', () => {
      const quando = new Date('2026-08-22T10:00:00.000Z');
      const out = normalizeDecimals({ createdAt: quando });

      expect(out.createdAt).toBe(quando);
      expect(jsonDi(out).createdAt).toBe('2026-08-22T10:00:00.000Z');
    });

    it('⛔ un Buffer non diventa un array di byte', () => {
      // Sarebbe il difetto peggiore: una stampa PDF servita come `{"0":37,...}`.
      const pdf = Buffer.from('%PDF-1.4');
      const out = normalizeDecimals({ file: pdf });

      expect(out.file).toBe(pdf);
      expect(Buffer.isBuffer(out.file)).toBe(true);
    });

    it('null, undefined e primitivi passano intatti', () => {
      const dentro = { a: null, b: undefined, c: 'testo', d: 42, e: true };

      expect(normalizeDecimals(dentro)).toEqual(dentro);
    });

    it('⭐ senza Decimal restituisce l’oggetto ORIGINALE, non una copia', () => {
      // Attraversare ricopiando ogni risposta costerebbe su elenchi da centinaia
      // di righe: è il genere di costo che si nota solo in produzione.
      const risposta = { id: 'x', righe: [{ sku: 'A', qta: 3 }] };

      expect(normalizeDecimals(risposta)).toBe(risposta);
    });

    it('un ciclo non manda in ricorsione infinita', () => {
      const a: Record<string, unknown> = { nome: 'a' };
      a.se_stesso = a;

      expect(() => normalizeDecimals(a)).not.toThrow();
    });
  });

  describe('⛔ i limiti REALI dei campi VestiFlow, non quelli teorici', () => {
    it('il massimo di NUMERIC(16,6) perde l’ultima cifra di micro-centesimo', () => {
      // 9.999.999.999,999999 centesimi = 100 milioni di EUR su un valore
      // UNITARIO: fuori da qualunque dominio reale. Ma il limite va conosciuto,
      // e va conosciuto qui invece che scoperto un giorno in un totale.
      const estremo = dec('9999999999.999999');

      // ⚠️ Il confronto va fatto sulla STRINGA: il letterale JS
      // `9999999999.999999` è già arrotondato al double più vicino dal parser,
      // quindi confrontarlo col risultato darebbe uguaglianza e nasconderebbe
      // proprio la perdita che si vuole misurare.
      expect(String(estremo.toNumber())).toBe('9999999999.999998');
      expect(estremo.toFixed(6)).toBe('9999999999.999999');
    });

    it('⭐ al CONTRATTO (4 decimali) lo stesso estremo è esatto', () => {
      // È la misura che conta: il contratto conserva 4 cifre di centesimo, non
      // sei. Con quattro, anche il massimo della colonna sopravvive al giro.
      const estremo = dec('9999999999.9999');
      const tornato = estremo.toNumber();

      expect(Math.round(tornato * 10000) / 10000).toBe(9999999999.9999);
      expect(new Prisma.Decimal(tornato).toFixed(4)).toBe('9999999999.9999');
    });

    it('⭐ e un importo da gestionale vero passa senza avvicinarsi al limite', () => {
      // Un capo da 2.500 EUR ivato: 204.918,0328 centesimi netti.
      const netto = dec('204918.0328');

      expect(netto.toNumber()).toBe(204918.0328);
      expect(new Prisma.Decimal(netto.toNumber()).equals(netto)).toBe(true);
    });
  });
});
