import type Redis from "ioredis";
import { type Static, Type } from "typebox";
import type { Cache } from "../core/cache";
import type { Storage } from "./storage-types";

export const ConfigSchema = Type.Object({
  prefix: Type.Optional(Type.String()),
  length: Type.Optional(Type.Number({ default: 32 })),
  algorithm: Type.Optional(
    Type.Union([Type.Literal("sha256"), Type.Literal("sha512")], {
      default: "sha256",
    })
  ),
  alphabet: Type.Optional(Type.String()),
  salt: Type.Optional(Type.String()),
});

export type Config = Static<typeof ConfigSchema>;

export type ConfigInput = {
  prefix?: string;
  length?: number;
  algorithm?: "sha256" | "sha512";
  alphabet?: string;
  salt?: string;
  storage?: Storage | "memory" | "redis";
  cache?: Cache | boolean | "redis";
  cacheTtl?: number;
  headerNames?: string[];
  extractBearer?: boolean;
  redis?: Redis;
  /** TTL in seconds for revoked keys in Redis (default: 604800 = 7 days). Set to 0 to keep forever. */
  revokedKeyTtl?: number;
  /** Automatically update lastUsedAt when verifying a key (default: true) */
  autoTrackUsage?: boolean;
};
