import { Migration } from '@mikro-orm/migrations';

// Mentor page (spec 2026-10-21-mentor-page): page fields, the share-link slug and the publish state.
// Additive only: existing rows are empty profiles and stay valid (tags default to `{}`).
export class Migration20261120100000 extends Migration {

  override name = 'Migration20261120100000';

  override up(): void | Promise<void> {
    this.addSql(`alter table "mentor_profiles" add column "display_name" varchar(80) null, add column "public_work_url" text null, add column "bio" text null, add column "stack_tags" text[] not null default '{}', add column "slug" varchar(60) null, add column "published_at" timestamptz null;`);
    this.addSql(`alter table "mentor_profiles" add constraint "mentor_profiles_slug_key" unique ("slug");`);
    this.addSql(`alter table "mentor_profiles" add constraint "mentor_profiles_stack_tags_check" check (array_position(stack_tags, null) is null and stack_tags <@ array['typescript', 'react', 'python', 'ai-agents']::text[]);`);
    this.addSql(`alter table "mentor_profiles" add constraint "mentor_profiles_bio_length_check" check (bio is null or char_length(bio) <= 2000);`);
    this.addSql(`alter table "mentor_profiles" add constraint "mentor_profiles_published_slug_check" check (published_at is null or slug is not null);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "mentor_profiles" drop constraint "mentor_profiles_published_slug_check";`);
    this.addSql(`alter table "mentor_profiles" drop constraint "mentor_profiles_bio_length_check";`);
    this.addSql(`alter table "mentor_profiles" drop constraint "mentor_profiles_stack_tags_check";`);
    this.addSql(`alter table "mentor_profiles" drop constraint "mentor_profiles_slug_key";`);
    this.addSql(`alter table "mentor_profiles" drop column "display_name", drop column "public_work_url", drop column "bio", drop column "stack_tags", drop column "slug", drop column "published_at";`);
  }

}
