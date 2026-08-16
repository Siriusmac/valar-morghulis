-- Uno scontrino può contenere più acquisti su commissione destinati a persone
-- diverse. L'identità della singola richiesta resta il suo ID; il movimento del
-- pagatore può quindi essere condiviso da più richieste senza duplicare
-- l'addebito sul conto. La migration precedente aveva creato questo indice come
-- UNIQUE: va rimosso esplicitamente prima di ricrearlo come indice ordinario.
drop index if exists public.commissioned_purchases_payer_movement_idx;

create index commissioned_purchases_payer_movement_idx
  on public.commissioned_purchases (payer_id, payer_movement_id);
