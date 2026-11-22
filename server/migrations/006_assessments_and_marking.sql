CREATE TABLE assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  join_code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 4 AND 180),
  instructions TEXT NOT NULL DEFAULT '' CHECK (char_length(instructions) <= 4000),
  assessment_mode TEXT NOT NULL DEFAULT 'practice' CHECK (assessment_mode IN ('practice','exam')),
  duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK (duration_minutes BETWEEN 1 AND 360),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','closed')),
  published_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX assessments_teacher_status_idx ON assessments(teacher_user_id,status,updated_at DESC);
CREATE INDEX assessments_institution_status_idx ON assessments(institution_id,status,published_at DESC);

CREATE TABLE assessment_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 250),
  prompt TEXT NOT NULL CHECK (char_length(prompt) BETWEEN 1 AND 6000),
  question_type TEXT NOT NULL CHECK (question_type IN ('choice','multi','boolean','short','number','matching','ordering','essay')),
  options JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(options)='array'),
  correct_answer JSONB,
  marking_guide TEXT NOT NULL DEFAULT '' CHECK (char_length(marking_guide) <= 3000),
  explanation TEXT NOT NULL DEFAULT '' CHECK (char_length(explanation) <= 3000),
  marks NUMERIC(7,2) NOT NULL CHECK (marks > 0 AND marks <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(assessment_id,position)
);
CREATE INDEX assessment_questions_assessment_idx ON assessment_questions(assessment_id,position);

CREATE TABLE assessment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE RESTRICT,
  learner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','submitted','marking','published')),
  answers JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(answers)='object'),
  auto_score NUMERIC(9,2) NOT NULL DEFAULT 0 CHECK (auto_score >= 0),
  maximum_score NUMERIC(9,2) NOT NULL CHECK (maximum_score > 0),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  UNIQUE(assessment_id,learner_user_id)
);
CREATE INDEX assessment_attempts_learner_idx ON assessment_attempts(learner_user_id,status,started_at DESC);
CREATE INDEX assessment_attempts_teacher_queue_idx ON assessment_attempts(assessment_id,status,submitted_at DESC);

CREATE TABLE assessment_question_marks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES assessment_attempts(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES assessment_questions(id) ON DELETE RESTRICT,
  awarded_marks NUMERIC(7,2) NOT NULL CHECK (awarded_marks >= 0),
  feedback TEXT NOT NULL DEFAULT '' CHECK (char_length(feedback) <= 3000),
  marked_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(attempt_id,question_id)
);
CREATE INDEX assessment_question_marks_attempt_idx ON assessment_question_marks(attempt_id);
