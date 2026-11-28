-- Permanent deletion support.
-- Audit rows keep a readable snapshot of the account/institution they reference so that
-- purging a user does not erase the history of what that user did. The foreign keys become
-- nullable so the referencing rows can be detached instead of blocking the delete.

ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS actor_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS subject_snapshot TEXT;

ALTER TABLE audit_events ALTER COLUMN actor_user_id DROP NOT NULL;
ALTER TABLE audit_events ALTER COLUMN subject_user_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS audit_events_actor_idx ON audit_events(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_subject_idx ON audit_events(subject_user_id, created_at DESC);

-- Resolve the real ON DELETE behaviour for the institution links created with NOT VALID
-- in 002_institutions_and_family_links.sql, then make every remaining reference tolerant of
-- a deleted institution so a purge is a single transaction with no FK surprises.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_institution_fk') THEN
    ALTER TABLE user_roles DROP CONSTRAINT user_roles_institution_fk;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'role_invitations_institution_fk') THEN
    ALTER TABLE role_invitations DROP CONSTRAINT role_invitations_institution_fk;
  END IF;
END $$;

ALTER TABLE user_roles ADD CONSTRAINT user_roles_institution_fk
  FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE;
ALTER TABLE role_invitations ADD CONSTRAINT role_invitations_institution_fk
  FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE;

DO $$
DECLARE
  guard RECORD;
BEGIN
  FOR guard IN
    SELECT c.conname, t.relname AS table_name, a.attname AS column_name
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    JOIN pg_class rt ON rt.oid = c.confrelid
    WHERE c.contype = 'f' AND rt.relname = 'institutions'
      AND NOT (t.relname = 'user_roles' AND a.attname = 'institution_id')
      AND NOT (t.relname = 'role_invitations' AND a.attname = 'institution_id')
  LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', guard.table_name, guard.conname);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP NOT NULL', guard.table_name, guard.column_name);
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES institutions(id) ON DELETE SET NULL',
      guard.table_name, guard.conname, guard.column_name);
  END LOOP;
END $$;

-- Fast lookups for the "can this record be deleted?" guard checks.
CREATE INDEX IF NOT EXISTS marketplace_orders_buyer_idx ON marketplace_orders(buyer_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS assessments_teacher_idx ON assessments(teacher_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS assessments_institution_idx ON assessments(institution_id);
CREATE INDEX IF NOT EXISTS marketplace_submissions_institution_idx ON marketplace_submissions(institution_id);
