import { Migration } from '@mikro-orm/migrations';

// Mentor prices (spec 2026-10-21-mentor-prices): two nullable positive integer-cent columns. Additive;
// rollback with `down` drops them (prices typed in by mentors are lost).
export class Migration20261120140000 extends Migration {

  override name = 'Migration20261120140000';

  override up(): void | Promise<void> {
    this.addSql(`alter table "mentor_profiles" add column "price_25_cents" int null, add column "price_50_cents" int null;`);
    this.addSql(`alter table "mentor_profiles" add constraint "mentor_profiles_price_25_cents_check" check (price_25_cents > 0);`);
    this.addSql(`alter table "mentor_profiles" add constraint "mentor_profiles_price_50_cents_check" check (price_50_cents > 0);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "mentor_profiles" drop constraint "mentor_profiles_price_50_cents_check";`);
    this.addSql(`alter table "mentor_profiles" drop constraint "mentor_profiles_price_25_cents_check";`);
    this.addSql(`alter table "mentor_profiles" drop column "price_25_cents", drop column "price_50_cents";`);
  }

}
