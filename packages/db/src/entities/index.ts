import { AuthRateLimitSchema } from './auth/auth-rate-limit.entity';
import { UserSchema } from './auth/user.entity';

// Register every entity here; the list is shared by the runtime and CLI configs.
export const entities = [UserSchema, AuthRateLimitSchema];
