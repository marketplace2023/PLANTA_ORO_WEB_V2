CREATE SCHEMA "lms";
--> statement-breakpoint
CREATE TABLE "lms"."course_stages" (
	"course_id" uuid NOT NULL,
	"stage_master_id" uuid NOT NULL,
	CONSTRAINT "course_stages_course_id_stage_master_id_pk" PRIMARY KEY("course_id","stage_master_id")
);
--> statement-breakpoint
CREATE TABLE "lms"."courses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"provider_type" varchar(20) DEFAULT 'ECOSYSTEM' NOT NULL,
	"provider_id" uuid,
	"contractor_id" uuid,
	"level" varchar(20) DEFAULT 'BASIC' NOT NULL,
	"instructor_name" varchar(160),
	"certificate" boolean DEFAULT false NOT NULL,
	"status" varchar(20) DEFAULT 'DRAFT' NOT NULL,
	"duration_minutes" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "courses_owner_consistent" CHECK (("lms"."courses"."provider_type" = 'ECOSYSTEM' and "lms"."courses"."provider_id" is null and "lms"."courses"."contractor_id" is null)
        or ("lms"."courses"."provider_type" = 'PROVIDER' and "lms"."courses"."provider_id" is not null and "lms"."courses"."contractor_id" is null)
        or ("lms"."courses"."provider_type" = 'CONTRACTOR' and "lms"."courses"."contractor_id" is not null and "lms"."courses"."provider_id" is null))
);
--> statement-breakpoint
CREATE TABLE "lms"."enrollments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"course_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"plant_id" uuid,
	"status" varchar(20) DEFAULT 'ENROLLED' NOT NULL,
	"progress_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"certificate_code" varchar(30),
	CONSTRAINT "enrollments_certificate_code_unique" UNIQUE("certificate_code"),
	CONSTRAINT "enrollments_course_user_unique" UNIQUE("course_id","user_id"),
	CONSTRAINT "enrollments_progress_range" CHECK ("lms"."enrollments"."progress_percent" >= 0 and "lms"."enrollments"."progress_percent" <= 100)
);
--> statement-breakpoint
CREATE TABLE "lms"."lesson_progress" (
	"enrollment_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_progress_enrollment_id_lesson_id_pk" PRIMARY KEY("enrollment_id","lesson_id")
);
--> statement-breakpoint
CREATE TABLE "lms"."lessons" (
	"id" uuid PRIMARY KEY NOT NULL,
	"course_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"title" varchar(200) NOT NULL,
	"content" text,
	"video_url" text,
	"duration_minutes" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "lessons_duration_range" CHECK ("lms"."lessons"."duration_minutes" >= 0 and "lms"."lessons"."duration_minutes" <= 1440)
);
--> statement-breakpoint
ALTER TABLE "lms"."course_stages" ADD CONSTRAINT "course_stages_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "lms"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."course_stages" ADD CONSTRAINT "course_stages_stage_master_id_stage_master_id_fk" FOREIGN KEY ("stage_master_id") REFERENCES "process"."stage_master"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."courses" ADD CONSTRAINT "courses_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "provider"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."courses" ADD CONSTRAINT "courses_contractor_id_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "professional"."contractors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."courses" ADD CONSTRAINT "courses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "iam"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."enrollments" ADD CONSTRAINT "enrollments_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "lms"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."enrollments" ADD CONSTRAINT "enrollments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "iam"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."enrollments" ADD CONSTRAINT "enrollments_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "core"."plants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."lesson_progress" ADD CONSTRAINT "lesson_progress_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "lms"."enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."lesson_progress" ADD CONSTRAINT "lesson_progress_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "lms"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."lessons" ADD CONSTRAINT "lessons_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "lms"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_courses_status" ON "lms"."courses" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_enrollments_user" ON "lms"."enrollments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_lessons_course" ON "lms"."lessons" USING btree ("course_id","position");