import { Migration } from '@mikro-orm/migrations';

// Dispute reports (spec 2026-11-20-booking-cancellation, phase 2): one mentee report per booking, read
// by the operator. Additive; `down` refuses while reports exist (they back an operator's decision).
export class Migration20261121120000 extends Migration {

  override name = 'Migration20261121120000';

  override up(): void | Promise<void> {
    this.addSql(`create table "booking_reports" ("id" uuid not null, "booking_id" uuid not null, "message" text not null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "booking_reports" add constraint "booking_reports_booking_id_unique" unique ("booking_id");`);
    this.addSql(`alter table "booking_reports" add constraint "booking_reports_booking_id_foreign" foreign key ("booking_id") references "bookings" ("id") on delete restrict;`);
    this.addSql(`alter table "booking_reports" add constraint "booking_reports_message_check" check (char_length(message) between 20 and 2000);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`do $$ begin if exists (select 1 from "booking_reports") then raise exception 'booking_reports has rows: not rolling back'; end if; end $$;`);
    this.addSql(`drop table if exists "booking_reports" cascade;`);
  }

}
