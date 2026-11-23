import { z } from 'zod';
import type { ReleaseResult } from '../services/payments/payout.service';
import type { ConnectView } from '../services/payments/connect.service';
import { REPORT_NOT_FOUND_MESSAGE } from '../services/bookings/booking-report.service';
import type { HandlerArgs, RouteParams } from './apiHandler';
import { requireRole, requireSession } from './auth';
import { NotFoundError } from './errors';
import { requireMentor } from './mentors';

// Payout routes (spec 2026-11-21-mentor-payouts) as `apiHandler` handlers. The mentor routes take no id:
// the account is always the session user's own. Release and report resolution are operator-only (R16).

/** `POST /api/mentors/me/connect/start` → `{ url }`: a fresh Stripe onboarding link for the browser. */
export async function startConnect({ req, cradle }: HandlerArgs<RouteParams>): Promise<{ url: string }> {
  const user = await requireMentor(req, cradle);

  return cradle.connectService.start(user.id);
}

/** `POST /api/mentors/me/connect/refresh` → the mentor's Connect state, re-read at Stripe. */
export async function refreshConnect({ req, cradle }: HandlerArgs<RouteParams>): Promise<ConnectView> {
  const user = await requireMentor(req, cradle);

  return cradle.connectService.refresh(user.id);
}

/** `POST /api/admin/payouts/release` → what this run did (at most 25 bookings). */
export async function releasePayouts({ req, cradle }: HandlerArgs<RouteParams>): Promise<ReleaseResult> {
  const operator = await requireSession(req, cradle);
  requireRole(operator, 'operator');
  const result = await cradle.payoutService.releaseDue();
  // T-14: every operator money action names the operator (no PII, ids only).
  cradle.logger.info({ operator: { id: operator.id }, action: 'payouts.release', result }, 'Operator action');

  return result;
}

/** Route params of `/api/admin/reports/[id]/resolve`. */
export type ReportIdParams = { id: string };

/** `POST /api/admin/reports/[id]/resolve` → `{ resolvedAt }`; the booking's payout may be released again. */
export async function resolveReport({ req, params, cradle }: HandlerArgs<ReportIdParams>): Promise<{ resolvedAt: string }> {
  const operator = await requireSession(req, cradle);
  requireRole(operator, 'operator');

  if (!z.uuid().safeParse(params.id).success) {
    throw new NotFoundError(REPORT_NOT_FOUND_MESSAGE);
  }

  const result = await cradle.bookingReportService.resolve(operator.id, params.id);
  // T-14: every operator money action names the operator (no PII, ids only).
  cradle.logger.info({ operator: { id: operator.id }, action: 'report.resolve', report: { id: params.id } }, 'Operator action');

  return result;
}
