ALTER TABLE "lms"."courses" ADD COLUMN "price" numeric(18, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "lms"."courses" ADD COLUMN "currency" varchar(3) DEFAULT 'USD' NOT NULL;