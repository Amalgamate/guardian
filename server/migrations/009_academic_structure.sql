CREATE TABLE academic_curricula (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE academic_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curriculum_id UUID NOT NULL REFERENCES academic_curricula(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (curriculum_id, name)
);

CREATE TABLE academic_grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level_id UUID NOT NULL REFERENCES academic_levels(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (level_id, name)
);

CREATE TABLE academic_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curriculum_id UUID NOT NULL REFERENCES academic_curricula(id) ON DELETE RESTRICT,
  code TEXT,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (curriculum_id, name),
  UNIQUE (curriculum_id, code)
);

CREATE TABLE academic_grade_subjects (
  grade_id UUID NOT NULL REFERENCES academic_grades(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES academic_subjects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (grade_id, subject_id)
);

CREATE TABLE academic_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curriculum_id UUID NOT NULL REFERENCES academic_curricula(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (curriculum_id, name)
);

CREATE INDEX academic_levels_curriculum_order_idx ON academic_levels(curriculum_id, sort_order);
CREATE INDEX academic_grades_level_order_idx ON academic_grades(level_id, sort_order);
CREATE INDEX academic_subjects_curriculum_name_idx ON academic_subjects(curriculum_id, name);
CREATE INDEX academic_grade_subjects_subject_idx ON academic_grade_subjects(subject_id);
CREATE INDEX academic_terms_curriculum_order_idx ON academic_terms(curriculum_id, sort_order);
