CREATE TABLE "budget"."lulo_clients" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"tax_id" text NOT NULL,
	"contact" text NOT NULL,
	"address" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lulo_client_code" UNIQUE("plant_id","code")
);
--> statement-breakpoint
CREATE TABLE "budget"."lulo_contract_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"contract_id" uuid NOT NULL,
	"source_line_id" text,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"chapter" text NOT NULL,
	"quantity" numeric(30, 8) NOT NULL,
	"price" numeric(30, 8) NOT NULL,
	"asset_id" uuid,
	CONSTRAINT "lulo_contract_item_code" UNIQUE("contract_id","code")
);
--> statement-breakpoint
CREATE TABLE "budget"."lulo_contracts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plant_id" uuid NOT NULL,
	"work_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"input" jsonb NOT NULL,
	"baseline" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lulo_contract_code" UNIQUE("plant_id","code")
);
--> statement-breakpoint
CREATE TABLE "budget"."lulo_master_imports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plant_id" uuid NOT NULL,
	"hash" text NOT NULL,
	"status" text DEFAULT 'PREVIEW' NOT NULL,
	"input" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lulo_import_fingerprint" UNIQUE("plant_id","hash")
);
--> statement-breakpoint
CREATE TABLE "budget"."lulo_measurement_assignments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"contract_id" uuid NOT NULL,
	"measurement_id" uuid NOT NULL,
	"valuation_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" numeric(30, 8) NOT NULL,
	CONSTRAINT "lulo_measurement_valuation" UNIQUE("measurement_id","valuation_id")
);
--> statement-breakpoint
CREATE TABLE "budget"."lulo_operation_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plant_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"input_hash" text NOT NULL,
	"result_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lulo_operation_request" UNIQUE("plant_id","request_id")
);
--> statement-breakpoint
CREATE TABLE "budget"."lulo_price_lists" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "lulo_price_list_code" UNIQUE("plant_id","code")
);
--> statement-breakpoint
CREATE TABLE "budget"."lulo_resource_prices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plant_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"amount" numeric(30, 8) NOT NULL,
	"base_date" text NOT NULL,
	"valid_until" text NOT NULL,
	"unit" text NOT NULL,
	"cost_basis" text NOT NULL,
	"evidence" text NOT NULL,
	"supplier" text NOT NULL,
	"zero_reason" text NOT NULL,
	"revision" integer NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lulo_resource_price_version" UNIQUE("list_id","resource_id","base_date","revision")
);
--> statement-breakpoint
CREATE TABLE "budget"."lulo_work_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"contract_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"reference" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"predecessor_id" uuid,
	"payload" jsonb NOT NULL,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"created_by" uuid NOT NULL,
	"approved_by" uuid,
	"issued_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lulo_work_record_code" UNIQUE("contract_id","code"),
	CONSTRAINT "lulo_work_record_reference" UNIQUE("contract_id","kind","reference")
);
--> statement-breakpoint
CREATE TABLE "budget"."lulo_works" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plant_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"location" text NOT NULL,
	"contract_reference" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lulo_work_code" UNIQUE("plant_id","code")
);
--> statement-breakpoint
ALTER TABLE "budget"."lulo_clients" ADD CONSTRAINT "lulo_clients_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "core"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."lulo_contract_items" ADD CONSTRAINT "lulo_contract_items_contract_id_lulo_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "budget"."lulo_contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."lulo_contracts" ADD CONSTRAINT "lulo_contracts_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "core"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."lulo_contracts" ADD CONSTRAINT "lulo_contracts_work_id_lulo_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "budget"."lulo_works"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."lulo_contracts" ADD CONSTRAINT "lulo_contracts_document_id_lulo_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "budget"."lulo_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."lulo_master_imports" ADD CONSTRAINT "lulo_master_imports_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "core"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."lulo_measurement_assignments" ADD CONSTRAINT "lulo_measurement_assignments_contract_id_lulo_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "budget"."lulo_contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."lulo_measurement_assignments" ADD CONSTRAINT "lulo_measurement_assignments_measurement_id_lulo_work_records_id_fk" FOREIGN KEY ("measurement_id") REFERENCES "budget"."lulo_work_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."lulo_measurement_assignments" ADD CONSTRAINT "lulo_measurement_assignments_valuation_id_lulo_work_records_id_fk" FOREIGN KEY ("valuation_id") REFERENCES "budget"."lulo_work_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."lulo_measurement_assignments" ADD CONSTRAINT "lulo_measurement_assignments_item_id_lulo_contract_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "budget"."lulo_contract_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."lulo_operation_requests" ADD CONSTRAINT "lulo_operation_requests_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "core"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."lulo_price_lists" ADD CONSTRAINT "lulo_price_lists_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "core"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."lulo_resource_prices" ADD CONSTRAINT "lulo_resource_prices_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "core"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."lulo_resource_prices" ADD CONSTRAINT "lulo_resource_prices_list_id_lulo_price_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "budget"."lulo_price_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."lulo_work_records" ADD CONSTRAINT "lulo_work_records_contract_id_lulo_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "budget"."lulo_contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."lulo_works" ADD CONSTRAINT "lulo_works_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "core"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget"."lulo_works" ADD CONSTRAINT "lulo_works_client_id_lulo_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "budget"."lulo_clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lulo_contract_work" ON "budget"."lulo_contracts" USING btree ("plant_id","work_id");--> statement-breakpoint
CREATE INDEX "lulo_measurement_consumption" ON "budget"."lulo_measurement_assignments" USING btree ("contract_id","measurement_id");--> statement-breakpoint
CREATE INDEX "lulo_price_resolution" ON "budget"."lulo_resource_prices" USING btree ("list_id","resource_id","base_date");--> statement-breakpoint
CREATE INDEX "lulo_work_record_query" ON "budget"."lulo_work_records" USING btree ("contract_id","kind","status");