import { Migration } from '@mikro-orm/migrations';

export class Migration20261114172923 extends Migration {

  override name = 'Migration20261114172923';

  override up(): void | Promise<void> {
    this.addSql(`create table "auth_rate_limits" ("key" text not null, "window_start" timestamptz not null, "count" int not null, primary key ("key"));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "auth_rate_limits" cascade;`);
  }

}
