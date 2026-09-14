/**
 * Le SOTTOSCRIZIONI webhook di UN negozio di prova: fotografia, cancellazione
 * con fotografia, ripristino verificato (`docs/28` §2-bis, punto 3 del
 * proprietario: «conservare identificativi, topic, indirizzi e versione prima
 * di toccarle; alla fine verificarne il ripristino. Non basta presumere che il
 * pulsante le ricrei»).
 *
 *   node scripts/webhook-sottoscrizioni.mjs fotografa  --negozio <dominio>
 *   node scripts/webhook-sottoscrizioni.mjs cancella   --negozio <dominio> --fotografia <file> --conferma <dominio>
 *   node scripts/webhook-sottoscrizioni.mjs ripristina --negozio <dominio> --fotografia <file> --conferma <dominio>
 *
 * ⭐ Il token si legge dal database in SOLA LETTURA e si decifra in memoria; il
 *    negozio è sempre uno, nominato; `cancella` e `ripristina` vogliono anche
 *    `--conferma` con lo stesso dominio. La fotografia va in `backups/webhook/`
 *    (ignorata da Git) e contiene id, topic, indirizzo, versione, data.
 *
 * ⛔ `cancella` tocca SOLO le sottoscrizioni presenti nella fotografia data —
 *    riletta e confrontata prima — e `ripristina` ricrea topic + indirizzo +
 *    versione da quella fotografia, poi RILEGGE e confronta: gli id cambiano,
 *    l'insieme (topic, indirizzo, versione) deve tornare identico.
 */
import { createDecipheriv, scryptSync } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PrismaClient } from '@prisma/client';

import { leggiFileAmbiente, repoRoot } from '../../scripts/backup/load-env.mjs';

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const CARTELLA = join(repoRoot, 'backups', 'webhook');

function argomento(nome) {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function muori(m) {
  console.error(`\n  Fermo: ${m}\n`);
  process.exit(1);
}

/** Che cosa di una sottoscrizione conta per il ripristino (gli id no: cambiano). */
export function chiave(w) {
  return `${w.topic} → ${w.address} (${w.api_version})`;
}

/** Le due liste descrivono le stesse sottoscrizioni, a meno degli id. */
export function stessoInsieme(prima, dopo) {
  const a = prima.map(chiave).sort();
  const b = dopo.map(chiave).sort();
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

async function tokenDelNegozio(dominio) {
  const env = leggiFileAmbiente(join(apiRoot, '.env'));
  const key = scryptSync(env['SHOPIFY_TOKEN_ENCRYPTION_KEY'] ?? '', 'vestiflow-shopify-token', 32);
  const prisma = new PrismaClient();
  try {
    const righe = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      return tx.$queryRawUnsafe(
        'SELECT access_token_enc FROM shopify_credentials WHERE shop_domain = $1',
        dominio,
      );
    });
    if (righe.length !== 1) {
      muori(`credenziale per «${dominio}»: attese 1, trovate ${righe.length}.`);
    }
    const [ivB64, tagB64, dataB64] = righe[0].access_token_enc.split(':');
    const d = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
    d.setAuthTag(Buffer.from(tagB64, 'base64'));
    return {
      token: Buffer.concat([d.update(Buffer.from(dataB64, 'base64')), d.final()]).toString('utf8'),
      versione: env['SHOPIFY_API_VERSION'] ?? '2026-07',
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function shopify(dominio, versione, token, percorso, init = {}) {
  const risposta = await fetch(`https://${dominio}/admin/api/${versione}/${percorso}`, {
    ...init,
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const testo = await risposta.text();
  if (!risposta.ok) {
    muori(`${init.method ?? 'GET'} ${percorso} → HTTP ${risposta.status}: ${testo.slice(0, 200)}`);
  }
  return testo ? JSON.parse(testo) : {};
}

async function elenca(dominio, versione, token) {
  const { webhooks } = await shopify(dominio, versione, token, 'webhooks.json');
  return webhooks.map((w) => ({
    id: w.id,
    topic: w.topic,
    address: w.address,
    api_version: w.api_version,
    created_at: w.created_at,
  }));
}

function stampa(titolo, lista) {
  console.log(`\n  ${titolo}: ${lista.length} sottoscrizioni`);
  for (const w of lista) {
    console.log(`    #${w.id}  ${chiave(w)}`);
  }
}

const invocatoDirettamente =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invocatoDirettamente) {
  const comando = process.argv[2];
  const dominio = argomento('--negozio');
  if (!dominio || !dominio.endsWith('.myshopify.com')) {
    muori('serve --negozio <dominio.myshopify.com>.');
  }
  const { token, versione } = await tokenDelNegozio(dominio);

  if (comando === 'fotografa') {
    const lista = await elenca(dominio, versione, token);
    mkdirSync(CARTELLA, { recursive: true });
    const file = join(
      CARTELLA,
      `${dominio}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    );
    writeFileSync(
      file,
      `${JSON.stringify({ negozio: dominio, letto: new Date().toISOString(), webhooks: lista }, null, 2)}\n`,
    );
    stampa(`Fotografia di ${dominio}`, lista);
    console.log(`\n  salvata in ${file}`);
    process.exit(0);
  }

  const fileFoto = argomento('--fotografia');
  const conferma = argomento('--conferma');
  if (!fileFoto || !existsSync(fileFoto)) {
    muori('serve --fotografia <file scritto da «fotografa»>.');
  }
  if (conferma !== dominio) {
    muori(`--conferma deve ripetere il negozio («${dominio}»).`);
  }
  const foto = JSON.parse(readFileSync(fileFoto, 'utf8'));
  if (foto.negozio !== dominio) {
    muori(`la fotografia è di «${foto.negozio}», non di «${dominio}».`);
  }

  if (comando === 'cancella') {
    const adesso = await elenca(dominio, versione, token);
    stampa('Adesso sul negozio', adesso);
    for (const w of foto.webhooks) {
      const presente = adesso.find((x) => x.id === w.id);
      if (!presente) {
        muori(
          `la sottoscrizione #${w.id} (${chiave(w)}) non c'è più: fotografia non attuale, rifare «fotografa».`,
        );
      }
      if (chiave(presente) !== chiave(w)) {
        muori(`la sottoscrizione #${w.id} è cambiata rispetto alla fotografia.`);
      }
    }
    for (const w of foto.webhooks) {
      await shopify(dominio, versione, token, `webhooks/${w.id}.json`, { method: 'DELETE' });
      console.log(`    cancellata #${w.id}  ${chiave(w)}`);
    }
    const dopo = await elenca(dominio, versione, token);
    const rimaste = dopo.filter((x) => foto.webhooks.some((w) => w.id === x.id));
    if (rimaste.length > 0) {
      muori(`${rimaste.length} sottoscrizioni della fotografia risultano ancora presenti.`);
    }
    stampa('Dopo la cancellazione', dopo);
    process.exit(0);
  }

  if (comando === 'ripristina') {
    for (const w of foto.webhooks) {
      // ⚠️ La versione di una sottoscrizione è quella del PERCORSO della richiesta,
      //    non un campo del corpo: si ricrea con la versione fotografata nel percorso.
      await shopify(dominio, w.api_version, token, 'webhooks.json', {
        method: 'POST',
        body: JSON.stringify({
          webhook: { topic: w.topic, address: w.address, format: 'json' },
        }),
      });
      console.log(`    ricreata  ${chiave(w)}`);
    }
    const dopo = await elenca(dominio, versione, token);
    const soloQuelleDellaFoto = dopo.filter((x) =>
      foto.webhooks.some((w) => chiave(w) === chiave(x)),
    );
    stampa('Dopo il ripristino', dopo);
    if (!stessoInsieme(foto.webhooks, soloQuelleDellaFoto)) {
      muori('il ripristino NON coincide con la fotografia (topic, indirizzo, versione).');
    }
    console.log(
      '\n  ✅ ripristino verificato: stesso insieme di (topic, indirizzo, versione) della fotografia.',
    );
    process.exit(0);
  }

  muori(`comando sconosciuto «${comando}»: fotografa | cancella | ripristina.`);
}
