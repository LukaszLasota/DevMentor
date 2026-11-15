import { AuthRateLimitSchema } from './auth/auth-rate-limit.entity';
import { EmailVerificationTokenSchema } from './auth/email-verification-token.entity';
import { UserSchema } from './auth/user.entity';
import { InvitationSchema } from './invitations/invitation.entity';
import { MentorProfileSchema } from './mentors/mentor-profile.entity';

// Register every entity here; the list is shared by the runtime and CLI configs.
export const entities = [
  UserSchema,
  AuthRateLimitSchema,
  EmailVerificationTokenSchema,
  InvitationSchema,
  MentorProfileSchema,
];
