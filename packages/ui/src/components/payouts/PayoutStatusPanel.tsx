import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

export type PayoutState =
  | { kind: "none" }
  | { kind: "action_required"; guidance: string[] }
  | { kind: "pending_verification" }
  | { kind: "enabled" }
  | { kind: "restricted"; guidance: string[] }
  | { kind: "failed" };

export interface PayoutStatusPanelProps {
  state: PayoutState;
  onStart: () => void;
  onRefresh: () => void;
}

/**
 * /mentor/payouts (spec #26, release 1.1): one state at a time, guidance in plain words (never raw
 * Stripe field names), Refresh status everywhere. Copy not given by the spec was approved 2026-10-22.
 */
export function PayoutStatusPanel({ state, onStart, onRefresh }: PayoutStatusPanelProps) {
  return (
    <section aria-labelledby="payouts-title" className="flex max-w-measure flex-col gap-paragraph">
      <h1 id="payouts-title" className="text-heading-2 font-semibold">
        Payouts
      </h1>

      {state.kind === "none" ? (
        <>
          <p className="text-body-small text-muted-foreground">
            You need payouts to receive money for sessions. Publishing your page and taking bookings do not need it.
          </p>
          <Button intent="primary" appearance="filled" className="self-start" onClick={onStart}>
            Set up payouts
          </Button>
        </>
      ) : null}

      {state.kind === "enabled" ? <Badge tone="success">Payouts enabled</Badge> : null}
      {state.kind === "pending_verification" ? <Badge tone="warning">Stripe is checking your details</Badge> : null}

      {state.kind === "action_required" || state.kind === "restricted" ? (
        <Alert tone="warning">
          <AlertTitle>{state.kind === "restricted" ? "Payouts are paused" : "Stripe needs a few more details"}</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-paragraph">
              {state.guidance.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <Button size="sm" onClick={onStart}>
              Continue onboarding
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {state.kind === "failed" ? (
        <Alert tone="danger">
          <AlertDescription>We could not set up payouts — contact us.</AlertDescription>
        </Alert>
      ) : null}

      {state.kind === "none" ? null : (
        <Button appearance="text" size="sm" className="self-start" onClick={onRefresh}>
          Refresh status
        </Button>
      )}
    </section>
  );
}
