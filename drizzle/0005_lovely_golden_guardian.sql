CREATE TYPE "public"."lot_status" AS ENUM('brouillon', 'en_vente', 'vendu');--> statement-breakpoint
CREATE TABLE "lot_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lot_id" uuid NOT NULL,
	"inventory_item_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"status" "lot_status" DEFAULT 'brouillon' NOT NULL,
	"listed_at" date,
	"asking_price_cents" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales" DROP CONSTRAINT "sales_one_subject";--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "lot_id" uuid;--> statement-breakpoint
ALTER TABLE "lot_items" ADD CONSTRAINT "lot_items_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_items" ADD CONSTRAINT "lot_items_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lot_items_lot_idx" ON "lot_items" USING btree ("lot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lot_items_inventory_idx" ON "lot_items" USING btree ("inventory_item_id");--> statement-breakpoint
CREATE INDEX "lots_status_idx" ON "lots" USING btree ("status");--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sales_lot_idx" ON "sales" USING btree ("lot_id");--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_one_subject" CHECK (num_nonnulls("sales"."build_id", "sales"."lot_id", "sales"."inventory_item_id") = 1);