import { Migration } from '@mikro-orm/migrations';

// Stripe webhook inbox (spec 2026-11-20-booking-stripe-checkout, phase 1): one row per verified event.
// Additive; rollback with `down` drops the table (received events are lost — Stripe keeps them for
// 30 days and can resend them from the dashboard).
export class Migration20261120160000 extends Migration {

  override name = 'Migration20261120160000';

  override up(): void | Promise<void> {
    this.addSql(`create table "stripe_events" ("id" text not null, "type" text not null, "payload" jsonb not null, "received_at" timestamptz not null, "processed_at" timestamptz null, "attempts" int not null default 0, "last_error" text null, constraint "stripe_events_pkey" primary key ("id"));`);
    this.addSql(`alter table "stripe_events" add constraint "stripe_events_attempts_check" check (attempts >= 0);`);
    this.addSql(`alter table "stripe_events" add constraint "stripe_events_processed_check" check (processed_at is null or attempts > 0);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "stripe_events" cascade;`);
  }

}
