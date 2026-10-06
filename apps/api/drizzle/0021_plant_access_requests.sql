CREATE TABLE "iam"."plant_access_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"message" text,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"role_code" varchar(60),
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "iam"."plant_access_requests" ADD CONSTRAINT "plant_access_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "iam"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam"."plant_access_requests" ADD CONSTRAINT "plant_access_requests_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "core"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam"."plant_access_requests" ADD CONSTRAINT "plant_access_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "iam"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "plant_access_requests_pending_uq" ON "iam"."plant_access_requests" USING btree ("user_id","plant_id") WHERE "iam"."plant_access_requests"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "plant_access_requests_status_idx" ON "iam"."plant_access_requests" USING btree ("status");