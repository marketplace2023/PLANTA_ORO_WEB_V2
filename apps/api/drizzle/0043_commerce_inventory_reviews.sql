CREATE TABLE "marketplace"."product_reviews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"listing_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"comment" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_reviews_order_product" UNIQUE("order_id","listing_id"),
	CONSTRAINT "product_reviews_rating_valid" CHECK ("marketplace"."product_reviews"."rating" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "marketplace"."variant_movements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"variant_id" uuid NOT NULL,
	"actor_id" uuid,
	"order_id" uuid,
	"stock_delta" integer DEFAULT 0 NOT NULL,
	"reserved_delta" integer DEFAULT 0 NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "marketplace"."product_reviews" ADD CONSTRAINT "product_reviews_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "marketplace"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace"."product_reviews" ADD CONSTRAINT "product_reviews_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "marketplace"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace"."product_reviews" ADD CONSTRAINT "product_reviews_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "iam"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace"."variant_movements" ADD CONSTRAINT "variant_movements_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "marketplace"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace"."variant_movements" ADD CONSTRAINT "variant_movements_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "iam"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace"."variant_movements" ADD CONSTRAINT "variant_movements_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "marketplace"."orders"("id") ON DELETE set null ON UPDATE no action;