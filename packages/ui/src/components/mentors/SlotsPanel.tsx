"use client";

import { Badge } from "../ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { EmptyState } from "../../backend/feedback/EmptyState";
import { Field } from "../../backend/forms/Field";
import { formatInstant, LocalTime } from "../../time/LocalTime";

export interface OwnerSlot {
  id: string;
  startsAt: string;
  meetsLeadTime: boolean;
  past?: boolean;
  /** The slot's own booking (spec #29): held while a mentee pays, booked once paid. */
  booking?: "held" | "booked" | null;
}

export interface SlotsPanelProps {
  slots: OwnerSlot[];
  showPast: boolean;
  onShowPastChange: (showPast: boolean) => void;
  onRemove: (id: string) => void;
}

/**
 * The mentor's own slots on /mentor/slots (spec #25): upcoming slots with their lead-time state and
 * Remove (confirmed), an empty state with the next step, and a "Show past" switch for the last 50.
 * A booked or held slot (spec #29) says so and cannot be removed.
 */
export function SlotsPanel({ slots, showPast, onShowPastChange, onRemove }: SlotsPanelProps) {
  return (
    <section aria-labelledby="slots-title" className="flex flex-col gap-paragraph">
      <div className="flex flex-wrap items-center justify-between gap-related">
        <h2 id="slots-title" className="text-heading-4 font-semibold">
          Your open times
        </h2>
        <Field label="Show past" inline>
          {(control) => (
            <Checkbox {...control} checked={showPast} onCheckedChange={(checked) => onShowPastChange(checked === true)} />
          )}
        </Field>
      </div>

      {slots.length === 0 ? (
        showPast ? (
          <EmptyState title="No past slots." />
        ) : (
          <EmptyState title="No upcoming slots." description="Publish one so mentees can book you." />
        )
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Start</TableHead>
              <TableHead>State</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {slots.map((slot) => {
              const label = formatInstant(slot.startsAt, "datetime");
              const taken = slot.booking === "booked" || slot.booking === "held";
              return (
                <TableRow key={slot.id}>
                  <TableCell>
                    <LocalTime iso={slot.startsAt} />
                  </TableCell>
                  <TableCell>
                    {slot.booking === "booked" ? (
                      <Badge tone="success">Booked</Badge>
                    ) : slot.booking === "held" ? (
                      <Badge tone="warning">Held for payment</Badge>
                    ) : slot.past ? (
                      <Badge>Past</Badge>
                    ) : slot.meetsLeadTime ? (
                      <Badge tone="success">Bookable</Badge>
                    ) : (
                      <Badge tone="warning">Less than 2 h away</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {slot.past || taken ? null : (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button intent="destructive" appearance="text" size="sm" aria-label={`Remove slot ${label}`}>
                            Remove
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove the slot on {label}?</AlertDialogTitle>
                            <AlertDialogDescription>Mentees will no longer see this time on your page.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep slot</AlertDialogCancel>
                            <AlertDialogAction onClick={() => onRemove(slot.id)}>Remove slot</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
