CREATE TYPE "public"."sale_shipping_method" AS ENUM('main_propre', 'mondial_relay', 'colissimo', 'chronopost', 'relais_colis', 'shop2shop', 'lettre_suivie', 'autre');--> statement-breakpoint
ALTER TYPE "public"."build_status" ADD VALUE 'en_vente';--> statement-breakpoint
ALTER TYPE "public"."item_status" ADD VALUE 'en_vente';--> statement-breakpoint
ALTER TABLE "sales" ALTER COLUMN "build_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "builds" ADD COLUMN "listed_at" date;--> statement-breakpoint
ALTER TABLE "builds" ADD COLUMN "asking_price_cents" integer;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "listed_at" date;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "asking_price_cents" integer;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "inventory_item_id" uuid;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "shipping_method" "sale_shipping_method" DEFAULT 'main_propre' NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "tracking_number" text;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sales_inventory_idx" ON "sales" USING btree ("inventory_item_id");--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_one_subject" CHECK (("sales"."build_id" is not null) <> ("sales"."inventory_item_id" is not null));