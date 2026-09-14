import { vi } from 'vitest';

/**
 * L'archivio immagini nelle prove di INTEGRAZIONE.
 *
 * ⛔ **Non scarica e non carica niente**, ed è deliberato: queste prove girano
 *    contro il database sacrificabile e un negozio simulato, non contro la rete.
 *    Un archivio vero vorrebbe Supabase Storage e un CDN raggiungibile.
 *
 * ⚠️ **Ne discende che qui l'immagine principale risulta sempre un'anomalia**, e
 *    va saputo: queste prove dimostrano che un'immagine non archiviata **non
 *    rompe l'import** e **non cancella niente** — non che l'archiviazione
 *    funzioni. Quella si prova in `media/image-archive.service.spec.ts`, dove il
 *    download è sotto controllo.
 */
export function archivioImmaginiFinto() {
  return {
    importaImmagineDaUrl: vi.fn(async () => {
      throw new Error('archivio non disponibile nelle prove di integrazione');
    }),
    archiviaBuffer: vi.fn(async () => {
      throw new Error('archivio non disponibile nelle prove di integrazione');
    }),
    rimuoviDalBucket: vi.fn(async () => {}),
  };
}
