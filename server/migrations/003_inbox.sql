CREATE TABLE inbox_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  subject TEXT NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 180),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 10000),
  category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('general','support','orders','marketplace','system')),
  is_announcement BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX inbox_messages_sender_created_idx ON inbox_messages(sender_user_id, created_at DESC);

CREATE TABLE inbox_recipients (
  message_id UUID NOT NULL REFERENCES inbox_messages(id) ON DELETE CASCADE,
  recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, recipient_user_id)
);
CREATE INDEX inbox_recipients_user_created_idx ON inbox_recipients(recipient_user_id, created_at DESC, message_id);
CREATE INDEX inbox_recipients_unread_idx ON inbox_recipients(recipient_user_id) WHERE read_at IS NULL AND archived_at IS NULL;
