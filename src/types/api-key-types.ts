import { Type, type Static } from 'typebox'

/**
 * Metadata associated with an API key
 */
export const ApiKeyMetadataSchema = Type.Object({
    /** Unique identifier for the key owner */
    ownerId: Type.String(),

    /** Optional human-readable name for the key */
    name: Type.Optional(Type.String()),

    /** Optional description of what this key is used for */
    description: Type.Optional(Type.String()),

    /** Scopes/permissions associated with this key */
    scopes: Type.Optional(Type.Array(Type.String())),

    /** ISO timestamp when the key expires (null if never expires) */
    expiresAt: Type.Optional(Type.Union([Type.String(), Type.Null()])),

    /** ISO timestamp when the key was created */
    createdAt: Type.Optional(Type.String()),

    /** ISO timestamp when the key was last used */
    lastUsedAt: Type.Optional(Type.String()),
})

export type ApiKeyMetadata = Static<typeof ApiKeyMetadataSchema>

/**
 * Complete API key record stored in the database
 */
export interface ApiKeyRecord {
    /** Hashed version of the API key */
    keyHash: string

    /** Unique identifier for this key record */
    id: string

    /** Metadata associated with the key */
    metadata: ApiKeyMetadata
}

/**
 * Input for creating an API key
 */
export interface CreateApiKeyInput {
    /** Optional custom prefix */
    prefix?: string

    /** Optional custom length */
    length?: number

    /** Metadata to associate with the key */
    metadata: Partial<ApiKeyMetadata>
}

