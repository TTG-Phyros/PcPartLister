CREATE TYPE "public"."build_status" AS ENUM('brouillon', 'montee', 'vendue');--> statement-breakpoint
CREATE TYPE "public"."component_category" AS ENUM('cpu', 'motherboard', 'ram', 'gpu', 'storage', 'psu', 'case', 'cooling', 'misc');--> statement-breakpoint
CREATE TYPE "public"."item_condition" AS ENUM('neuf', 'tres_bon', 'bon', 'defectueux', 'a_tester');--> statement-breakpoint
CREATE TYPE "public"."item_status" AS ENUM('en_stock', 'reserve', 'monte', 'vendu', 'hs');--> statement-breakpoint
CREATE TYPE "public"."purchase_platform" AS ENUM('vinted', 'leboncoin', 'facebook', 'autre');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'user');--> statement-breakpoint
CREATE TABLE "build_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"build_id" uuid NOT NULL,
	"slot" "component_category" NOT NULL,
	"inventory_item_id" uuid,
	"catalog_component_id" uuid,
	"estimated_price_cents" integer,
	"quantity" integer DEFAULT 1 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "build_items_one_source" CHECK (("build_items"."inventory_item_id" is not null) <> ("build_items"."catalog_component_id" is not null)),
	CONSTRAINT "build_items_quantity_positive" CHECK ("build_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "builds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"status" "build_status" DEFAULT 'brouillon' NOT NULL,
	"consumables_cents" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" "component_category" NOT NULL,
	"brand" text NOT NULL,
	"model" text NOT NULL,
	"specs" jsonb NOT NULL,
	"image_path" text,
	"msrp_cents" integer,
	"release_year" integer,
	"seed_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalog_component_id" uuid NOT NULL,
	"purchase_price_cents" integer NOT NULL,
	"purchase_date" date NOT NULL,
	"platform" "purchase_platform" DEFAULT 'autre' NOT NULL,
	"listing_url" text,
	"condition" "item_condition" DEFAULT 'bon' NOT NULL,
	"status" "item_status" DEFAULT 'en_stock' NOT NULL,
	"serial_number" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_price_non_negative" CHECK ("inventory_items"."purchase_price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip" text NOT NULL,
	"email" text,
	"success" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"build_id" uuid NOT NULL,
	"sale_price_cents" integer NOT NULL,
	"sale_date" date NOT NULL,
	"platform" "purchase_platform" DEFAULT 'autre' NOT NULL,
	"shipping_cost_cents" integer DEFAULT 0 NOT NULL,
	"platform_fee_cents" integer DEFAULT 0 NOT NULL,
	"buyer_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_price_non_negative" CHECK ("sales"."sale_price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "build_items" ADD CONSTRAINT "build_items_build_id_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."builds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_items" ADD CONSTRAINT "build_items_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_items" ADD CONSTRAINT "build_items_catalog_component_id_catalog_components_id_fk" FOREIGN KEY ("catalog_component_id") REFERENCES "public"."catalog_components"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_catalog_component_id_catalog_components_id_fk" FOREIGN KEY ("catalog_component_id") REFERENCES "public"."catalog_components"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_build_id_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."builds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "build_items_build_idx" ON "build_items" USING btree ("build_id");--> statement-breakpoint
CREATE UNIQUE INDEX "build_items_inventory_idx" ON "build_items" USING btree ("inventory_item_id");--> statement-breakpoint
CREATE INDEX "builds_status_idx" ON "builds" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_natural_key_idx" ON "catalog_components" USING btree ("category",lower("brand"),lower("model"));--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_seed_key_idx" ON "catalog_components" USING btree ("seed_key");--> statement-breakpoint
CREATE INDEX "catalog_category_idx" ON "catalog_components" USING btree ("category");--> statement-breakpoint
CREATE INDEX "inventory_status_idx" ON "inventory_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "inventory_catalog_idx" ON "inventory_items" USING btree ("catalog_component_id");--> statement-breakpoint
CREATE INDEX "inventory_purchase_date_idx" ON "inventory_items" USING btree ("purchase_date");--> statement-breakpoint
CREATE INDEX "login_attempts_ip_created_idx" ON "login_attempts" USING btree ("ip","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_build_idx" ON "sales" USING btree ("build_id");--> statement-breakpoint
CREATE INDEX "sales_date_idx" ON "sales" USING btree ("sale_date");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_idx" ON "users" USING btree (lower("email"));