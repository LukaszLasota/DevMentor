import { defineEntity, p } from '@mikro-orm/postgresql';

/**
 * One fixed rate-limit window per key (`<action>:<email|ip>:<sha256hex>`, no PII). Written only by
 * the parameterized upsert in `core/src/security/rate-limit.ts`; the entity exists for the schema,
 * migrations and the snapshot. The one table with a natural text key and no timestamp columns.
 */
export const AuthRateLimitSchema = defineEntity({
  name: 'AuthRateLimit',
  tableName: 'auth_rate_limits',
  properties: {
    key: p.text().primary(),
    windowStart: p.datetime(),
    count: p.integer(),
  },
});

export class AuthRateLimit extends AuthRateLimitSchema.class {}

AuthRateLimitSchema.setClass(AuthRateLimit);
