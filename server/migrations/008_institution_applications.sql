ALTER TABLE institutions
  ADD COLUMN registration_number TEXT,
  ADD COLUMN town TEXT,
  ADD COLUMN physical_address TEXT,
  ADD COLUMN contact_name TEXT,
  ADD COLUMN contact_role TEXT;

CREATE TABLE institution_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_name TEXT NOT NULL,
  institution_type TEXT NOT NULL DEFAULT 'school' CHECK (institution_type IN ('school','college','other')),
  registration_number TEXT NOT NULL,
  county TEXT NOT NULL,
  town TEXT NOT NULL,
  physical_address TEXT,
  contact_name TEXT NOT NULL,
  contact_role TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  institution_id TEXT REFERENCES institutions(id),
  review_note TEXT,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX institution_applications_status_created_idx ON institution_applications(status, created_at DESC);
CREATE INDEX institution_applications_email_idx ON institution_applications(contact_email, status);
