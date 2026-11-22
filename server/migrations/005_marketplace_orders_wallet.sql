CREATE TABLE marketplace_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'awaiting_payment' CHECK (status IN ('awaiting_payment','paid','cancelled','refunded')),
  total_kes NUMERIC(12,2) NOT NULL CHECK (total_kes >= 0),
  payment_method TEXT CHECK (payment_method IN ('mpesa_demo')),
  payment_reference TEXT UNIQUE,
  is_simulated_payment BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);
CREATE INDEX marketplace_orders_buyer_idx ON marketplace_orders(buyer_user_id, created_at DESC);

CREATE TABLE marketplace_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES marketplace_orders(id) ON DELETE CASCADE,
  submission_id UUID NOT NULL REFERENCES marketplace_submissions(id) ON DELETE RESTRICT,
  seller_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title_snapshot TEXT NOT NULL,
  unit_price_kes NUMERIC(10,2) NOT NULL CHECK (unit_price_kes >= 0),
  seller_share_percent NUMERIC(5,2) NOT NULL CHECK (seller_share_percent BETWEEN 0 AND 100),
  seller_amount_kes NUMERIC(10,2) NOT NULL CHECK (seller_amount_kes >= 0),
  platform_amount_kes NUMERIC(10,2) NOT NULL CHECK (platform_amount_kes >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(order_id, submission_id)
);
CREATE INDEX marketplace_order_items_seller_idx ON marketplace_order_items(seller_user_id, created_at DESC);

CREATE TABLE wallet_accounts (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  currency TEXT NOT NULL DEFAULT 'KES' CHECK (currency = 'KES'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE wallet_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES wallet_accounts(user_id) ON DELETE RESTRICT,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('sale_pending','sale_settled','settlement_available','payout_reserved','payout_released','payout_paid')),
  bucket TEXT NOT NULL CHECK (bucket IN ('pending','available','reserved','paid')),
  amount_kes NUMERIC(12,2) NOT NULL CHECK (amount_kes <> 0),
  reference_type TEXT NOT NULL CHECK (reference_type IN ('marketplace_order_item','seller_settlement','payout_request')),
  reference_id UUID NOT NULL,
  actor_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX wallet_ledger_user_bucket_idx ON wallet_ledger(user_id, bucket, created_at DESC);
CREATE INDEX wallet_ledger_reference_idx ON wallet_ledger(reference_type, reference_id);
CREATE UNIQUE INDEX wallet_ledger_once_idx ON wallet_ledger(user_id, entry_type, bucket, reference_type, reference_id);

CREATE TABLE seller_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id UUID NOT NULL UNIQUE REFERENCES marketplace_order_items(id) ON DELETE RESTRICT,
  seller_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount_kes NUMERIC(10,2) NOT NULL CHECK (amount_kes >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','settled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_by UUID REFERENCES users(id),
  settled_at TIMESTAMPTZ
);
CREATE INDEX seller_settlements_queue_idx ON seller_settlements(status, created_at DESC);
CREATE INDEX seller_settlements_seller_idx ON seller_settlements(seller_user_id, created_at DESC);

CREATE TABLE teacher_payout_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount_kes NUMERIC(12,2) NOT NULL CHECK (amount_kes >= 100),
  destination_phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','paid')),
  request_note TEXT,
  review_note TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  paid_by UUID REFERENCES users(id),
  paid_at TIMESTAMPTZ
);
CREATE INDEX teacher_payout_queue_idx ON teacher_payout_requests(status, requested_at DESC);
CREATE INDEX teacher_payout_teacher_idx ON teacher_payout_requests(teacher_user_id, requested_at DESC);
