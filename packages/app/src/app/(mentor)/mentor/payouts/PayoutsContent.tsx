import { withScope } from "@devmentor/core";
import { type ConnectView, isAppError } from "@devmentor/core/http";
import { Alert, AlertDescription, AlertTitle, EmptyState, LocalTime } from "@devmentor/ui";
import { requirePageRole } from "@/lib/session";
import { ConnectActions } from "./ConnectActions";

const STATE: Record<NonNullable<ConnectView["onboardingStatus"]>, { title: string; text: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  enabled: { title: "Payouts enabled", text: "Each finished session is paid to your Stripe account, minus the 20% platform fee.", tone: "success" },
  action_required: { title: "Stripe needs more details", text: "Continue onboarding to finish setting up payouts.", tone: "warning" },
  pending_verification: { title: "Stripe is verifying your details", text: "This can take a while. Refresh the status later.", tone: "neutral" },
  restricted: { title: "Payouts are restricted", text: "Stripe has limited this account. Contact us and we will help.", tone: "danger" },
};

/** The mentor's own Connect state, or `null` without a mentor profile (404 from the service). */
async function loadOwn(userId: string): Promise<ConnectView | null> {
  try {
    return await withScope(({ connectService }) => connectService.getOwn(userId));
  } catch (error) {
    if (isAppError(error) && error.status === 404) {
      return null;
    }

    throw error;
  }
}

/**
 * /mentor/payouts body, mentors only (spec 2026-11-21-mentor-payouts, #26): Stripe Connect onboarding
 * and its normalized state. Payouts are optional for publishing and being booked (issue criterion 2).
 */
export async function PayoutsContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePageRole("/mentor/payouts", "mentor");
  const [own, { connect }] = await Promise.all([loadOwn(user.id), searchParams]);

  if (own === null) {
    return (
      <>
        <h1 className="text-heading-1 font-semibold">Payouts</h1>
        <EmptyState title="You have no mentor page yet" description="A page is created when you accept a mentor invitation. Ask the operator for one." />
      </>
    );
  }

  const state = own.onboardingStatus === null ? null : STATE[own.onboardingStatus];

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-heading-1 font-semibold">Payouts</h1>
        <p className="text-muted-foreground">Payouts go to your own Stripe account. You can publish times and be booked without it.</p>
      </div>
      {connect === "return" ? (
        <p role="status" className="text-body-small text-muted-foreground">
          Stripe can take a minute to confirm your details — refresh the status shortly.
        </p>
      ) : connect === "reauth" ? (
        <p role="status" className="text-body-small text-muted-foreground">
          The Stripe link expired. Continue onboarding to get a new one.
        </p>
      ) : null}
      {state === null ? null : (
        <Alert tone={state.tone}>
          <AlertTitle>{state.title}</AlertTitle>
          <AlertDescription>
            <p>{state.text}</p>
            {own.lastReconciledAt === null ? null : (
              <p className="text-caption text-muted-foreground">
                Checked <LocalTime iso={own.lastReconciledAt} />
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}
      <ConnectActions status={own.onboardingStatus} />
    </>
  );
}
