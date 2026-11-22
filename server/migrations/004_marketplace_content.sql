CREATE TABLE marketplace_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 4 AND 180),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 20 AND 4000),
  curriculum TEXT NOT NULL CHECK (char_length(curriculum) BETWEEN 2 AND 120),
  level TEXT NOT NULL CHECK (char_length(level) BETWEEN 1 AND 80),
  grade TEXT NOT NULL CHECK (char_length(grade) BETWEEN 1 AND 80),
  subject TEXT NOT NULL CHECK (char_length(subject) BETWEEN 2 AND 120),
  academic_year TEXT NOT NULL CHECK (char_length(academic_year) BETWEEN 4 AND 12),
  term TEXT NOT NULL CHECK (char_length(term) BETWEEN 2 AND 80),
  assessment_type TEXT NOT NULL CHECK (char_length(assessment_type) BETWEEN 2 AND 100),
  resource TEXT NOT NULL CHECK (char_length(resource) BETWEEN 2 AND 100),
  page_count INTEGER NOT NULL DEFAULT 0 CHECK (page_count BETWEEN 0 AND 2000),
  question_count INTEGER NOT NULL DEFAULT 0 CHECK (question_count BETWEEN 0 AND 1000),
  formats JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(formats) = 'array'),
  price_kes NUMERIC(10,2) NOT NULL CHECK (price_kes BETWEEN 0 AND 1000000),
  sample_file_label TEXT,
  rights_confirmed BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','changes_requested','approved','rejected')),
  review_note TEXT,
  submitted_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX marketplace_submissions_teacher_idx ON marketplace_submissions(teacher_user_id, updated_at DESC);
CREATE INDEX marketplace_submissions_review_idx ON marketplace_submissions(status, submitted_at DESC);
CREATE INDEX marketplace_submissions_catalog_idx ON marketplace_submissions(curriculum, level, grade, subject, published_at DESC) WHERE status='approved';
