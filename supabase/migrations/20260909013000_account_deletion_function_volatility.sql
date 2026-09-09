-- PL/pgSQL classifica le assegnazioni JSONB usate da queste funzioni come
-- STABLE. La volatilita dichiarata deve riflettere quella effettiva.
alter function public.jsonb_replace_account_reference(jsonb, text, text) stable;
alter function public.jsonb_transform_account_snapshot(jsonb, text, text, text) stable;
