import { Alert, AlertDescription } from "../ui/alert";

/** `?notice=` values a role page sends the user home with (`<required role>_only`, decision L03). */
export const ROLE_NOTICES = {
  mentee_only: "This page is for mentees.",
  mentor_only: "This page is for mentors.",
  operator_only: "This page is for operators.",
} as const;

export type RoleNoticeCode = keyof typeof ROLE_NOTICES;

export interface RoleNoticeProps {
  /** Raw `notice` search param of the page; unknown or repeated values render nothing. */
  notice: string | string[] | undefined;
}

function isRoleNotice(value: unknown): value is RoleNoticeCode {
  return typeof value === "string" && Object.hasOwn(ROLE_NOTICES, value);
}

/** Says why a signed-in user landed on their home page instead of the role page they opened (L03). */
export function RoleNotice({ notice }: RoleNoticeProps) {
  if (!isRoleNotice(notice)) {
    return null;
  }

  return (
    <Alert tone="warning">
      <AlertDescription>{ROLE_NOTICES[notice]}</AlertDescription>
    </Alert>
  );
}
