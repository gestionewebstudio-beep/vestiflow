import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { ImageArchiveService, ImmagineNonScaricata } from './image-archive.service';

/**
 * ⛔ **La risoluzione dei nomi si FINGE, e non è una comodità.** Senza, queste
 *    prove interrogherebbero il DNS vero: `cdn.shopify.com` risolve davvero, e
 *    una prova che dipende da come è configurata la rete di chi la esegue non
 *    misura il codice. Misurato l’11/09/2026: cinque prove rosse appena il
 *    controllo ha cominciato a risolvere.
 */
const risoluzione = vi.hoisted(() => ({ indirizzi: [{ address: '93.184.216.34' }] }));
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async () => risoluzione.indirizzi),
}));

import type { ConfigService } from '@nestjs/config';
import type { SupabaseService } from '../auth/supabase.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * ⛔ **UN LINK NON È UN'IMMAGINE.**
 *
 * Fino all'11/09/2026 un catalogo importato scriveva in `ProductImage.url` il
 * link remoto e lasciava `storagePath` vuoto: l'articolo dipendeva dal fatto che
 * quel file restasse dov'era, e **non finiva nemmeno nel backup** — che copia il
 * bucket, non i link. Ora il link serve a scaricare, e l'articolo usa la copia.
 *
 * ⚠️ Le prove sul RIFIUTO sono la metà facile. Quelle che contano stanno sotto:
 *    il tetto che ferma lo scaricamento MENTRE avviene, e l'indirizzo controllato
 *    a ogni salto — perché è lì che un controllo scritto male sembra funzionare.
 */

/** Un PNG 1×1 vero: i magic bytes si controllano, e sharp ci deve lavorare. */
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function rispostaConCorpo(pezzi: readonly Buffer[], intestazioni: Record<string, string> = {}) {
  let indice = 0;
  const annullata = { valore: false };
  const corpo = {
    getReader: () => ({
      read: async () => {
        if (annullata.valore || indice >= pezzi.length) {
          return { done: true, value: undefined };
        }
        const pezzo = pezzi[indice];
        indice += 1;
        return { done: false, value: new Uint8Array(pezzo!) };
      },
      cancel: async () => {
        annullata.valore = true;
      },
    }),
  };
  return {
    risposta: {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'image/png', ...intestazioni }),
      body: corpo,
    } as unknown as Response,
    lettiFinora: () => indice,
    annullata,
  };
}

function creaService(opzioni: { readonly uploadError?: { message: string } } = {}) {
  const upload = vi.fn().mockResolvedValue({ error: opzioni.uploadError ?? null });
  const prisma = {
    productImage: {
      create: vi.fn((args: { data: Record<string, unknown> }) => ({ id: 'img-1', ...args.data })),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    product: { findFirst: vi.fn().mockResolvedValue({ id: 'prod-1' }) },
  };
  const service = new ImageArchiveService(
    prisma as unknown as PrismaService,
    { getStorageClient: () => ({ storage: { from: () => ({ upload }) } }) } as unknown as SupabaseService,
    {
      get: (chiave: string) =>
        chiave === 'SUPABASE_URL' ? 'https://esempio.supabase.co' : 'product-media',
    } as unknown as ConfigService,
  );
  return { service, prisma, upload };
}

describe('importaImmagineDaUrl — il link serve a scaricare, non a rappresentare', () => {
  const fetchVero = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = fetchVero;
  });
  beforeEach(() => {
    risoluzione.indirizzi = [{ address: '93.184.216.34' }];
  });

  it('⭐ l’articolo usa la COPIA, e il link di partenza non resta da nessuna parte', async () => {
    const { risposta } = rispostaConCorpo([PNG_1x1]);
    globalThis.fetch = vi.fn().mockResolvedValue(risposta);
    const { service, upload } = creaService();

    const creata = await service.importaImmagineDaUrl('tenant-1', 'prod-1', {
      url: 'https://cdn.shopify.com/s/files/1/foto.png',
      altText: 'Maglia',
      sortOrder: 0,
    });

    // ⭐ È questa la verifica che conta: l’indirizzo salvato è quello della copia
    //    in archivio, e l’originale non compare in nessun campo.
    expect(creata.storagePath).toMatch(/^tenant-1\/prod-1\//);
    expect(creata.url).toBe(`https://esempio.supabase.co/storage/v1/object/public/product-media/${creata.storagePath}`);
    expect(JSON.stringify(creata)).not.toContain('cdn.shopify.com');
    // …e i byte sono davvero finiti nel bucket.
    expect(upload).toHaveBeenCalledOnce();
  });

});

describe('⛔ scaricare è un dato di INGRESSO: le condizioni non sono decorazione', () => {
  const fetchVero = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = fetchVero;
    risoluzione.indirizzi = [{ address: '93.184.216.34' }];
  });

  it('⛔ rifiuta http in chiaro e gli indirizzi interni, senza nemmeno chiamare', async () => {
    const chiamata = vi.fn();
    globalThis.fetch = chiamata;
    const { service } = creaService();

    for (const indirizzo of [
      'http://cdn.esempio.test/a.png',
      'https://127.0.0.1/a.png',
      'https://169.254.169.254/latest/meta-data',
      'https://192.168.1.10/a.png',
      'https://qualcosa.internal/a.png',
    ]) {
      await expect(
        service.importaImmagineDaUrl('tenant-1', 'prod-1', { url: indirizzo }),
      ).rejects.toBeInstanceOf(ImmagineNonScaricata);
    }

    // ⭐ Non è solo «solleva»: la richiesta non parte proprio.
    expect(chiamata).not.toHaveBeenCalled();
  });

  it('⛔ il REINDIRIZZAMENTO si controlla come il primo indirizzo', async () => {
    // ⚠️ È il caso che `redirect: 'follow'` renderebbe invisibile: il primo link
    //    è ineccepibile, la destinazione no.
    const chiamata = vi.fn().mockResolvedValue({
      ok: false,
      status: 302,
      headers: new Headers({ location: 'https://169.254.169.254/latest/meta-data' }),
      body: null,
    } as unknown as Response);
    globalThis.fetch = chiamata;
    const { service } = creaService();

    await expect(
      service.importaImmagineDaUrl('tenant-1', 'prod-1', { url: 'https://cdn.esempio.test/a.png' }),
    ).rejects.toThrow(/reindirizzamento verso un indirizzo non ammesso/);

    // ⭐ La seconda richiesta NON parte: si è fermato prima di aprirla.
    expect(chiamata).toHaveBeenCalledOnce();

    // ⛔ **E la richiesta CHIEDE di non seguire da sola.** Senza questa riga la
    //    prova era verde anche con `redirect: 'follow'` — il fetch finto
    //    restituisce comunque il 302, quindi il controllo scattava lo stesso e
    //    il difetto restava invisibile. Con `follow` vero il 302 non si vede
    //    proprio: la piattaforma lo segue, e non c’è niente da controllare.
    //    Falsificata l’11/09/2026: il guasto tornava VERDE.
    const opzioni = chiamata.mock.calls[0]?.[1] as { redirect?: string };
    expect(opzioni.redirect).toBe('manual');
  });

  it('⛔ una catena che gira in tondo si ferma, non si insegue', async () => {
    const chiamata = vi.fn().mockResolvedValue({
      ok: false,
      status: 301,
      headers: new Headers({ location: 'https://cdn.esempio.test/ancora.png' }),
      body: null,
    } as unknown as Response);
    globalThis.fetch = chiamata;
    const { service } = creaService();

    await expect(
      service.importaImmagineDaUrl('tenant-1', 'prod-1', { url: 'https://cdn.esempio.test/a.png' }),
    ).rejects.toThrow(/troppi reindirizzamenti/);
    expect(chiamata.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it('⛔ il tetto ferma lo scaricamento MENTRE avviene, non dopo', async () => {
    // ⚠️ La differenza non è teorica: leggere tutto e poi misurare significa aver
    //    già accettato il file in memoria. Qui il flusso avrebbe 20 MB e il
    //    lettore deve fermarsi appena superati i 5.
    const unMega = Buffer.alloc(1024 * 1024, 7);
    const venti = Array.from({ length: 20 }, () => unMega);
    const { risposta, lettiFinora, annullata } = rispostaConCorpo(venti);
    globalThis.fetch = vi.fn().mockResolvedValue(risposta);
    const { service } = creaService();

    await expect(
      service.importaImmagineDaUrl('tenant-1', 'prod-1', { url: 'https://cdn.esempio.test/grande.png' }),
    ).rejects.toThrow(/troppo grande/);

    // ⭐ Le due asserzioni che dicono «durante»: ha letto 6 pezzi su 20, e ha
    //    annullato la lettura invece di lasciare arrivare il resto.
    expect(lettiFinora()).toBe(6);
    expect(annullata.valore).toBe(true);
  });

  it('⛔ un contenuto che non è un’immagine non entra in archivio', async () => {
    const { risposta } = rispostaConCorpo([Buffer.from('<html>non sono una foto</html>')]);
    globalThis.fetch = vi.fn().mockResolvedValue(risposta);
    const { service, upload } = creaService();

    await expect(
      service.importaImmagineDaUrl('tenant-1', 'prod-1', { url: 'https://cdn.esempio.test/a.png' }),
    ).rejects.toThrow(/non è un'immagine valida/);
    expect(upload).not.toHaveBeenCalled();
  });

  it('⛔ e in nessuno di questi casi si tocca una riga di immagine', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('rete assente'));
    const { service, prisma } = creaService();

    await expect(
      service.importaImmagineDaUrl('tenant-1', 'prod-1', { url: 'https://cdn.esempio.test/a.png' }),
    ).rejects.toBeInstanceOf(ImmagineNonScaricata);

    // ⭐ Fallire non è cancellare: nessuna create, e nessuna delete.
    expect(prisma.productImage.create).not.toHaveBeenCalled();
  });
});

describe('⛔ la destinazione CONTATTATA dev’essere pubblica, non solo il nome', () => {
  const fetchVero = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = fetchVero;
    risoluzione.indirizzi = [{ address: '93.184.216.34' }];
  });

  it('⛔ un dominio che risolve verso la rete interna si rifiuta SENZA contattarlo', async () => {
    // ⭐ È il limite che il controllo sul nome non poteva chiudere:
    //    `cdn.esempio.test` è un nome ineccepibile, e risolve a 10.0.0.7.
    risoluzione.indirizzi = [{ address: '10.0.0.7' }];
    const chiamata = vi.fn();
    globalThis.fetch = chiamata;
    const { service } = creaService();

    await expect(
      service.importaImmagineDaUrl('tenant-1', 'prod-1', { url: 'https://cdn.esempio.test/a.png' }),
    ).rejects.toThrow(/risolve a un indirizzo interno \(10\.0\.0\.7\)/);

    // ⛔ La parte che conta: la richiesta NON parte. Rifiutare dopo aver
    //    contattato sarebbe già aver fatto la richiesta che si voleva impedire.
    expect(chiamata).not.toHaveBeenCalled();
  });

  it('⛔ basta UNO degli indirizzi interno perché il nome sia rifiutato', async () => {
    // ⚠️ Chi controlla il DNS può rispondere con una coppia — uno pubblico e uno
    //    privato — e non si sa quale verrebbe scelto per la connessione.
    //    «Almeno uno va bene» non è una garanzia.
    risoluzione.indirizzi = [{ address: '93.184.216.34' }, { address: '169.254.169.254' }];
    const chiamata = vi.fn();
    globalThis.fetch = chiamata;
    const { service } = creaService();

    await expect(
      service.importaImmagineDaUrl('tenant-1', 'prod-1', { url: 'https://cdn.esempio.test/a.png' }),
    ).rejects.toThrow(/169\.254\.169\.254/);
    expect(chiamata).not.toHaveBeenCalled();
  });

  it('⛔ e il REINDIRIZZAMENTO si risolve come il primo indirizzo', async () => {
    // Il primo salto è pubblico; il secondo nome risolve all’interno.
    const chiamata = vi.fn().mockImplementation(async () => {
      risoluzione.indirizzi = [{ address: '127.0.0.1' }];
      return {
        ok: false,
        status: 302,
        headers: new Headers({ location: 'https://altro.esempio.test/a.png' }),
        body: null,
      } as unknown as Response;
    });
    globalThis.fetch = chiamata;
    const { service } = creaService();

    await expect(
      service.importaImmagineDaUrl('tenant-1', 'prod-1', { url: 'https://cdn.esempio.test/a.png' }),
    ).rejects.toThrow(/risolve a un indirizzo interno/);

    // ⭐ Una sola richiesta: la seconda non è mai partita.
    expect(chiamata).toHaveBeenCalledOnce();
  });

  it('⛔ un nome che non si risolve non si contatta', async () => {
    risoluzione.indirizzi = [];
    const chiamata = vi.fn();
    globalThis.fetch = chiamata;
    const { service } = creaService();

    await expect(
      service.importaImmagineDaUrl('tenant-1', 'prod-1', { url: 'https://cdn.esempio.test/a.png' }),
    ).rejects.toThrow(/non risolve a nessun indirizzo/);
    expect(chiamata).not.toHaveBeenCalled();
  });
});
