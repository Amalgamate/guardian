CREATE TABLE guardian_exam_pricing (
  grade_code TEXT PRIMARY KEY,
  grade_label TEXT NOT NULL,
  unit_price_kes INTEGER NOT NULL CHECK (unit_price_kes >= 0),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO guardian_exam_pricing(grade_code, grade_label, unit_price_kes) VALUES
  ('PG','PG',22),('PP1','PP1',22),('PP2','PP2',22),
  ('GRADE_1','Grade 1',25),('GRADE_2','Grade 2',25),('GRADE_3','Grade 3',25),
  ('GRADE_4','Grade 4',36),('GRADE_5','Grade 5',36),('GRADE_6','Grade 6',38),
  ('GRADE_7','Grade 7',45),('GRADE_8','Grade 8',45),('GRADE_9','Grade 9',50)
ON CONFLICT (grade_code) DO NOTHING;

CREATE TABLE guardian_exam_settings (
  setting_key TEXT PRIMARY KEY CHECK (setting_key = 'delivery_fee_kes'),
  setting_value INTEGER NOT NULL CHECK (setting_value >= 0),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO guardian_exam_settings(setting_key, setting_value) VALUES ('delivery_fee_kes', 300)
ON CONFLICT (setting_key) DO NOTHING;

CREATE TABLE guardian_exam_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  county TEXT NOT NULL,
  town TEXT NOT NULL,
  delivery_address TEXT NOT NULL,
  grades_snapshot JSONB NOT NULL CHECK (jsonb_typeof(grades_snapshot) = 'array'),
  total_students INTEGER NOT NULL CHECK (total_students > 0),
  subtotal_kes INTEGER NOT NULL CHECK (subtotal_kes > 0),
  delivery_fee_kes INTEGER NOT NULL CHECK (delivery_fee_kes >= 0),
  total_kes INTEGER NOT NULL CHECK (total_kes = subtotal_kes + delivery_fee_kes),
  status TEXT NOT NULL DEFAULT 'awaiting_payment' CHECK (status IN ('awaiting_payment','payment_pending','payment_failed','payment_review','paid','cancelled')),
  payer_phone TEXT,
  checkout_request_id TEXT UNIQUE,
  merchant_request_id TEXT,
  payment_reference TEXT UNIQUE,
  payment_error TEXT,
  mpesa_result_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);
CREATE INDEX guardian_exam_orders_status_idx ON guardian_exam_orders(status, created_at DESC);
CREATE INDEX guardian_exam_orders_email_idx ON guardian_exam_orders(email, created_at DESC);
