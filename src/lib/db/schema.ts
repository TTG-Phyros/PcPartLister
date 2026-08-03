import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
// Relative import on purpose: drizzle-kit compiles this file outside the
// Next.js resolver and does not honour the "@/" tsconfig alias.
import { COMPONENT_CATEGORIES, type ComponentSpecs } from '../specs';

/* ─────────────────────────── Enums ─────────────────────────── */

export const componentCategoryEnum = pgEnum('component_category', COMPONENT_CATEGORIES);

export const userRoleEnum = pgEnum('user_role', ['admin', 'user']);

export const purchasePlatformEnum = pgEnum('purchase_platform', [
  'vinted',
  'leboncoin',
  'facebook',
  'autre',
  // Appended, never inserted in the middle: Postgres enums only grow at the end
  // unless the type is recreated. The display order lives in the UI labels.
  'main_propre',
  'amazon',
]);

/** Carrier of an incoming parcel, used to build the tracking link. */
export const shippingCarrierEnum = pgEnum('shipping_carrier', [
  'mondial_relay',
  'colissimo',
  'chronopost',
  'relais_colis',
  'dpd',
  'gls',
  'ups',
  'dhl',
  'fedex',
  'autre',
]);

export const itemConditionEnum = pgEnum('item_condition', [
  'neuf',
  'tres_bon',
  'bon',
  'defectueux',
  'a_tester',
]);

export const itemStatusEnum = pgEnum('item_status', [
  'en_stock',
  'reserve',
  'monte',
  'vendu',
  'hs',
  /** Paid for, not received yet: the unit exists on paper but not on the shelf. */
  'en_transit',
]);

export const buildStatusEnum = pgEnum('build_status', ['brouillon', 'montee', 'vendue']);

/* ─────────────────────────── Auth ─────────────────────────── */

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: userRoleEnum('role').notNull().default('user'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('users_email_lower_idx').on(sql`lower(${t.email})`)],
);

/** `id` holds the SHA-256 of the session token; the raw token only lives in the cookie. */
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    ip: text('ip'),
    userAgent: text('user_agent'),
  },
  (t) => [
    index('sessions_user_id_idx').on(t.userId),
    index('sessions_expires_at_idx').on(t.expiresAt),
  ],
);

/** Sliding-window rate limiting on the login route. */
export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ip: text('ip').notNull(),
    email: text('email'),
    success: boolean('success').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('login_attempts_ip_created_idx').on(t.ip, t.createdAt)],
);

/* ─────────────────────────── Settings ─────────────────────────── */

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ─────────────────────────── Catalog ─────────────────────────── */

export const catalogComponents = pgTable(
  'catalog_components',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    category: componentCategoryEnum('category').notNull(),
    brand: text('brand').notNull(),
    model: text('model').notNull(),
    specs: jsonb('specs').$type<ComponentSpecs>().notNull(),
    /** Path relative to IMAGES_DIR, served by /api/images/<path>. */
    imagePath: text('image_path'),
    msrpCents: integer('msrp_cents'),
    releaseYear: integer('release_year'),
    /** Stable key from data/seed/catalog.json; NULL for user-created entries. */
    seedKey: text('seed_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('catalog_natural_key_idx').on(
      t.category,
      sql`lower(${t.brand})`,
      sql`lower(${t.model})`,
    ),
    uniqueIndex('catalog_seed_key_idx').on(t.seedKey),
    index('catalog_category_idx').on(t.category),
  ],
);

/* ─────────────────────────── Inventory ─────────────────────────── */

export const inventoryItems = pgTable(
  'inventory_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    catalogComponentId: uuid('catalog_component_id')
      .notNull()
      .references(() => catalogComponents.id, { onDelete: 'restrict' }),
    purchasePriceCents: integer('purchase_price_cents').notNull(),
    purchaseDate: date('purchase_date').notNull(),
    platform: purchasePlatformEnum('platform').notNull().default('autre'),
    listingUrl: text('listing_url'),
    condition: itemConditionEnum('condition').notNull().default('bon'),
    status: itemStatusEnum('status').notNull().default('en_stock'),
    /* Parcel tracking, only meaningful while the unit is `en_transit`. */
    shippingCarrier: shippingCarrierEnum('shipping_carrier'),
    trackingNumber: text('tracking_number'),
    /** Explicit tracking link; when empty the carrier + number build one. */
    trackingUrl: text('tracking_url'),
    expectedArrival: date('expected_arrival'),
    receivedAt: date('received_at'),
    serialNumber: text('serial_number'),
    notes: text('notes'),
    /** Stable key from data/seed/stock.json; NULL for units created in the app. */
    seedKey: text('seed_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('inventory_seed_key_idx').on(t.seedKey),
    index('inventory_status_idx').on(t.status),
    index('inventory_catalog_idx').on(t.catalogComponentId),
    index('inventory_purchase_date_idx').on(t.purchaseDate),
    index('inventory_expected_arrival_idx').on(t.expectedArrival),
    check('inventory_price_non_negative', sql`${t.purchasePriceCents} >= 0`),
  ],
);

/* ─────────────────────────── Builds ─────────────────────────── */

export const builds = pgTable(
  'builds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    status: buildStatusEnum('status').notNull().default('brouillon'),
    /** Thermal paste, screws, cable ties... */
    consumablesCents: integer('consumables_cents').notNull().default(0),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('builds_status_idx').on(t.status)],
);

/**
 * One line of a build. Either an owned unit (`inventoryItemId`) or a catalog
 * model still to be bought (`catalogComponentId` + `estimatedPriceCents`).
 */
export const buildItems = pgTable(
  'build_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buildId: uuid('build_id')
      .notNull()
      .references(() => builds.id, { onDelete: 'cascade' }),
    slot: componentCategoryEnum('slot').notNull(),
    inventoryItemId: uuid('inventory_item_id').references(() => inventoryItems.id, {
      onDelete: 'restrict',
    }),
    catalogComponentId: uuid('catalog_component_id').references(() => catalogComponents.id, {
      onDelete: 'restrict',
    }),
    estimatedPriceCents: integer('estimated_price_cents'),
    quantity: integer('quantity').notNull().default(1),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('build_items_build_idx').on(t.buildId),
    uniqueIndex('build_items_inventory_idx').on(t.inventoryItemId),
    check(
      'build_items_one_source',
      sql`(${t.inventoryItemId} is not null) <> (${t.catalogComponentId} is not null)`,
    ),
    check('build_items_quantity_positive', sql`${t.quantity} > 0`),
  ],
);

/* ─────────────────────────── Sales ─────────────────────────── */

export const sales = pgTable(
  'sales',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buildId: uuid('build_id')
      .notNull()
      .references(() => builds.id, { onDelete: 'cascade' }),
    salePriceCents: integer('sale_price_cents').notNull(),
    saleDate: date('sale_date').notNull(),
    platform: purchasePlatformEnum('platform').notNull().default('autre'),
    shippingCostCents: integer('shipping_cost_cents').notNull().default(0),
    platformFeeCents: integer('platform_fee_cents').notNull().default(0),
    buyerNotes: text('buyer_notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('sales_build_idx').on(t.buildId),
    index('sales_date_idx').on(t.saleDate),
    check('sales_price_non_negative', sql`${t.salePriceCents} >= 0`),
  ],
);

/* ─────────────────────────── Inferred types ─────────────────────────── */

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type CatalogComponent = typeof catalogComponents.$inferSelect;
export type NewCatalogComponent = typeof catalogComponents.$inferInsert;
export type InventoryItem = typeof inventoryItems.$inferSelect;
export type NewInventoryItem = typeof inventoryItems.$inferInsert;
export type Build = typeof builds.$inferSelect;
export type BuildItem = typeof buildItems.$inferSelect;
export type Sale = typeof sales.$inferSelect;
