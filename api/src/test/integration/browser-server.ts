import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage } from 'node:http';
import { extname, resolve, sep } from 'node:path';

import type { AppIntegrazione } from './app';
import { ambienteIntegrazione } from './env';
import { IDS } from './fixture';

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/**
 * Serve la build Angular e inoltra integralmente le API al vero Nest.
 * Solo il confine del provider Auth è locale: SDK, JWT guard e profilo DB sono quelli ordinari.
 * Non restituisce risposte sintetiche ad alcuna API gestionale.
 */
export async function avviaBrowserServer(app: AppIntegrazione) {
  ambienteIntegrazione();
  const root = resolve(process.cwd(), '../dist/vestiflow-integration/browser');
  if (!existsSync(resolve(root, 'index.html'))) {
    throw new Error('Build integration assente: eseguire npm run test:cassa:real dalla root.');
  }
  const email = 'commesso.a1@integrazione.local';
  const password = randomUUID();
  const refreshToken = randomUUID();
  const user = {
    id: IDS.authA1,
    email,
    aud: 'authenticated',
    role: 'authenticated',
    created_at: new Date().toISOString(),
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    factors: [],
  };
  const requests: { method: string; path: string; status: number; body?: unknown }[] = [];
  const errors: string[] = [];
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const body = await readBody(req);
      if (url.pathname.startsWith('/api/v1/')) {
        const target = `${app.baseUrl}${url.pathname.slice('/api/v1'.length)}${url.search}`;
        const headers: Record<string, string> = {};
        for (const name of ['authorization', 'content-type', 'accept']) {
          const value = req.headers[name];
          if (typeof value === 'string') headers[name] = value;
        }
        const response = await fetch(target, {
          method: req.method,
          headers,
          body: body.length ? new Uint8Array(body) : undefined,
          redirect: 'manual',
        });
        requests.push({
          method: req.method ?? 'GET',
          path: url.pathname,
          status: response.status,
          // Solo contenuti economici del dataset; mai header di autenticazione.
          body:
            body.length && url.pathname.startsWith('/api/v1/cash-sessions')
              ? (JSON.parse(body.toString('utf8')) as unknown)
              : undefined,
        });
        res.writeHead(response.status, {
          'content-type': response.headers.get('content-type') ?? 'application/json',
        });
        res.end(Buffer.from(await response.arrayBuffer()));
        return;
      }
      if (url.pathname === '/auth/v1/token') {
        const data = JSON.parse(body.toString('utf8')) as Record<string, string>;
        const valid =
          url.searchParams.get('grant_type') === 'password'
            ? data.email === email && data.password === password
            : url.searchParams.get('grant_type') === 'refresh_token' &&
              data.refresh_token === refreshToken;
        if (!valid) {
          res.writeHead(400);
          res.end();
          return;
        }
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            access_token: await app.token(IDS.authA1),
            refresh_token: refreshToken,
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            token_type: 'bearer',
            user,
          }),
        );
        return;
      }
      if (url.pathname === '/auth/v1/user') {
        if (!req.headers.authorization?.startsWith('Bearer ')) {
          res.writeHead(401);
          res.end();
          return;
        }
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(user));
        return;
      }
      if (url.pathname === '/auth/v1/logout') {
        res.writeHead(204);
        res.end();
        return;
      }
      if (url.pathname.startsWith('/auth/'))
        throw new Error(`Auth fixture non previsto: ${url.pathname}`);
      const candidate = resolve(root, `.${decodeURIComponent(url.pathname)}`);
      if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) {
        res.writeHead(400);
        res.end();
        return;
      }
      const file = extname(candidate) ? candidate : resolve(root, 'index.html');
      const mime: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.woff2': 'font/woff2',
        '.ico': 'image/x-icon',
        '.wasm': 'application/wasm',
      };
      if (!existsSync(file)) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.setHeader('content-type', mime[extname(file)] ?? 'application/octet-stream');
      res.end(await readFile(file));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      res.writeHead(500);
      res.end();
    }
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Porta browser non assegnata.');
  return {
    url: `http://127.0.0.1:${address.port}`,
    email,
    password,
    requests,
    errors,
    async chiudi() {
      server.closeAllConnections();
      await new Promise<void>((ok, fail) => server.close((error) => (error ? fail(error) : ok())));
    },
  };
}
