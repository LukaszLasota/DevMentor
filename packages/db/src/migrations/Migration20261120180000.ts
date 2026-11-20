import { Migration } from '@mikro-orm/migrations';

// Bookings (spec 2026-11-20-booking-stripe-checkout, phase 2): one row per hold, paid or not. The
// partial unique index keeps one active booking per slot; CHECKs pin the lifecycle, the 25/50 lengths
// and the snapshot. Additive; rollback with `down` drops the table — only before real payments exist:
// afterwards rows are financial records.
export class Migration20261120180000 extends Migration {

  override name = 'Migration20261120180000';

  override up(): void | Promise<void> {
    this.addSql(`create table "bookings" ("id" uuid not null, "slot_id" uuid not null, "mentor_profile_id" uuid not null, "mentee_id" uuid not null, "starts_at" timestamptz not null, "ends_at" timestamptz not null, "length_minutes" smallint not null, "price_cents" int not null, "currency" varchar(3) not null, "status" text not null, "hold_expires_at" timestamptz not null, "checkout_session_id" text null, "confirmed_at" timestamptz null, "lead_minutes" int null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "bookings" add constraint "bookings_checkout_session_id_unique" unique ("checkout_session_id");`);
    this.addSql(`create unique index "bookings_slot_active_uq" on "bookings" ("slot_id") where status in ('pending_payment', 'confirmed');`);
    this.addSql(`create index "bookings_mentor_profile_status_idx" on "bookings" ("mentor_profile_id", "status");`);
    this.addSql(`alter table "bookings" add constraint "bookings_slot_id_foreign" foreign key ("slot_id") references "slots" ("id") on delete restrict;`);
    this.addSql(`alter table "bookings" add constraint "bookings_mentor_profile_id_foreign" foreign key ("mentor_profile_id") references "mentor_profiles" ("id") on delete restrict;`);
    this.addSql(`alter table "bookings" add constraint "bookings_mentee_id_foreign" foreign key ("mentee_id") references "users" ("id") on delete restrict;`);
    this.addSql(`alter table "bookings" add constraint "bookings_status_check" check (status in ('pending_payment', 'confirmed', 'expired', 'failed', 'payment_orphaned'));`);
    this.addSql(`alter table "bookings" add constraint "bookings_length_check" check (length_minutes in (25, 50));`);
    this.addSql(`alter table "bookings" add constraint "bookings_price_check" check (price_cents > 0);`);
    this.addSql(`alter table "bookings" add constraint "bookings_currency_check" check (currency ~ '^[A-Z]{3}$');`);
    this.addSql(`alter table "bookings" add constraint "bookings_ends_check" check (ends_at = starts_at + make_interval(mins => length_minutes));`);
    this.addSql(`alter table "bookings" add constraint "bookings_confirmed_check" check (status <> 'confirmed' or (confirmed_at is not null and lead_minutes is not null));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "bookings" cascade;`);
  }

}
