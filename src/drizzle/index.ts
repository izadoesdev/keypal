/**
 * Drizzle schema generator for better-api-keys
 * 
 * This module provides utilities to generate Drizzle ORM schemas
 * for API key storage without manual boilerplate.
 */

export interface DrizzleSchemaOptions {
    /** Table name (default: 'apikey') */
    tableName?: string
    /** Whether to use snake_case column names (default: true) */
    snakeCase?: boolean
    /** Whether to create indexes (default: true) */
    createIndexes?: boolean
}

/**
 * Generate a Drizzle schema for API keys
 * 
 * @example
 * ```ts
 * import { createDrizzleSchema } from 'better-api-keys/drizzle'
 * 
 * export const apikey = createDrizzleSchema()
 * ```
 */
export function createDrizzleSchema(options: DrizzleSchemaOptions = {}): string {
    const tableName = options.tableName ?? 'apikey'
    const snakeCase = options.snakeCase ?? true
    const createIndexes = options.createIndexes ?? true

    const col = (name: string) => snakeCase ? name.replace(/[A-Z]/g, m => `_${m.toLowerCase()}`) : name

    let schema = `import { pgTable, text, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core'\n\n`
    schema += `export const ${tableName} = pgTable(\n`
    schema += `    '${tableName}',\n`
    schema += `    {\n`
    schema += `        id: text().primaryKey().notNull(),\n`
    schema += `        ${col('keyHash')}: text('${col('keyHash')}').notNull(),\n`
    schema += `        ${col('ownerId')}: text('${col('ownerId')}').notNull(),\n`
    schema += `        name: text('name'),\n`
    schema += `        description: text('description'),\n`
    schema += `        scopes: jsonb('scopes').default([]),\n`
    schema += `        resources: jsonb('resources').default({}),\n`
    schema += `        enabled: boolean('enabled').notNull().default(true),\n`
    schema += `        ${col('revokedAt')}: timestamp('${col('revokedAt')}', { mode: 'string' }),\n`
    schema += `        ${col('rotatedTo')}: text('${col('rotatedTo')}'),\n`
    schema += `        ${col('expiresAt')}: timestamp('${col('expiresAt')}', { mode: 'string' }),\n`
    schema += `        ${col('createdAt')}: timestamp('${col('createdAt')}', { mode: 'string' }).notNull(),\n`
    schema += `        ${col('lastUsedAt')}: timestamp('${col('lastUsedAt')}', { mode: 'string' }),\n`
    schema += `    }`

    if (createIndexes) {
        schema += `,\n    (table) => [\n`
        schema += `        index('${tableName}_${col('keyHash')}_idx').on(table.${col('keyHash')}),\n`
        schema += `        index('${tableName}_${col('ownerId')}_idx').on(table.${col('ownerId')}),\n`
        schema += `        index('${tableName}_enabled_idx').on(table.enabled),\n`
        schema += `    ]\n`
    } else {
        schema += `\n`
    }

    schema += `)\n`

    return schema
}

/**
 * Create a ready-to-use Drizzle table definition
 * This returns an actual Drizzle table that can be used directly
 * 
 * @example
 * ```ts
 * import { createApiKeyTable } from 'better-api-keys/drizzle'
 * 
 * export const apikey = createApiKeyTable()
 * ```
 */
export function createApiKeyTable(
    drizzle: {
        pgTable: any
        text: any
        boolean: any
        timestamp: any
        jsonb: any
        index: any
    },
    options: DrizzleSchemaOptions = {}
) {
    const { pgTable, text, boolean, timestamp, jsonb, index } = drizzle
    const tableName = options.tableName ?? 'apikey'
    const snakeCase = options.snakeCase ?? true
    const createIndexes = options.createIndexes ?? true

    const col = (name: string) => snakeCase ? name.replace(/[A-Z]/g, m => `_${m.toLowerCase()}`) : name

    const columns = {
        id: text().primaryKey().notNull(),
        [col('keyHash')]: text(col('key_hash')).notNull(),
        [col('ownerId')]: text(col('owner_id')).notNull(),
        name: text('name'),
        description: text('description'),
        scopes: jsonb('scopes').default([]),
        resources: jsonb('resources').default({}),
        enabled: boolean('enabled').notNull().default(true),
        [col('revokedAt')]: timestamp(col('revoked_at'), { mode: 'string' }),
        [col('rotatedTo')]: text(col('rotated_to')),
        [col('expiresAt')]: timestamp(col('expires_at'), { mode: 'string' }),
        [col('createdAt')]: timestamp(col('created_at'), { mode: 'string' }).notNull(),
        [col('lastUsedAt')]: timestamp(col('last_used_at'), { mode: 'string' }),
    }

    if (createIndexes) {
        return pgTable(
            tableName,
            columns,
            (table: any) => [
                index(`${tableName}_${col('key_hash')}_idx`).on(table[col('keyHash')]),
                index(`${tableName}_${col('owner_id')}_idx`).on(table[col('ownerId')]),
                index(`${tableName}_enabled_idx`).on(table.enabled),
            ]
        )
    }

    return pgTable(tableName, columns)
}

export { DrizzleStore } from '../storage/drizzle'

