import { Migration } from '@mikro-orm/migrations';

// Session notes (spec 2026-11-20-session-note): versions the mentor sends and the mentee decides once.
// Partial unique indexes keep at most one waiting and one approved version per session. Additive; `down`
// refuses while rows exist.
export class Migration20261121160000 extends Migration {

  override name = 'Migration20261121160000';

  override up(): void | Promise<void> {
    this.addSql(`create table "session_note_versions" ("id" uuid not null, "booking_id" uuid not null, "version" smallint not null, "body" text not null, "sent_at" timestamptz not null, "decision" text null, "decision_comment" text null, "decided_at" timestamptz null, primary key ("id"));`);
    this.addSql(`alter table "session_note_versions" add constraint "session_note_versions_booking_version_uq" unique ("booking_id", "version");`);
    this.addSql(`create unique index "session_note_versions_waiting_uq" on "session_note_versions" ("booking_id") where decision is null;`);
    this.addSql(`create unique index "session_note_versions_approved_uq" on "session_note_versions" ("booking_id") where decision = 'approved';`);
    this.addSql(`alter table "session_note_versions" add constraint "session_note_versions_booking_id_foreign" foreign key ("booking_id") references "bookings" ("id") on delete restrict;`);
    this.addSql(`alter table "session_note_versions" add constraint "session_note_versions_version_check" check (version between 1 and 10);`);
    this.addSql(`alter table "session_note_versions" add constraint "session_note_versions_body_check" check (char_length(body) between 20 and 20000);`);
    this.addSql(`alter table "session_note_versions" add constraint "session_note_versions_decision_check" check (decision is null or decision in ('approved', 'declined'));`);
    this.addSql(`alter table "session_note_versions" add constraint "session_note_versions_comment_check" check ((decision is not distinct from 'declined') = (decision_comment is not null));`);
    this.addSql(`alter table "session_note_versions" add constraint "session_note_versions_comment_length_check" check (decision_comment is null or char_length(decision_comment) between 10 and 2000);`);
    this.addSql(`alter table "session_note_versions" add constraint "session_note_versions_decided_check" check ((decision is null) = (decided_at is null));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`do $$ begin if exists (select 1 from "session_note_versions") then raise exception 'session_note_versions has rows: not rolling back'; end if; end $$;`);
    this.addSql(`drop table if exists "session_note_versions" cascade;`);
  }

}
