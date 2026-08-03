CREATE TYPE "public"."shipping_carrier" AS ENUM('mondial_relay', 'colissimo', 'chronopost', 'relais_colis', 'dpd', 'gls', 'ups', 'dhl', 'fedex', 'autre');--> statement-breakpoint
ALTER TYPE "public"."item_status" ADD VALUE 'en_transit';--> statement-breakpoint
ALTER TYPE "public"."purchase_platform" ADD VALUE 'main_propre';--> statement-breakpoint
ALTER TYPE "public"."purchase_platform" ADD VALUE 'amazon';--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "shipping_carrier" "shipping_carrier";--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "tracking_number" text;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "tracking_url" text;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "expected_arrival" date;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "received_at" date;--> statement-breakpoint
CREATE INDEX "inventory_expected_arrival_idx" ON "inventory_items" USING btree ("expected_arrival");