import { Migration } from '@mikro-orm/migrations';

// Booking cancellation (spec 2026-11-20-booking-cancellation, phase 1): the `cancelled` status, when it
// happened and the refund's state and Stripe id. Additive (one value more in the status CHECK, three
// nullable columns). `down` refuses while cancelled rows exist: they are financial records.
export class Migration20261121100000 extends Migration {

  override name = 'Migration20261121100000';

  override up(): void | Promise<void> {
    this.addSql(`alter table "bookings" add column "cancelled_at" timestamptz null, add column "refund_status" text null, add column "refund_id" text null;`);
    this.addSql(`alter table "bookings" drop constraint "bookings_status_check";`);
    this.addSql(`alter table "bookings" add constraint "bookings_status_check" check (status in ('pending_payment', 'confirmed', 'expired', 'failed', 'payment_orphaned', 'cancelled'));`);
    this.addSql(`alter table "bookings" add constraint "bookings_refund_status_check" check (refund_status in ('not_due', 'requested', 'pending', 'succeeded', 'failed'));`);
    this.addSql(`alter table "bookings" add constraint "bookings_cancelled_check" check (status <> 'cancelled' or (cancelled_at is not null and refund_status is not null));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`do $$ begin if exists (select 1 from "bookings" where status = 'cancelled') then raise exception 'bookings has cancelled rows (financial records): not rolling back'; end if; end $$;`);
    this.addSql(`alter table "bookings" drop constraint "bookings_cancelled_check";`);
    this.addSql(`alter table "bookings" drop constraint "bookings_refund_status_check";`);
    this.addSql(`alter table "bookings" drop constraint "bookings_status_check";`);
    this.addSql(`alter table "bookings" add constraint "bookings_status_check" check (status in ('pending_payment', 'confirmed', 'expired', 'failed', 'payment_orphaned'));`);
    this.addSql(`alter table "bookings" drop column "cancelled_at", drop column "refund_status", drop column "refund_id";`);
  }

}
