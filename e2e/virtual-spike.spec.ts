import { expect, test } from '@playwright/test';
import { appendFileSync, writeFileSync } from 'node:fs';

/**
 * ⚠️ **PREFLIGHT** — confronto misurato fra le due sole strade che conservano
 * `table`, `tbody` e `tr`. Non resta nella suite.
 */

const REGISTRO = 'C:/Users/Utente/AppData/Local/Temp/spike.txt';
const nota = (t: string): void => {
  appendFileSync(REGISTRO, `${t}\n`);
};

test.describe('spike virtualizzazione', () => {
  test('CDK esterno contro righe distanziatrici', async ({ page }) => {
    writeFileSync(REGISTRO, '');
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1440, height: 900 });

    const t0 = Date.now();
    await page.goto('/app/cassa/spike-virtuale');
    await expect(page.locator('[data-prova="spaziatori"] .riga').first()).toBeVisible({
      timeout: 120_000,
    });
    nota(`  caricamento della pagina con entrambe: ${Date.now() - t0}ms`);

    for (const prova of ['cdk', 'spaziatori'] as const) {
      const sel = `[data-prova="${prova}"]`;
      nota(`\n  ── ${prova} ──────────────────────────────`);

      const iniziale = await page.evaluate((s) => {
        const box = document.querySelector(s)!;
        const righe = Array.from(box.querySelectorAll('.riga'));
        const intestazioni = Array.from(box.querySelectorAll('.intestazione')).map((e) =>
          Math.round(e.getBoundingClientRect().width),
        );
        const prima = righe[0];
        const celle = prima
          ? Array.from(prima.querySelectorAll('td')).map((c) =>
              Math.round(c.getBoundingClientRect().width),
            )
          : [];
        return {
          righeRese: righe.length,
          nodi: box.querySelectorAll('*').length,
          intestazioni,
          celle,
          allineate:
            celle.length === intestazioni.length && celle.every((w, i) => w === intestazioni[i]),
        };
      }, sel);

      nota(`    righe rese                  : ${iniziale.righeRese}`);
      nota(`    nodi DOM della sezione      : ${iniziale.nodi}`);
      nota(`    larghezze intestazione      : ${JSON.stringify(iniziale.intestazioni)}`);
      nota(`    larghezze prima cella       : ${JSON.stringify(iniziale.celle)}`);
      nota(`    COLONNE ALLINEATE           : ${iniziale.allineate}`);

      // ── Scorrimento fino in fondo: l'ultima riga si raggiunge? ───────────
      const tScroll = Date.now();
      await page.evaluate((s) => {
        const vista = document.querySelector(`${s} .vista`) as HTMLElement;
        vista.scrollTop = vista.scrollHeight;
      }, sel);
      await page.waitForTimeout(400);
      const ms = Date.now() - tScroll;

      const infondo = await page.evaluate((s) => {
        const box = document.querySelector(s)!;
        const righe = Array.from(box.querySelectorAll('.riga'));
        const ultima = righe[righe.length - 1];
        const testa = box.querySelector('.intestazione') as HTMLElement;
        const vista = box.querySelector('.vista') as HTMLElement;
        const piede = box.querySelector('.piede') as HTMLElement;
        const rTesta = testa.getBoundingClientRect();
        const rVista = vista.getBoundingClientRect();
        const rPiede = piede.getBoundingClientRect();
        return {
          ultimoTesto: ultima
            ? (ultima.querySelector('td')?.textContent ?? '').trim()
            : '(nessuna)',
          righeRese: righe.length,
          // L'intestazione e` appiccicata se il suo bordo alto coincide con
          // quello della vista, anche dopo aver scorso in fondo.
          intestazioneFissa: Math.abs(rTesta.top - rVista.top) < 2,
          piedeFisso: Math.abs(rPiede.bottom - rVista.bottom) < 3,
          scostamentoIntestazione: Math.round(rTesta.top - rVista.top),
        };
      }, sel);

      nota(`    scorrimento in fondo        : ${ms}ms`);
      nota(`    ultima riga raggiunta       : ${infondo.ultimoTesto}`);
      nota(`    righe rese in fondo         : ${infondo.righeRese}`);
      nota(
        `    INTESTAZIONE FISSA          : ${infondo.intestazioneFissa} (scostamento ${infondo.scostamentoIntestazione}px)`,
      );
      nota(`    piede fisso                 : ${infondo.piedeFisso}`);

      // ── L'offset dichiarato corrisponde all'altezza vera? ────────────────
      const offset = await page.evaluate((s) => {
        const box = document.querySelector(s)!;
        const vista = box.querySelector('.vista') as HTMLElement;
        const righe = Array.from(box.querySelectorAll('.riga'));
        if (righe.length === 0) {
          return { atteso: -1, reale: -1 };
        }
        const prima = righe[0]!;
        const testo = (prima.querySelector('td')?.textContent ?? '').trim();
        const indice = Number(testo.split('/')[2] ?? '0') - 1;
        // Posizione attesa della prima riga resa, dal suo indice.
        const atteso = indice * 25;
        const reale = Math.round(
          prima.getBoundingClientRect().top - vista.getBoundingClientRect().top + vista.scrollTop,
        );
        return { atteso, reale, indice };
      }, sel);
      nota(
        `    offset atteso vs reale      : ${offset.atteso} vs ${offset.reale} (scarto ${offset.reale - offset.atteso}px)`,
      );
    }
  });
});
