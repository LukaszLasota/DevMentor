import { Migration } from '@mikro-orm/migrations';

export class Migration20261114193444 extends Migration {

  override name = 'Migration20261114193444';

  override up(): void | Promise<void> {
    this.addSql(`create table "mentor_profiles" ("id" uuid not null, "user_id" uuid not null, "initial_publish_due_at" timestamptz null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "mentor_profiles" add constraint "mentor_profiles_user_id_unique" unique ("user_id");`);

    this.addSql(`create table "invitations" ("id" uuid not null, "email" text not null, "token_hash" text not null, "stack_tags" text[] not null, "batch" text null, "expires_at" timestamptz not null, "accepted_at" timestamptz null, "accepted_by_id" uuid null, "publish_due_at" timestamptz null, "revoked_at" timestamptz null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "invitations" add constraint "invitations_token_hash_unique" unique ("token_hash");`);
    this.addSql(`create index "invitations_accepted_by_id_index" on "invitations" ("accepted_by_id");`);
    this.addSql(`create unique index "invitations_email_unresolved_unique" on "invitations" ("email") where accepted_at is null and revoked_at is null;`);

    this.addSql(`alter table "mentor_profiles" add constraint "mentor_profiles_user_id_foreign" foreign key ("user_id") references "users" ("id") on delete cascade;`);

    this.addSql(`alter table "invitations" add constraint "invitations_accepted_by_id_foreign" foreign key ("accepted_by_id") references "users" ("id") on delete restrict;`);
    this.addSql(`alter table "invitations" add constraint "invitations_stack_tags_check" check (array_ndims(stack_tags) = 1 and cardinality(stack_tags) > 0 and array_position(stack_tags, null) is null and stack_tags <@ array['typescript', 'react', 'python', 'ai-agents']::text[]);`);
    this.addSql(`alter table "invitations" add constraint "invitations_accepted_pair_check" check ((accepted_at is null) = (accepted_by_id is null));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "mentor_profiles" cascade;`);
    this.addSql(`drop table if exists "invitations" cascade;`);
  }

}
