ALTER TABLE marketplace_submissions
  ADD COLUMN IF NOT EXISTS file_storage_key TEXT,
  ADD COLUMN IF NOT EXISTS uploaded_file_name TEXT,
  ADD COLUMN IF NOT EXISTS file_mime_type TEXT,
  ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT CHECK (file_size_bytes IS NULL OR file_size_bytes BETWEEN 1 AND 52428800),
  ADD COLUMN IF NOT EXISTS file_sha256 TEXT CHECK (file_sha256 IS NULL OR file_sha256 ~ '^[0-9a-f]{64}$');

-- Keep legacy sample-name-only listings out of checkout until their owners add
-- an actual print master. They become editable so sellers can finish them.
UPDATE marketplace_submissions
SET status='changes_requested',review_note='Upload the actual PDF or ZIP print master before resubmitting.',updated_at=now()
WHERE status='approved' AND file_storage_key IS NULL;

ALTER TABLE marketplace_order_items
  ADD COLUMN IF NOT EXISTS file_storage_key_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS file_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS file_mime_type_snapshot TEXT;

-- The academic catalogue also contains optional language, faith, and elective
-- subjects. Let administrators explicitly define which subjects make a complete
-- marketplace series for each grade.
ALTER TABLE academic_grade_subjects
  ADD COLUMN IF NOT EXISTS marketplace_required BOOLEAN NOT NULL DEFAULT true;
UPDATE academic_grade_subjects gs SET marketplace_required=false
FROM academic_subjects s
WHERE s.id=gs.subject_id AND lower(s.name) IN (
  'christian religious education','islamic religious education','hindu religious education',
  'indigenous language','arabic','french','german','mandarin chinese',
  'mathematics option a','mathematics option b','biology for the blind','home science',
  'art and design','woodwork','metalwork','building construction','power mechanics',
  'electricity','drawing and design','aviation technology','computer studies',
  'kenyan sign language','music','business studies'
);

ALTER TABLE marketplace_orders
  ADD COLUMN IF NOT EXISTS carrier_name TEXT,
  ADD COLUMN IF NOT EXISTS tracking_code TEXT,
  ADD COLUMN IF NOT EXISTS tracking_url TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_updates_opt_in BOOLEAN NOT NULL DEFAULT false,
  DROP CONSTRAINT IF EXISTS marketplace_orders_fulfillment_status_check,
  ADD CONSTRAINT marketplace_orders_fulfillment_status_check
    CHECK (fulfillment_status IN ('awaiting_payment','processing','queued_for_print','printing','ready_for_dispatch','dispatched','delivered','cancelled'));

-- Retain historical marketplace listing filenames as labels, but they are not proof
-- that a real print master exists. New submissions must upload an actual PDF or ZIP.
