CREATE TABLE "marketplace"."product_images" (
	"id" uuid PRIMARY KEY NOT NULL,
	"listing_id" uuid NOT NULL,
	"key" text NOT NULL,
	"mime" varchar(100) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace"."product_variants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"listing_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"sku" varchar(80) NOT NULL,
	"name" varchar(160) NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"price" numeric(18, 2) NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "product_variants_provider_sku" UNIQUE("provider_id","sku"),
	CONSTRAINT "product_variants_stock_valid" CHECK ("marketplace"."product_variants"."stock" >= 0 and "marketplace"."product_variants"."reserved" >= 0 and "marketplace"."product_variants"."reserved" <= "marketplace"."product_variants"."stock"),
	CONSTRAINT "product_variants_price_valid" CHECK ("marketplace"."product_variants"."price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "marketplace"."order_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"status" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace"."order_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"title" text NOT NULL,
	"sku" text NOT NULL,
	"variant_name" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(18, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace"."orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"status" varchar(30) DEFAULT 'PENDING_PAYMENT' NOT NULL,
	"currency" varchar(3) NOT NULL,
	"total" numeric(18, 2) NOT NULL,
	"shipping_fee" numeric(18, 2) NOT NULL,
	"address" jsonb NOT NULL,
	"payment_instructions" jsonb NOT NULL,
	"payment_reference" text,
	"receipt_key" text,
	"receipt_mime" text,
	"tracking" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_orders_buyer_key" UNIQUE("buyer_id","idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "marketplace"."shop_settings" (
	"provider_id" uuid PRIMARY KEY NOT NULL,
	"bank" text NOT NULL,
	"beneficiary" text NOT NULL,
	"account" text NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"currency" varchar(3) NOT NULL,
	"shipping_fee" numeric(18, 2) DEFAULT '0' NOT NULL,
	"coverage" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "marketplace"."listings" ADD COLUMN "commercial" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "marketplace"."product_images" ADD CONSTRAINT "product_images_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "marketplace"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace"."product_variants" ADD CONSTRAINT "product_variants_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "marketplace"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace"."product_variants" ADD CONSTRAINT "product_variants_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "provider"."providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace"."order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "marketplace"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace"."order_events" ADD CONSTRAINT "order_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "iam"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace"."order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "marketplace"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace"."order_lines" ADD CONSTRAINT "order_lines_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "marketplace"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace"."order_lines" ADD CONSTRAINT "order_lines_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "marketplace"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace"."orders" ADD CONSTRAINT "orders_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "provider"."providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace"."orders" ADD CONSTRAINT "orders_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "iam"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace"."shop_settings" ADD CONSTRAINT "shop_settings_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "provider"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shop_orders_provider_status" ON "marketplace"."orders" USING btree ("provider_id","status");