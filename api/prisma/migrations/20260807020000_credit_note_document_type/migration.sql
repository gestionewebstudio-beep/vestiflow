-- Nota di credito di vendita (TD04): nuovo tipo documento fiscale.
-- Condivide il numeratore con le fatture (documentNumberingType, come
-- l'accompagnatoria) e non muove mai il magazzino. Nessuna tabella nuova:
-- niente RLS da abilitare.
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'credit_note';
