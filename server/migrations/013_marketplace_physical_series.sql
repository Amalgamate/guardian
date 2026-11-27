ALTER TABLE marketplace_submissions
  ADD COLUMN IF NOT EXISTS product_type TEXT NOT NULL DEFAULT 'single_paper'
    CHECK (product_type IN ('single_paper','series')),
  ADD COLUMN IF NOT EXISTS included_subjects JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(included_subjects) = 'array');

ALTER TABLE marketplace_orders
  ADD COLUMN IF NOT EXISTS delivery_fee_kes NUMERIC(10,2) CHECK (delivery_fee_kes >= 0),
  ADD COLUMN IF NOT EXISTS recipient_name TEXT,
  ADD COLUMN IF NOT EXISTS recipient_phone TEXT,
  ADD COLUMN IF NOT EXISTS delivery_address TEXT,
  ADD COLUMN IF NOT EXISTS fulfillment_status TEXT NOT NULL DEFAULT 'awaiting_payment'
    CHECK (fulfillment_status IN ('awaiting_payment','processing','dispatched','delivered','cancelled'));

UPDATE marketplace_orders SET delivery_fee_kes=0 WHERE delivery_fee_kes IS NULL;
ALTER TABLE marketplace_orders ALTER COLUMN delivery_fee_kes SET NOT NULL;
ALTER TABLE marketplace_orders ALTER COLUMN delivery_fee_kes SET DEFAULT 300;
UPDATE marketplace_orders SET fulfillment_status='processing' WHERE status='paid' AND fulfillment_status='awaiting_payment';

ALTER TABLE marketplace_order_items
  ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 1000),
  ADD COLUMN IF NOT EXISTS product_type TEXT NOT NULL DEFAULT 'single_paper'
    CHECK (product_type IN ('single_paper','series'));
