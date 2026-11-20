import { Migration } from '@mikro-orm/migrations';

// Availability slots (spec 2026-10-21-availability-slots): single published start instants, softly
// removed, with a partial unique index that lets a removed start be republished; plus the R08
// ordering key on mentor_profiles. Additive only. Rollback: `down` drops both (nothing depends on
// them before #29).
export class Migration20261120120000 extends Migration {

  override name = 'Migration20261120120000';

  override up(): void | Promise<void> {
    this.addSql(`create table "slots" ("id" uuid not null, "mentor_profile_id" uuid not null, "starts_at" timestamptz not null, "removed_at" timestamptz null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create unique index "slots_mentor_starts_at_active_uq" on "slots" ("mentor_profile_id", "starts_at") where removed_at is null;`);
    this.addSql(`alter table "slots" add constraint "slots_mentor_profile_id_foreign" foreign key ("mentor_profile_id") references "mentor_profiles" ("id") on delete cascade;`);

    this.addSql(`alter table "mentor_profiles" add column "last_published_availability_at" timestamptz null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "mentor_profiles" drop column "last_published_availability_at";`);
    this.addSql(`drop table if exists "slots" cascade;`);
  }

}
