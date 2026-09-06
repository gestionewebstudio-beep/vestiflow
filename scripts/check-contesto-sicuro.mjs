#!/usr/bin/env node
/**
 * ⛔ **LE API DA CONTESTO SICURO NON ESISTONO SU `http://192.168.…`**, e
 * VestiFlow ci si apre: è il gestionale che sta in mano a chi è in magazzino.
 *
 * Misurato in Chrome il 01/09/2026, sulla build di questa applicazione:
 *
 * ```text
 * http://127.0.0.1:4212      isSecureContext true    crypto.randomUUID  function
 * http://192.168.1.50:4212   isSecureContext FALSE   crypto.randomUUID  undefined
 * ```
 *
 * ⛔ **Non restituiscono un valore sbagliato: LANCIANO.** E se la chiamata sta
 * dentro un'azione sincrona — «Concludi vendita» genera l'intento di creazione
 * prima di partire — l'eccezione non la raccoglie nessun gestore d'errore: a
 * chi preme sembra che non succeda niente. È la segnalazione «la nuova vendita
 * al banco non si salva» del 30/08/2026.
 *
 * ⚠️ **Nessun test lo prende**, e non per svista: jsdom e Chrome headless su
 * `localhost` sono ENTRAMBI contesti sicuri. Il difetto esiste solo dove
 * l'applicazione viene usata davvero, e lì non gira nessuna suite.
 *
 * Le alternative, quando servono:
 *
 * | invece di            | si usa                                    |
 * | -------------------- | ----------------------------------------- |
 * | `crypto.randomUUID`  | `nuovoId()` di `@core/utils/uuid.util`    |
 * | `crypto.subtle`      | niente: va fatto sul server               |
 *
 * ⭐ `crypto.getRandomValues` invece **c'è anche fuori** dal contesto sicuro —
 * misurato — ed è la sorgente su cui `nuovoId` ripiega.
 */
import { readFileSync, globSync } from 'node:fs';

/** Le API che il browser espone SOLO in contesto sicuro. */
const VIETATE = [
  {
    cerca: /\bcrypto\s*\.\s*randomUUID\b/,
    nome: 'crypto.randomUUID',
    invece: "nuovoId() di '@core/utils/uuid.util'",
  },
  {
    cerca: /\bcrypto\s*\.\s*subtle\b/,
    nome: 'crypto.subtle',
    invece: 'un endpoint del server: la crittografia non si fa nel client',
  },
];

/**
 * ⚠️ **L'utility che il ripiego lo IMPLEMENTA è esente**, ed è l'unica: è il
 * posto in cui `randomUUID` va nominata, dietro il controllo che la protegge.
 */
const ESENTI = ['src/app/core/utils/uuid.util.ts'];

const file = globSync('src/**/*.ts').filter(
  (f) => !f.endsWith('.spec.ts') && !ESENTI.some((e) => f.replace(/\\/g, '/').endsWith(e)),
);

if (file.length === 0) {
  console.error('⛔ nessun sorgente esaminato: la guardia sarebbe cieca.');
  process.exit(1);
}

const problemi = [];

for (const percorso of file) {
  const righe = readFileSync(percorso, 'utf8').split(/\r?\n/);
  /*
    ⚠️ **Il commento a blocco si SEGUE, non si riconosce dalla riga.** Qui i
    commenti sono in italiano e le righe interne cominciano con «⛔», non con
    un asterisco: una guardia che guardasse solo il primo carattere accuserebbe
    proprio il commento che spiega perché quell'API non si usa. Successo alla
    prima esecuzione.
  */
  let dentroCommento = false;
  righe.forEach((riga, i) => {
    const eraDentro = dentroCommento;
    if (!dentroCommento && /\/\*/.test(riga) && !/\*\//.test(riga)) dentroCommento = true;
    else if (dentroCommento && /\*\//.test(riga)) dentroCommento = false;
    // Un commento che NOMINA l'API per spiegare perché non si usa è legittimo.
    if (eraDentro || dentroCommento || /^\s*(\/\/|\*|\/\*)/.test(riga)) return;
    for (const vietata of VIETATE) {
      if (vietata.cerca.test(riga)) {
        problemi.push(
          `⛔ ${percorso}:${i + 1} · ${vietata.nome} non esiste fuori dal contesto sicuro.\n` +
            `   Da http://192.168.… LANCIA, e se è dentro un'azione sincrona nessuno lo vede.\n` +
            `   Usa: ${vietata.invece}`,
        );
      }
    }
  });
}

if (problemi.length > 0) {
  console.error(problemi.join('\n\n'));
  process.exit(1);
}

console.log(`✅ contesto sicuro: ${file.length} sorgenti, nessuna API da https-only.`);
