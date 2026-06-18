import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  ViewEncapsulation,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { catchError, of } from 'rxjs';

import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

@Component({
  selector: 'app-guide',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [ErrorStateComponent, TableSkeletonComponent],
  templateUrl: './guide.component.html',
  styleUrl: './guide.component.scss',
})
export class GuideComponent {
  private readonly http = inject(HttpClient);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  private readonly contentHost = viewChild<ElementRef<HTMLElement>>('contentHost');

  protected readonly pdfUrl = '/guide/vestiflow-guida.pdf';
  protected readonly pdfFileName = 'VestiFlow-guida.pdf';

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  private readonly htmlContent = signal<string>('');

  protected readonly safeContent = computed((): SafeHtml => {
    const html = this.htmlContent();
    if (!html) {
      return '';
    }
    // REASON: HTML statico generato in build da docs/GUIDA-UTENTE-VESTIFLOW.md, non input utente.
    return this.sanitizer.bypassSecurityTrustHtml(html);
  });

  constructor() {
    this.loadGuide();
  }

  @HostListener('click', ['$event'])
  protected onHostClick(event: Event): void {
    const root = this.contentHost()?.nativeElement;
    if (!root?.contains(event.target as Node)) {
      return;
    }
    this.onContentClick(event as MouseEvent);
  }

  private onContentClick(event: MouseEvent): void {
    const anchor = (event.target as HTMLElement).closest('a');
    if (!anchor) {
      return;
    }

    const href = anchor.getAttribute('href');
    if (!href?.startsWith('#') || href.length < 2) {
      return;
    }

    event.preventDefault();
    this.scrollToSection(decodeURIComponent(href.slice(1)));
  }

  protected reload(): void {
    this.loadGuide();
  }

  private loadGuide(): void {
    this.loading.set(true);
    this.error.set(null);
    this.htmlContent.set('');

    this.http
      .get('/guide/content.html', { responseType: 'text' })
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((html) => {
        this.loading.set(false);
        if (!html) {
          this.error.set('Impossibile caricare la guida. Riprova tra qualche istante.');
          return;
        }
        this.htmlContent.set(html);
      });
  }

  private scrollToSection(id: string): void {
    const root = this.contentHost()?.nativeElement;
    const target =
      root?.querySelector<HTMLElement>(`#${CSS.escape(id)}`) ?? this.document.getElementById(id);
    if (!target) {
      return;
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
