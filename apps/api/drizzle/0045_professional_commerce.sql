CREATE TABLE "professional"."events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"action" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "professional"."media" (
	"id" uuid PRIMARY KEY NOT NULL,
	"contractor_id" uuid NOT NULL,
	"service_id" uuid,
	"kind" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "professional"."messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"kind" text DEFAULT 'MESSAGE' NOT NULL,
	"body" text NOT NULL,
	"file_key" text,
	"file_name" text,
	"file_mime" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "professional"."notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"title" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "professional"."offers" (
	"service_id" uuid PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"content" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "professional_offer_status" CHECK ("professional"."offers"."status" in ('DRAFT','PUBLISHED','PAUSED'))
);
--> statement-breakpoint
CREATE TABLE "professional"."orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"contractor_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"requirements" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"proposal" jsonb,
	"payment_instructions" jsonb,
	"accepted_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"payment_reference" text,
	"refund_reference" text,
	"due_at" timestamp with time zone,
	"revisions_used" integer DEFAULT 0 NOT NULL,
	"completed_milestones" integer DEFAULT 0 NOT NULL,
	"change_request" jsonb,
	"dispute" jsonb,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "professional_order_buyer_key" UNIQUE("buyer_id","key"),
	CONSTRAINT "professional_order_counters" CHECK ("professional"."orders"."version" > 0 and "professional"."orders"."revisions_used" >= 0 and "professional"."orders"."completed_milestones" >= 0)
);
--> statement-breakpoint
CREATE TABLE "professional"."reviews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"contractor_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"comment" text NOT NULL,
	"response" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "professional_review_rating" CHECK ("professional"."reviews"."rating" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "professional"."settings" (
	"contractor_id" uuid PRIMARY KEY NOT NULL,
	"content" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "professional"."staff" (
	"contractor_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "staff_contractor_id_user_id_pk" PRIMARY KEY("contractor_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "professional"."events" ADD CONSTRAINT "events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "professional"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional"."events" ADD CONSTRAINT "events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "iam"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional"."media" ADD CONSTRAINT "media_contractor_id_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "professional"."contractors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional"."media" ADD CONSTRAINT "media_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "professional"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional"."messages" ADD CONSTRAINT "messages_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "professional"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional"."messages" ADD CONSTRAINT "messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "iam"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional"."notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "iam"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional"."notifications" ADD CONSTRAINT "notifications_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "professional"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional"."offers" ADD CONSTRAINT "offers_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "professional"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional"."orders" ADD CONSTRAINT "orders_contractor_id_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "professional"."contractors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional"."orders" ADD CONSTRAINT "orders_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "professional"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional"."orders" ADD CONSTRAINT "orders_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "iam"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional"."reviews" ADD CONSTRAINT "reviews_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "professional"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional"."reviews" ADD CONSTRAINT "reviews_contractor_id_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "professional"."contractors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional"."reviews" ADD CONSTRAINT "reviews_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "professional"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional"."reviews" ADD CONSTRAINT "reviews_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "iam"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional"."settings" ADD CONSTRAINT "settings_contractor_id_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "professional"."contractors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional"."staff" ADD CONSTRAINT "staff_contractor_id_contractors_id_fk" FOREIGN KEY ("contractor_id") REFERENCES "professional"."contractors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional"."staff" ADD CONSTRAINT "staff_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "iam"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "professional_messages_order" ON "professional"."messages" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "professional_notifications_user" ON "professional"."notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "professional_orders_contractor" ON "professional"."orders" USING btree ("contractor_id","status");--> statement-breakpoint
CREATE INDEX "professional_orders_buyer" ON "professional"."orders" USING btree ("buyer_id");