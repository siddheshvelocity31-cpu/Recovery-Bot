-- T-033: singleton system_config row for kill switch and heartbeat
CREATE TABLE system_config (
  id                          TEXT PRIMARY KEY DEFAULT 'singleton'
                                CHECK (id = 'singleton'),
  outreach_kill_switch        BOOLEAN NOT NULL DEFAULT false,
  global_max_messages_per_week INT NOT NULL DEFAULT 3,
  last_tick_at                TIMESTAMPTZ,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER system_config_updated_at
  BEFORE UPDATE ON system_config
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO system_config (id) VALUES ('singleton');
