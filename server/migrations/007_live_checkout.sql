ALTER TABLE marketplace_orders
  DROP CONSTRAINT IF EXISTS marketplace_orders_status_check,
  ADD CONSTRAINT marketplace_orders_status_check
    CHECK (status IN ('awaiting_payment','payment_pending','payment_failed','payment_review','paid','cancelled','refunded'));

ALTER TABLE marketplace_orders
  DROP CONSTRAINT IF EXISTS marketplace_orders_payment_method_check,
  ADD CONSTRAINT marketplace_orders_payment_method_check
    CHECK (payment_method IS NULL OR payment_method IN ('mpesa_demo','mpesa_daraja')),
  ADD COLUMN IF NOT EXISTS checkout_request_id TEXT,
  ADD COLUMN IF NOT EXISTS merchant_request_id TEXT,
  ADD COLUMN IF NOT EXISTS payer_phone TEXT,
  ADD COLUMN IF NOT EXISTS payment_error TEXT,
  ADD COLUMN IF NOT EXISTS mpesa_result_code TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS marketplace_orders_checkout_request_idx
  ON marketplace_orders(checkout_request_id) WHERE checkout_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS marketplace_orders_payment_status_idx
  ON marketplace_orders(status, updated_at DESC);

-- Existing demo orders remain explicitly marked as simulated. New live attempts
-- switch this flag to false only after Daraja accepts the STK Push request.
