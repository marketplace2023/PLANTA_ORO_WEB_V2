CREATE TABLE "lms"."course_sections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"course_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lms"."courses" ADD COLUMN "subtitle" varchar(240);--> statement-breakpoint
ALTER TABLE "lms"."courses" ADD COLUMN "category" varchar(100) DEFAULT 'General' NOT NULL;--> statement-breakpoint
ALTER TABLE "lms"."courses" ADD COLUMN "language" varchar(10) DEFAULT 'es' NOT NULL;--> statement-breakpoint
ALTER TABLE "lms"."courses" ADD COLUMN "learning_objectives" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "lms"."courses" ADD COLUMN "requirements" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "lms"."courses" ADD COLUMN "target_audience" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "lms"."courses" ADD COLUMN "cover_url" text;--> statement-breakpoint
ALTER TABLE "lms"."courses" ADD COLUMN "promo_video_url" text;--> statement-breakpoint
ALTER TABLE "lms"."courses" ADD COLUMN "instructor_bio" text;--> statement-breakpoint
ALTER TABLE "lms"."lessons" ADD COLUMN "section_id" uuid;--> statement-breakpoint
ALTER TABLE "lms"."course_sections" ADD CONSTRAINT "course_sections_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "lms"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_course_sections_course" ON "lms"."course_sections" USING btree ("course_id","position");--> statement-breakpoint
ALTER TABLE "lms"."lessons" ADD CONSTRAINT "lessons_section_id_course_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "lms"."course_sections"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
-- Preserve existing lesson IDs, order, videos and progress under an initial module.
INSERT INTO lms.course_sections (id, course_id, title, position)
SELECT gen_random_uuid(), id, 'Contenido del curso', 0 FROM lms.courses;
--> statement-breakpoint
UPDATE lms.lessons AS lesson SET section_id = section.id
FROM lms.course_sections AS section WHERE section.course_id = lesson.course_id;
