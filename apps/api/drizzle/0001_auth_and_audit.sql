CREATE SCHEMA "audit";
--> statement-breakpoint
CREATE TABLE "iam"."refresh_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"user_agent" text,
	"ip" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "audit"."events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	"plant_id" uuid,
	"module" varchar(60) NOT NULL,
	"entity_type" varchar(60) NOT NULL,
	"entity_id" uuid,
	"action" varchar(60) NOT NULL,
	"old_data" jsonb,
	"new_data" jsonb,
	"ip_address" "inet",
	"user_agent" text,
	"correlation_id" uuid
);
--> statement-breakpoint
ALTER TABLE "iam"."refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "iam"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_plant_time" ON "audit"."events" USING btree ("plant_id","occurred_at" DESC NULLS LAST);