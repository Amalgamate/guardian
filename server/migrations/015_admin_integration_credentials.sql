CREATE TABLE admin_integration_credentials (
  provider TEXT PRIMARY KEY,
  encrypted_config TEXT NOT NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
