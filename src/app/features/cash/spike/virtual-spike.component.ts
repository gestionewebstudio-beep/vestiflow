import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { ScrollingModule } from '@angular/cdk/scrolling';

/**
 * ⚠️ **SPIKE — la prova riproducibile del confronto, non codice di prodotto.**
 *
 * ⛔ **Non e' agganciato a nessuna rotta, e non e' una dimenticanza**: misurato
 * il 05/09/2026, la rotta portava `ScrollingModule` del CDK nel bundle
 * INIZIALE — **647,35 kB → 658,40 kB**, +11 kB per ogni utente, per una pagina
 * di sola misura.
 *
 * ⭐ **Per rieseguirlo** servono tre righe in `cash.routes.ts`, piu'
 * `virtual-spike` nel `testMatch` del progetto `chromium-ci`:
 *
 * ```ts
 * { path: 'spike-virtuale',
 *   loadComponent: () =>
 *     import('./spike/virtual-spike.component').then((m) => m.VirtualSpikeComponent) },
 * ```
 *
 * poi `E2E_USE_MOCK_AUTH=1 E2E_BASE_URL=http://localhost:4310 npx playwright
 * test e2e/virtual-spike.spec.ts`.
 *
 * Mette a confronto le due sole strade che conservano `table`, `tbody` e `tr`:
 *
 * ```text
 * A. CDK ESTERNO   cdk-virtual-scroll-viewport → wrapper → <table> intera
 * B. DISTANZIATRICI  .data-table-scroll → <table> → <tbody> con due <tr> vuoti
 * ```
 *
 * ⛔ **Non duplica celle ne` intestazioni del prodotto**: rende una tabella
 * ridotta con la stessa anatomia (`thead` appiccicato, `tfoot` totali,
 * `table-layout: fixed`, larghezze in `<col>`), che e` cio` che serve a
 * rispondere alle cinque domande. Il componente vero non viene toccato.
 */
@Component({
  selector: 'app-virtual-spike',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ScrollingModule],
  templateUrl: './virtual-spike.component.html',
  styleUrl: './virtual-spike.component.scss',
})
export class VirtualSpikeComponent {
  protected readonly ALTEZZA = 25;

  protected readonly righe = Array.from({ length: 5000 }, (_, i) => ({
    id: `r-${i}`,
    numero: `CS/2026/${i + 1}`,
    operatore: i % 5 === 0 ? 'Anna Maria Giuseppina Della Valle' : 'Bruno',
    totale: 1000 + (5000 - i),
  }));

  // ── B: la finestra a righe distanziatrici ────────────────────────────────
  protected readonly scrollTop = signal(0);
  protected readonly altezzaVista = signal(600);

  /** Un margine sopra e sotto: evita il bianco durante uno scorrimento veloce. */
  private readonly MARGINE = 10;

  protected readonly primo = computed(() =>
    Math.max(0, Math.floor(this.scrollTop() / this.ALTEZZA) - this.MARGINE),
  );

  protected readonly ultimo = computed(() =>
    Math.min(
      this.righe.length,
      Math.ceil((this.scrollTop() + this.altezzaVista()) / this.ALTEZZA) + this.MARGINE,
    ),
  );

  protected readonly finestra = computed(() => this.righe.slice(this.primo(), this.ultimo()));

  protected readonly spazioSopra = computed(() => this.primo() * this.ALTEZZA);
  protected readonly spazioSotto = computed(
    () => (this.righe.length - this.ultimo()) * this.ALTEZZA,
  );

  protected onScroll(evento: Event): void {
    const el = evento.target as HTMLElement;
    this.scrollTop.set(el.scrollTop);
    this.altezzaVista.set(el.clientHeight);
  }

  protected soldi(minor: number): string {
    return `${(minor / 100).toFixed(2)} €`;
  }
}
