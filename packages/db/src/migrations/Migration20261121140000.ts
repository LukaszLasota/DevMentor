import { Migration } from '@mikro-orm/migrations';

// Text sessions (spec 2026-11-20-text-session): the messages of a confirmed booking, with an identity
// `seq` as the polling cursor, and the mentor's one written answer. Additive; `down` refuses while rows
// exist (they are the session record the note is drafted from).
export class Migration20261121140000 extends Migration {

  override name = 'Migration20261121140000';

  override up(): void | Promise<void> {
    this.addSql(`create table "session_messages" ("id" uuid not null, "seq" bigint generated always as identity, "booking_id" uuid not null, "author_id" uuid not null, "body" text not null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "session_messages_booking_seq_idx" on "session_messages" ("booking_id", "seq");`);
    this.addSql(`alter table "session_messages" add constraint "session_messages_booking_id_foreign" foreign key ("booking_id") references "bookings" ("id") on delete restrict;`);
    this.addSql(`alter table "session_messages" add constraint "session_messages_author_id_foreign" foreign key ("author_id") references "users" ("id") on delete restrict;`);
    this.addSql(`alter table "session_messages" add constraint "session_messages_body_check" check (char_length(body) between 1 and 4000);`);

    this.addSql(`create table "session_answers" ("id" uuid not null, "booking_id" uuid not null, "author_id" uuid not null, "body" text not null, "submitted_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "session_answers" add constraint "session_answers_booking_id_unique" unique ("booking_id");`);
    this.addSql(`alter table "session_answers" add constraint "session_answers_booking_id_foreign" foreign key ("booking_id") references "bookings" ("id") on delete restrict;`);
    this.addSql(`alter table "session_answers" add constraint "session_answers_author_id_foreign" foreign key ("author_id") references "users" ("id") on delete restrict;`);
    this.addSql(`alter table "session_answers" add constraint "session_answers_body_check" check (char_length(body) between 20 and 20000);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`do $$ begin if exists (select 1 from "session_messages") or exists (select 1 from "session_answers") then raise exception 'session tables have rows: not rolling back'; end if; end $$;`);
    this.addSql(`drop table if exists "session_answers" cascade;`);
    this.addSql(`drop table if exists "session_messages" cascade;`);
  }

}
