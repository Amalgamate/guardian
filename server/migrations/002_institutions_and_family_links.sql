CREATE TABLE institutions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  institution_type TEXT NOT NULL DEFAULT 'school' CHECK (institution_type IN ('school','college','publisher','other')),
  county TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending','active','suspended')),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX institutions_status_name_idx ON institutions(status, name);

-- Preserve institution identifiers already referenced by role assignments or invitations.
INSERT INTO institutions(id, name, status)
SELECT DISTINCT institution_id, 'Existing institution (' || institution_id || ')', 'active'
FROM (
  SELECT institution_id FROM user_roles WHERE institution_id IS NOT NULL
  UNION
  SELECT institution_id FROM role_invitations WHERE institution_id IS NOT NULL
) existing
ON CONFLICT (id) DO NOTHING;

ALTER TABLE user_roles ADD CONSTRAINT user_roles_institution_fk
  FOREIGN KEY (institution_id) REFERENCES institutions(id) NOT VALID;
ALTER TABLE role_invitations ADD CONSTRAINT role_invitations_institution_fk
  FOREIGN KEY (institution_id) REFERENCES institutions(id) NOT VALID;

CREATE TABLE parent_learner_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  learner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL CHECK (relationship IN ('parent','guardian','other')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','revoked')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  UNIQUE (parent_user_id, learner_user_id)
);
CREATE INDEX parent_learner_parent_status_idx ON parent_learner_links(parent_user_id, status);
CREATE INDEX parent_learner_learner_status_idx ON parent_learner_links(learner_user_id, status);
