import { Migration } from '@mikro-orm/migrations';

export class Migration20261026112548 extends Migration {

  override name = 'Migration20261026112548';

  override up(): void | Promise<void> {
    this.addSql(`create table "users" ("id" uuid not null, "email" text not null, "roles" text[] not null default '{mentee}', "session_version" int not null default 0, "github_id" bigint null, "github_login" text null, "avatar_url" text null, "password_hash" text null, "email_verified_at" timestamptz null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "users" add constraint "users_email_unique" unique ("email");`);
    this.addSql(`alter table "users" add constraint "users_github_id_unique" unique ("github_id");`);
    this.addSql(`alter table "users" add constraint "users_roles_check" check (array_ndims(roles) = 1 and cardinality(roles) > 0 and array_position(roles, null) is null and roles <@ array['mentee', 'mentor', 'operator']::text[]);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "users" cascade;`);
  }

}
