import { withScope } from "@devmentor/core";
import { ResolveReportButton } from "./ResolveReportButton";
import { Badge, EmptyState, LocalTime, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@devmentor/ui";

/**
 * /admin "Reported bookings" (spec 2026-11-20-booking-cancellation, phase 2, AC3): every dispute a
 * mentee reported, newest first. The operator decides by hand and replies by email; nothing here
 * refunds (R10, R16). Rendered behind the page's operator guard; the message is shown only here.
 */
export async function ReportsPanel() {
  const reports = await withScope(({ bookingReportService }) => bookingReportService.list());

  return (
    <section aria-labelledby="reports-heading" className="flex flex-col gap-related">
      <h2 id="reports-heading" className="text-heading-3 font-semibold">
        Reported bookings
      </h2>
      {reports.length === 0 ? (
        <EmptyState title="No reports." description="When a mentee reports a problem with a booking, it shows up here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reported</TableHead>
              <TableHead>Session</TableHead>
              <TableHead>Mentee</TableHead>
              <TableHead>Mentor</TableHead>
              <TableHead>Booking</TableHead>
              <TableHead>Message</TableHead>
              <TableHead>
                <span className="sr-only">Resolution</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports.map((report) => (
              <TableRow key={report.reportId}>
                <TableCell>
                  <LocalTime iso={report.createdAt} />
                </TableCell>
                <TableCell>
                  <LocalTime iso={report.startsAt} />
                </TableCell>
                <TableCell>{report.menteeEmail}</TableCell>
                <TableCell>{report.mentorName}</TableCell>
                <TableCell className="font-mono text-body-small">
                  {report.bookingId} ({report.bookingStatus})
                </TableCell>
                <TableCell className="max-w-prose whitespace-pre-wrap">{report.message}</TableCell>
                <TableCell className="text-right">
                  {report.resolvedAt === null ? <ResolveReportButton reportId={report.reportId} /> : <Badge tone="success">Resolved</Badge>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
