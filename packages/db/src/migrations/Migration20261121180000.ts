import { Migration } from '@mikro-orm/migrations';

// Mentor payouts (spec 2026-11-21-mentor-payouts): Stripe Express accounts, one payout per booking with
// frozen amounts, the fee rate snapshotted on bookings (backfilled at 20% for existing paid ones) and
// the operator's resolution of a dispute report. `down` refuses while accounts or payouts exist.
export class Migration20261121180000 extends Migration {

  override name = 'Migration20261121180000';

  override up(): void | Promise<void> {
    this.addSql(`create table "connect_accounts" ("id" uuid not null, "mentor_profile_id" uuid not null, "provider_account_id" text not null, "onboarding_status" text not null, "last_reconciled_at" timestamptz not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "connect_accounts" add constraint "connect_accounts_mentor_profile_id_unique" unique ("mentor_profile_id");`);
    this.addSql(`alter table "connect_accounts" add constraint "connect_accounts_provider_account_id_unique" unique ("provider_account_id");`);
    this.addSql(`alter table "connect_accounts" add constraint "connect_accounts_mentor_profile_id_foreign" foreign key ("mentor_profile_id") references "mentor_profiles" ("id") on delete restrict;`);
    this.addSql(`alter table "connect_accounts" add constraint "connect_accounts_onboarding_status_check" check (onboarding_status in ('action_required', 'pending_verification', 'enabled', 'restricted'));`);

    this.addSql(`create table "payouts" ("id" uuid not null, "booking_id" uuid not null, "mentor_profile_id" uuid not null, "gross_cents" int not null, "fee_bps" smallint not null, "fee_cents" int not null, "net_cents" int not null, "currency" varchar(3) not null, "status" text not null, "hold_reason" text null, "attempt" smallint not null default 1, "charge_id" text null, "transfer_id" text null, "failure_code" text null, "transferred_at" timestamptz null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "payouts" add constraint "payouts_booking_id_unique" unique ("booking_id");`);
    this.addSql(`alter table "payouts" add constraint "payouts_transfer_id_unique" unique ("transfer_id");`);
    this.addSql(`alter table "payouts" add constraint "payouts_booking_id_foreign" foreign key ("booking_id") references "bookings" ("id") on delete restrict;`);
    this.addSql(`alter table "payouts" add constraint "payouts_mentor_profile_id_foreign" foreign key ("mentor_profile_id") references "mentor_profiles" ("id") on delete restrict;`);
    this.addSql(`alter table "payouts" add constraint "payouts_status_check" check (status in ('held', 'transferring', 'transferred', 'failed'));`);
    this.addSql(`alter table "payouts" add constraint "payouts_hold_reason_check" check (hold_reason is null or hold_reason in ('connect_not_enabled', 'disputed', 'charge_reversed'));`);
    this.addSql(`alter table "payouts" add constraint "payouts_held_check" check ((status = 'held') = (hold_reason is not null));`);
    this.addSql(`alter table "payouts" add constraint "payouts_transferred_check" check (status <> 'transferred' or transfer_id is not null);`);
    this.addSql(`alter table "payouts" add constraint "payouts_amounts_check" check (fee_cents + net_cents = gross_cents);`);
    this.addSql(`alter table "payouts" add constraint "payouts_gross_check" check (gross_cents > 0);`);
    this.addSql(`alter table "payouts" add constraint "payouts_net_check" check (net_cents > 0);`);
    this.addSql(`alter table "payouts" add constraint "payouts_fee_check" check (fee_cents >= 0);`);
    this.addSql(`alter table "payouts" add constraint "payouts_fee_bps_check" check (fee_bps between 0 and 9999);`);
    this.addSql(`alter table "payouts" add constraint "payouts_attempt_check" check (attempt >= 1);`);

    this.addSql(`alter table "bookings" add column "fee_bps" smallint null;`);
    this.addSql(`update "bookings" set "fee_bps" = 2000 where status in ('confirmed', 'cancelled');`);
    this.addSql(`alter table "bookings" add constraint "bookings_fee_bps_check" check (fee_bps is null or fee_bps between 0 and 9999);`);
    this.addSql(`alter table "bookings" add constraint "bookings_fee_snapshot_check" check (status <> 'confirmed' or fee_bps is not null);`);

    this.addSql(`alter table "booking_reports" add column "resolved_at" timestamptz null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`do $$ begin if exists (select 1 from "payouts") or exists (select 1 from "connect_accounts") then raise exception 'payouts or connect accounts exist (financial records): not rolling back'; end if; end $$;`);
    this.addSql(`alter table "booking_reports" drop column "resolved_at";`);
    this.addSql(`alter table "bookings" drop constraint "bookings_fee_snapshot_check";`);
    this.addSql(`alter table "bookings" drop constraint "bookings_fee_bps_check";`);
    this.addSql(`alter table "bookings" drop column "fee_bps";`);
    this.addSql(`drop table if exists "payouts" cascade;`);
    this.addSql(`drop table if exists "connect_accounts" cascade;`);
  }

}
