# VestiFlow API

Backend del gestionale VestiFlow: **NestJS 11 + Prisma 6 + PostgreSQL (Supabase)**.

## Requisiti

- Node 22 (vedi `.nvmrc` nella root del repo)
- Un progetto Supabase (PostgreSQL) per il database

## Setup

```bash
cd api
npm install
cp .env.example .env   # poi compila i valori reali
```

In `.env` serve **una sola** connection string di Supabase (Project Settings → Database):

| Variabile           | Uso                                        | Dove sta        |
| ------------------- | ------------------------------------------ | --------------- |
| `DATABASE_URL`      | pooler (6543), la usa l'applicazione       | `.env`          |
| `DATABASE_URL_TEST` | database di prova locale                   | `.env`          |
| `DIRECT_URL_TEST`   | database di prova locale, per le migration | `.env`          |
| `DIRECT_URL`        | ⛔ diretta (5432) del **condiviso**        | `.env.rilascio` |

⛔ **`DIRECT_URL` non va in `.env`.** La CLI Prisma carica quel file da sé, e
`migrate deploy` usa `directUrl`, non `url`: finché la variabile sta lì, ogni comando
Prisma digitato in questa cartella parte già connesso al database condiviso. Il
07/09/2026 una migration ci è finita così. Tienila in `api/.env.rilascio`, ignorato da
Git e caricato da nessuno — vedi README.md radice.

## Database

```bash
npm run db:test:up         # avvia il PostgreSQL di prova (container)
npm run prisma:deploy:test # applica le migrazioni al database di PROVA
npm run prisma:generate    # rigenera il client dopo modifiche allo schema
npm run prisma:seed        # dati sandbox — ⚠️ chiede conferma: scrive sul bersaglio
                           #   di DATABASE_URL, che in locale è il condiviso
```

⚠️ **`npm run prisma:deploy` non esiste più come comando locale**: applicava le
migrazioni al condiviso senza dirlo. Ora rifiuta e spiega. Per il condiviso le
variabili si passano a mano, dopo aver provato la migration su una copia.

Per evolvere lo schema in sviluppo: `npm run prisma:migrate -- --name nome_migrazione`.

## Avvio

```bash
npm run start:dev   # watch mode su http://localhost:3000
```

- Prefisso API: `/api/v1`
- Healthcheck: `GET /api/v1/health` (verifica anche il DB)

## Autenticazione (Supabase Auth)

1. In `api/.env` imposta:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API → **service_role**, solo backend)
2. In `src/environments/environment.ts` imposta `supabase.anonKey` (API → **anon/public**).
3. Esegui il seed (dati di esempio in DB, **senza** utente Auth):

```bash
npm run prisma:seed
```

4. Accedi con un account creato da **Nuovo cliente** (platform admin) o da Supabase Auth.

Le route protette richiedono `Authorization: Bearer <jwt>`. Il tenant è risolto dal profilo DB, non da header client.

| Metodo | Path              | Descrizione                            |
| ------ | ----------------- | -------------------------------------- |
| GET    | `/api/v1/auth/me` | Profilo utente (tenant, ruolo, negozi) |

## Tenant (deprecato)

L'header `x-tenant-id` non è più usato: il tenant arriva dal JWT verificato.

## Endpoint attuali

| Metodo | Path                                        | Descrizione                                                     |
| ------ | ------------------------------------------- | --------------------------------------------------------------- |
| GET    | `/api/v1/health`                            | Stato processo + DB                                             |
| GET    | `/api/v1/products`                          | Lista paginata (search, status, category, brand, season)        |
| GET    | `/api/v1/products/sku-availability?sku=...` | Check SKU per validazione form                                  |
| GET    | `/api/v1/products/:id`                      | Dettaglio con varianti                                          |
| POST   | `/api/v1/products`                          | Crea prodotto + varianti (SKU unici, valuta unica)              |
| PATCH  | `/api/v1/products/:id`                      | Aggiorna dati generali                                          |
| DELETE | `/api/v1/products/:id`                      | Elimina (bloccato se esistono movimenti: archiviare)            |
| GET    | `/api/v1/inventory/locations`               | Location del tenant                                             |
| GET    | `/api/v1/inventory/levels`                  | Giacenze paginate (location, search, lowStockOnly)              |
| GET    | `/api/v1/inventory/movements`               | Storico movimenti (filtri tipo/location/periodo)                |
| POST   | `/api/v1/inventory/movements`               | Registra carico/scarico/trasferimento/rettifica (transazionale) |

## Principi implementati

- **Multi-tenant ovunque**: ogni query filtra per `tenantId`.
- **Stock per location** (semantica Shopify), mai campi hardcoded per negozio.
- **Movimenti tracciati**: le giacenze cambiano solo dentro la stessa
  transazione che scrive lo `StockMovement` (append-only, con origine
  `manual`/`shopify`).
- **Denaro in unità minori intere** (`sellingPriceMinor`), mai float.
- **Sicurezza base**: helmet, CORS in lista bianca, validazione payload
  globale (whitelist + forbidNonWhitelisted), env validate al boot, nessun
  segreto nel codice.

## Prossimi step

1. Auth Supabase (verifica JWT, ruoli via custom claims) al posto di `x-tenant-id`.
2. Moduli SupplierOrders, Customers, SalesOrders, ShopifyConnection.
3. Sync Shopify (webhook ricezione ordini/inventario, push giacenze).
4. Deploy su Railway (root directory `api/`, healthcheck `/api/v1/health`).
