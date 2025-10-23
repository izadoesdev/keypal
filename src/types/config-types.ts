import { Type, type Static } from 'typebox'

export const ConfigSchema = Type.Object({
    prefix: Type.Optional(Type.String()),
    length: Type.Optional(Type.Number({ default: 32 })),
    algorithm: Type.Optional(Type.Union([
        Type.Literal('sha256'),
        Type.Literal('sha512'),
    ], { default: 'sha256' })),
    alphabet: Type.Optional(Type.String()),
    salt: Type.Optional(Type.String()),
})

export type Config = Static<typeof ConfigSchema>

export interface ConfigInput {
    prefix?: string
    length?: number
    algorithm?: 'sha256' | 'sha512'
    alphabet?: string
    salt?: string
}
