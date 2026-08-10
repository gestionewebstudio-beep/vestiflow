-- Verita' sullo stato dell'integrazione Shopify (specifica §5, punto Uno).
--
-- Fino a oggi la connessione sapeva QUANTI webhook aveva attivato, non QUALI e
-- nemmeno VERSO DOVE. Il conteggio «7» era corretto e inutile insieme: descriveva
-- un insieme che nessuno conosceva, ed e' il motivo per cui orders/cancelled e'
-- rimasto fuori per un mese senza che nulla potesse segnalarlo.
--
--   webhook_address        l'indirizzo a cui le sottoscrizioni risultano registrate.
--                          La deduplica Shopify confronta per uguaglianza esatta:
--                          un indirizzo diverso da quello configurato significa
--                          sottoscrizioni che consegnano altrove.
--   webhook_topics         quali topic, non quanti. I mancanti si ricavano per
--                          differenza dagli attesi, e coprono anche i falliti.
--   webhooks_checked_at    quando l'elenco e' stato osservato. Un'osservazione
--                          senza data non si sa quando era vera, e appiccicarla a
--                          webhooks_activated_at sarebbe la stessa bugia con
--                          un'etichetta nuova.
--   last_webhook_event_at  l'ultimo evento RICEVUTO. Mai su last_sync_at, che ha
--                          sette scrittori di cui sei manuali: non potrebbe
--                          distinguere un bottone premuto da un evento in arrivo.
--
-- NESSUN BACKFILL, volutamente. Sulle righe esistenti l'elenco resta vuoto e
-- l'indirizzo nullo, e devono leggersi «non lo sappiamo» — non «zero attivi».
-- La distinzione arriva fino alla UI: sostituire una bugia con un'altra sarebbe
-- peggio che non fare niente. Si popolano alla prima verifica o ri-registrazione.
--
-- webhooks_active_count resta al suo posto: il database e' condiviso e il client
-- Prisma dell'altro ramo seleziona tutti gli scalari, quindi eliminarla adesso
-- manderebbe in 500 ogni sua lettura di shopify_connections. Diventa derivata da
-- webhook_topics (un solo scrittore, non possono divergere) e si elimina dopo
-- l'unione dei rami.
--
-- Tutto additivo: nessun drop, nessuna rinomina, nessun NOT NULL senza default.
-- La tabella esiste gia', quindi la RLS non si tocca.

ALTER TABLE "shopify_connections" ADD COLUMN     "last_webhook_event_at" TIMESTAMP(3),
ADD COLUMN     "webhook_address" TEXT,
ADD COLUMN     "webhook_topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "webhooks_checked_at" TIMESTAMP(3);
