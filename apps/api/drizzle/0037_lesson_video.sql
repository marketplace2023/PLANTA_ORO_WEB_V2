CREATE TABLE lms.lesson_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL UNIQUE REFERENCES lms.lessons(id) ON DELETE CASCADE,
  source_key text NOT NULL, playback_key text, original_name text NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'PENDING', error text,
  duration_seconds numeric(12,3), size_bytes numeric(18,0), lease_token uuid, lease_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lesson_videos_status CHECK (status IN ('PENDING','PROCESSING','READY','FAILED'))
);
--> statement-breakpoint
CREATE INDEX idx_lesson_videos_status ON lms.lesson_videos(status);
--> statement-breakpoint
CREATE TABLE lms.lesson_playback (
  enrollment_id uuid NOT NULL REFERENCES lms.enrollments(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES lms.lessons(id) ON DELETE CASCADE,
  source text NOT NULL,
  position_seconds numeric(12,3) NOT NULL DEFAULT 0,
  duration_seconds numeric(12,3) NOT NULL DEFAULT 0,
  watched_seconds numeric(12,3) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(enrollment_id, lesson_id),
  CONSTRAINT lesson_playback_nonnegative CHECK (position_seconds >= 0 AND duration_seconds >= 0 AND watched_seconds >= 0)
);
