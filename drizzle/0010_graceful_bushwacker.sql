-- The second half of the invariant. `reserve` now covers two situations that
-- look alike and are not: a purchase agreed but not collected yet, and a unit
-- on the shelf held by a draft configuration. The reception date is what tells
-- them apart, so every status that claims the unit is here must carry one.

-- Re-run of the backfill 0009 already did, kept here so this migration stands
-- on its own: no row may reach the constraint below without a date.
UPDATE "inventory_items"
SET "received_at" = "purchase_date"
WHERE "status" NOT IN ('en_transit', 'reserve') AND "received_at" IS NULL;--> statement-breakpoint

-- Every `reserve` row predating this change was put there by a configuration or
-- a lot, which only ever held units already in hand: they get a date too, and
-- from now on only a purchase entered as « pas encore récupérée » leaves it
-- empty.
UPDATE "inventory_items"
SET "received_at" = "purchase_date"
WHERE "status" = 'reserve' AND "received_at" IS NULL;--> statement-breakpoint

ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_settled_received" CHECK ("inventory_items"."status" in ('en_transit', 'reserve') or "inventory_items"."received_at" is not null);
