ALTER TABLE "inventory_items" ADD COLUMN "seed_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_seed_key_idx" ON "inventory_items" USING btree ("seed_key");