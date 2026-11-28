ALTER TABLE marketplace_orders
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE guardian_exam_orders
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS marketplace_orders_archived_idx ON marketplace_orders(archived_at, created_at DESC);
CREATE INDEX IF NOT EXISTS guardian_exam_orders_archived_idx ON guardian_exam_orders(archived_at, created_at DESC);
