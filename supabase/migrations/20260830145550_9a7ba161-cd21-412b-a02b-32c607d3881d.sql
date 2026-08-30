ALTER TABLE public.payment_webhook_events
  ADD COLUMN IF NOT EXISTS body_hash text;

CREATE UNIQUE INDEX IF NOT EXISTS payment_webhook_events_body_dedupe
  ON public.payment_webhook_events(provider_code, body_hash)
  WHERE body_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS payment_webhook_events_recent
  ON public.payment_webhook_events(provider_code, created_at DESC);