
CREATE TABLE public.user_passkeys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  transports TEXT[] NOT NULL DEFAULT '{}',
  device_label TEXT,
  backed_up BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

GRANT SELECT, DELETE ON public.user_passkeys TO authenticated;
GRANT ALL ON public.user_passkeys TO service_role;

ALTER TABLE public.user_passkeys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own passkeys"
  ON public.user_passkeys FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own passkeys"
  ON public.user_passkeys FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX user_passkeys_user_id_idx ON public.user_passkeys(user_id);

CREATE TABLE public.passkey_challenges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('registration', 'authentication')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '5 minutes')
);

GRANT SELECT ON public.passkey_challenges TO authenticated;
GRANT ALL ON public.passkey_challenges TO service_role;

ALTER TABLE public.passkey_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own challenges"
  ON public.passkey_challenges FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX passkey_challenges_user_kind_idx
  ON public.passkey_challenges(user_id, kind, created_at DESC);
