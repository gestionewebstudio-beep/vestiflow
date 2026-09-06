import { inject, Injectable } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

/**
 * Prefisso «VestiFlow · » centralizzato: le rotte dichiarano solo il nome
 * pagina («Prodotti», «Ordini cliente», …). Una rotta senza `title` ricade sul
 * solo nome app, invece di conservare in silenzio il titolo della pagina
 * precedente come farebbe la strategy di default.
 */
@Injectable({ providedIn: 'root' })
export class PageTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const pageTitle = this.buildTitle(snapshot);
    this.title.setTitle(pageTitle ? `VestiFlow · ${pageTitle}` : 'VestiFlow');
  }
}
