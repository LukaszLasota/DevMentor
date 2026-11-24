import { Migration } from '@mikro-orm/migrations';

// Invitation batches (spec 2026-11-24-invitation-batches): numbered batches of at most 20 invitations,
// at most one open (partial expression index), and a nullable link from `invitations` to its batch.
// Additive only: older invitations keep a null `invitation_batch_id` ("Created before batches").
export class Migration20261124100000 extends Migration {

  override name = 'Migration20261124100000';

  override up(): void | Promise<void> {
    this.addSql(`create table "invitation_batches" ("id" uuid not null, "number" int not null, "opened_by_id" uuid not null, "opened_at" timestamptz not null, "closed_at" timestamptz null, "resumed_at" timestamptz null, "resumed_by_id" uuid null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "invitation_batches_opened_by_id_index" on "invitation_batches" ("opened_by_id");`);
    this.addSql(`alter table "invitation_batches" add constraint "invitation_batches_number_uq" unique ("number");`);
    this.addSql(`create unique index "invitation_batches_one_open_uq" on "invitation_batches" ((closed_at is null)) where closed_at is null;`);
    this.addSql(`alter table "invitation_batches" add constraint "invitation_batches_opened_by_id_foreign" foreign key ("opened_by_id") references "users" ("id") on delete restrict;`);
    this.addSql(`alter table "invitation_batches" add constraint "invitation_batches_resumed_by_id_foreign" foreign key ("resumed_by_id") references "users" ("id") on delete restrict;`);
    this.addSql(`alter table "invitation_batches" add constraint "invitation_batches_number_check" check (number > 0);`);
    this.addSql(`alter table "invitation_batches" add constraint "invitation_batches_resumed_pair_check" check ((resumed_at is null) = (resumed_by_id is null));`);

    this.addSql(`alter table "invitations" add "invitation_batch_id" uuid null;`);
    this.addSql(`alter table "invitations" add constraint "invitations_invitation_batch_id_foreign" foreign key ("invitation_batch_id") references "invitation_batches" ("id") on delete restrict;`);
    this.addSql(`create index "invitations_invitation_batch_id_index" on "invitations" ("invitation_batch_id");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "invitations" drop constraint "invitations_invitation_batch_id_foreign";`);
    this.addSql(`drop index "invitations_invitation_batch_id_index";`);
    this.addSql(`alter table "invitations" drop column "invitation_batch_id";`);
    this.addSql(`drop table if exists "invitation_batches" cascade;`);
  }

}
