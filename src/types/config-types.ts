import { Type, type Static } from 'typebox'

/**
 * Configuration for the API Key Manager
 */
export const ConfigSchema = Type.Object({
    /** Optional prefix for generated keys (e.g., "sk_live_") */
    prefix: Type.Optional(Type.String()),

    length: Type.Optional(Type.Number({ default: 32 })),

    algorithm: Type.Optional(Type.Union([
        Type.Literal('sha256'),
        Type.Literal('sha512'),
    ], { default: 'sha256' })),
})

export type Config = Static<typeof ConfigSchema>

export interface ConfigInput {
    prefix?: string
    length?: number
    algorithm?: 'sha256' | 'sha512'
}

