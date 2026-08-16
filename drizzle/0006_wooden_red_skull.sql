CREATE TABLE "purchase_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"total_price_cents" integer NOT NULL,
	"purchase_date" date NOT NULL,
	"platform" "purchase_platform" DEFAULT 'autre' NOT NULL,
	"listing_url" text,
	"shipping_carrier" "shipping_carrier",
	"tracking_number" text,
	"tracking_url" text,
	"expected_arrival" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_batches_total_non_negative" CHECK ("purchase_batches"."total_price_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "purchase_batch_id" uuid;--> statement-breakpoint
CREATE INDEX "purchase_batches_date_idx" ON "purchase_batches" USING btree ("purchase_date");--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_purchase_batch_id_purchase_batches_id_fk" FOREIGN KEY ("purchase_batch_id") REFERENCES "public"."purchase_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_purchase_batch_idx" ON "inventory_items" USING btree ("purchase_batch_id");