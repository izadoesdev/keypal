import { pgTable, text, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core'

export const apikey = pgTable(
    'apikey',
    {
        id: text().primaryKey().notNull(),
        keyHash: text('key_hash').notNull(),
        ownerId: text('owner_id').notNull(),
        name: text('name'),
        description: text('description'),
        scopes: jsonb('scopes').default([]),
        enabled: boolean('enabled').notNull().default(true),
        revokedAt: timestamp('revoked_at', { mode: 'string' }),
        rotatedTo: text('rotated_to'),
        expiresAt: timestamp('expires_at', { mode: 'string' }),
        createdAt: timestamp('created_at', { mode: 'string' }).notNull(),
        lastUsedAt: timestamp('last_used_at', { mode: 'string' }),
    },
    (table) => [
        index('apikey_key_hash_idx').on(table.keyHash),
        index('apikey_owner_id_idx').on(table.ownerId),
        index('apikey_enabled_idx').on(table.enabled),
    ]
)

