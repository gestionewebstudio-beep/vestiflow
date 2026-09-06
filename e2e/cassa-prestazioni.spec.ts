import { expect } from '@playwright/test';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { intercetta } from './helpers/cash-register-fixtures';
import { test } from './helpers/isolated-test';

/**
 * ⭐ **La misura prestazionale del registro Cassa sul TELEFONO.**
 *
 * ⚠️ **Qui c’era il contrario, e non è stato cancellato: è stato riscritto.**
 * Fino al 06/09/2026 questo file dichiarava che «sotto `lg` la finestra di
 * rendering è spenta per scelta», perché le card non hanno un’altezza unica
 * (misurate 83, 105 e 163px sullo stesso elenco) e una finestra che sbaglia
 * l'altezza salta righe. Tutte le card stavano nel DOM e il tempo cresceva col
 * numero di righe.
 *
 * ⭐ **Con gli offset misurati per riga quella premessa è caduta**: la finestra
 * è accesa anche sulle card, e la misura di questa scala è ora quella di un
 * elenco virtualizzato. I numeri prima/dopo stanno in `docs/DA-FARE.md`.
 *
 * ⚠️ **Questo file gira in un passo CI NON BLOCCANTE**, per la deroga del
 * 06/09/2026. Le prove funzionali del telefono restano obbligatorie e stanno in
 * `cassa-mobile.spec.ts`: qui non c'è nessuna verifica di funzionamento che
 * altrove manchi.
 *
 * ⭐ **A che cosa serve allora**: a produrre la SCALA di misure sul corridore
 * CI — quello vero, a 2 core, non la macchina di chi sviluppa — che è l'unica
 * base onesta per scegliere il volume e la soglia del futuro cancello
 * prestazionale obbligatorio. Due esecuzioni non bastano a distinguere la
 * variabilità dal superamento sistematico: qui se ne fanno tre per volume,
 * nella stessa esecuzione.
 *
 * ⛔ **Nessuna soglia è ancora armata, e l'assenza è dichiarata.** Sceglierne
 * una prima di avere questi numeri significherebbe sceglierla perché passa, che
 * è esattamente ciò che il mandato vieta.
 */

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

/** I volumi della scala. 5.000 è il tetto di pagina dell'API (`docs/25`). */
const VOLUMI = [300, 1000, 2000, 5000] as const;
const RIPETIZIONI = 3;

/*
  ⚠️ **`process.cwd()` è la RADICE del repository**, non `e2e/`: il processo lo
  lancia `npx playwright test --config=e2e/...` da lì. I `../` che si vedono
  nella configurazione sono un'altra cosa — quelli sono relativi al FILE di
  configurazione. Scritto `join(cwd, '..', 'test-results')`, il registro
  finirebbe fuori dal repository, e non se ne accorgerebbe nessuno.
*/
const CARTELLA = join(process.cwd(), 'test-results');
const REGISTRO = join(CARTELLA, 'prestazioni-mobile.txt');

function annota(riga: string): void {
  mkdirSync(CARTELLA, { recursive: true });
  appendFileSync(REGISTRO, `${riga}\n`);
}

for (const quante of VOLUMI) {
  test(`prestazioni mobile: ${quante} card, ${RIPETIZIONI} misure`, async ({ page }, info) => {
    await intercetta(page, quante);
    // Si scaldano i moduli fuori dalla misura: altrimenti la prima ripetizione
    // paga il caricamento dell'applicazione e non dice niente sulle righe.
    await page.goto('/app/dashboard');

    const misure: number[] = [];
    for (let giro = 0; giro < RIPETIZIONI; giro += 1) {
      await page.goto('/app/dashboard');
      const inizio = Date.now();
      await page.goto('/app/cassa/operazioni');
      /*
        ⛔ **La condizione di completamento non è più «tutte le card nel DOM».**
        Con la finestra accesa non lo saranno mai: si aspetta che il risultato
        INTERO sia arrivato — lo dichiara `aria-rowcount`, che conta tutte le
        righe più l’intestazione — e che la prima card sia dipinta.
      */
      await expect(page.locator('.data-table')).toHaveAttribute(
        'aria-rowcount',
        String(quante + 1),
        { timeout: 90_000 },
      );
      await expect(page.locator('.data-table__card').first()).toBeVisible();
      misure.push(Date.now() - inizio);
    }

    misure.sort((a, b) => a - b);
    const mediana = misure[Math.floor(misure.length / 2)]!;
    const minimo = misure[0]!;
    const massimo = misure.at(-1)!;
    // Quanto ballano le misure fra loro: e' il numero che dice se una soglia
    // vicina alla mediana sarebbe un cancello o una lotteria.
    const dispersione = Math.round(((massimo - minimo) / mediana) * 100);

    await info.attach('prestazioni-mobile', {
      body: JSON.stringify({ quante, misure, minimo, mediana, massimo, dispersione }),
      contentType: 'application/json',
    });
    annota(
      `${String(quante).padStart(5)} card  ` +
        `min ${String(minimo).padStart(6)} ms  ` +
        `mediana ${String(mediana).padStart(6)} ms  ` +
        `max ${String(massimo).padStart(6)} ms  ` +
        `dispersione ${dispersione}%`,
    );
    console.info(
      `[prestazioni-mobile] ${quante} card: min ${minimo} / mediana ${mediana} / max ${massimo} ms ` +
        `(dispersione ${dispersione}%)`,
    );

    /*
      ⭐ **Le asserzioni sono di SANITA', non di tempo**, e adesso sono due: il
      risultato deve essere arrivato INTERO (altrimenti un elenco troncato si
      carica in fretta proprio perche' e' incompleto) e le righe rese devono
      essere POCHE (altrimenti si sta misurando una finestra spenta, cioe' un
      altro programma).
    */
    await expect(page.locator('.data-table')).toHaveAttribute('aria-rowcount', String(quante + 1));
    expect(await page.locator('.data-table__row').count()).toBeLessThan(120);
  });
}
