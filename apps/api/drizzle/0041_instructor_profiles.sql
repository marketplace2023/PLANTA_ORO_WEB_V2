CREATE TABLE "lms"."instructor_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"headline" varchar(200),
	"bio" text,
	"avatar_key" text,
	"avatar_mime" varchar(100),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lms"."courses" ADD COLUMN "instructor_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "lms"."instructor_profiles" ADD CONSTRAINT "instructor_profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "iam"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms"."courses" ADD CONSTRAINT "courses_instructor_profile_id_instructor_profiles_id_fk" FOREIGN KEY ("instructor_profile_id") REFERENCES "lms"."instructor_profiles"("id") ON DELETE set null ON UPDATE no action;