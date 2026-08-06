-- Aggiunge origine movimento per vendite/storni online registrati manualmente nel gestionale.
ALTER TYPE "MovementOrigin" ADD VALUE IF NOT EXISTS 'vestiflow_online';
