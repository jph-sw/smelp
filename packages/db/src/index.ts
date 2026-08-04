import { sql, SQL } from "bun";

export class DB {
  public sqlite = new SQL("sqlite://database.sqlite");
}
