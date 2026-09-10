-- T-031: flag table with threshold breach tracking and dedupe
CREATE TYPE flag_rule AS ENUM (
  'aged_debt',
  'amount_exposure',
  'broken_promise',
  'silence',
  'adverse_trajectory',
  'unaged_balance'
);

CREATE TYPE flag_severity AS ENUM ('red', 'amber', 'grey');

CREATE TABLE flag (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID NOT NULL REFERENCES client ON DELETE CASCADE,
  open_item_id      UUID REFERENCES open_item,
  rule              flag_rule NOT NULL,
  severity          flag_severity NOT NULL,
  message           TEXT NOT NULL,
  dedupe_key        TEXT NOT NULL,
  raised_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_by   UUID REFERENCES app_user,
  acknowledged_at   TIMESTAMPTZ,
  ack_reason        TEXT,
  ack_until         TIMESTAMPTZ,
  resolved_at       TIMESTAMPTZ,
  resolution        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE flag ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX flag_dedupe_key_live_idx ON flag (dedupe_key)
  WHERE resolved_at IS NULL;

CREATE INDEX flag_client_idx ON flag (client_id, raised_at DESC);
CREATE INDEX flag_severity_idx ON flag (severity, raised_at DESC) WHERE resolved_at IS NULL;
