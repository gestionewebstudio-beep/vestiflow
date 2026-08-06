-- Aggiunge origine movimento per vendite/storni al banco (profilo solo gestionale).
ALTER TYPE "MovementOrigin" ADD VALUE IF NOT EXISTS 'vestiflow_pos';
