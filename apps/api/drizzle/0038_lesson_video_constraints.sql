-- Align the initial SQL constraint names with Drizzle's schema metadata.
-- IDs are supplied by the application, consistently with the other LMS tables.
ALTER TABLE lms.lesson_videos ALTER COLUMN id DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE lms.lesson_videos RENAME CONSTRAINT lesson_videos_lesson_id_key TO lesson_videos_lesson_id_unique;
--> statement-breakpoint
ALTER TABLE lms.lesson_videos RENAME CONSTRAINT lesson_videos_lesson_id_fkey TO lesson_videos_lesson_id_lessons_id_fk;
--> statement-breakpoint
ALTER TABLE lms.lesson_playback RENAME CONSTRAINT lesson_playback_pkey TO lesson_playback_enrollment_id_lesson_id_pk;
--> statement-breakpoint
ALTER TABLE lms.lesson_playback RENAME CONSTRAINT lesson_playback_enrollment_id_fkey TO lesson_playback_enrollment_id_enrollments_id_fk;
--> statement-breakpoint
ALTER TABLE lms.lesson_playback RENAME CONSTRAINT lesson_playback_lesson_id_fkey TO lesson_playback_lesson_id_lessons_id_fk;
