-- La PRIMA CONNESSIONE non importa lo storico degli ordini (docs/27 §5-bis,
-- deciso dal proprietario il 12/09/2026): all'attivazione si fissa l'ultimo id
-- ordine del negozio, e il recupero della sincronizzazione continua legge
-- «da questo id in poi». Gli id Shopify crescono con la creazione: e' un
-- confine senza orologi, ed e' l'unico ammesso dopo i tentativi ritirati
-- (confine temporale, confronto dei totali).
--
-- `orders_since` (un istante) non serve piu' e si toglie: era la forma
-- temporale di quel confine.
ALTER TABLE "shopify_setups" DROP COLUMN "orders_since";
ALTER TABLE "shopify_setups" ADD COLUMN "orders_since_id" TEXT;
