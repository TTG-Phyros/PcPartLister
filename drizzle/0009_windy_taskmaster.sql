-- Straightens out the statuses left behind by the transitions that used to skip
-- steps, then locks the invariant they broke. Every statement is idempotent: a
-- base already consistent comes out of it untouched.

-- A unit that is not travelling was received. The date was only written from
-- the day reception existed, and the rows older than that have none — the
-- purchase date is the honest floor, and it keeps « dormant depuis » working.
UPDATE "inventory_items"
SET "received_at" = "purchase_date"
WHERE "status" <> 'en_transit' AND "received_at" IS NULL;--> statement-breakpoint

-- The other way round: a reception date is a fact, a status is a label. A row
-- claiming both is a unit that landed and was pushed back onto the road.
UPDATE "inventory_items"
SET "status" = 'en_stock', "updated_at" = now()
WHERE "status" = 'en_transit' AND "received_at" IS NOT NULL;--> statement-breakpoint

-- Units engaged in a configuration now follow it in one direction only, so any
-- row that contradicts its configuration is realigned on it — except the ones
-- still travelling, which is the whole point of the change, and the ones marked
-- dead by hand, which no configuration should silently repair.
UPDATE "inventory_items" AS i
SET "status" = (
      CASE b."status"
        WHEN 'brouillon' THEN 'reserve'
        WHEN 'montee' THEN 'monte'
        WHEN 'en_vente' THEN 'en_vente'
        WHEN 'vendue' THEN 'vendu'
      END
    )::item_status,
    "updated_at" = now()
FROM "build_items" AS bi
JOIN "builds" AS b ON b."id" = bi."build_id"
WHERE bi."inventory_item_id" = i."id"
  AND i."status" NOT IN ('en_transit', 'hs')
  AND i."status" IS DISTINCT FROM (
      CASE b."status"
        WHEN 'brouillon' THEN 'reserve'
        WHEN 'montee' THEN 'monte'
        WHEN 'en_vente' THEN 'en_vente'
        WHEN 'vendue' THEN 'vendu'
      END
    )::item_status;--> statement-breakpoint

-- Same realignment for the units held by a lot.
UPDATE "inventory_items" AS i
SET "status" = (
      CASE l."status"
        WHEN 'brouillon' THEN 'reserve'
        WHEN 'en_vente' THEN 'en_vente'
        WHEN 'vendu' THEN 'vendu'
      END
    )::item_status,
    "updated_at" = now()
FROM "lot_items" AS li
JOIN "lots" AS l ON l."id" = li."lot_id"
WHERE li."inventory_item_id" = i."id"
  AND i."status" NOT IN ('en_transit', 'hs')
  AND i."status" IS DISTINCT FROM (
      CASE l."status"
        WHEN 'brouillon' THEN 'reserve'
        WHEN 'en_vente' THEN 'en_vente'
        WHEN 'vendu' THEN 'vendu'
      END
    )::item_status;--> statement-breakpoint

-- The listing date is written with the status it belongs to: a unit announced
-- without a day gets today, and one that is neither on sale nor sold drops it.
UPDATE "inventory_items"
SET "listed_at" = CURRENT_DATE
WHERE "status" = 'en_vente' AND "listed_at" IS NULL;--> statement-breakpoint

UPDATE "inventory_items"
SET "listed_at" = NULL
WHERE "status" NOT IN ('en_vente', 'vendu') AND "listed_at" IS NOT NULL;--> statement-breakpoint

ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_transit_not_received" CHECK ("inventory_items"."status" <> 'en_transit' or "inventory_items"."received_at" is null);
