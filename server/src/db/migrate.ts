import {readFile} from "node:fs/promises";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

import {loadConfig} from "../config.js";
import {createDb} from "./index.js";

/** Applies `schema.sql`. Every statement is `if not exists`, so re-running is harmless. */
async function main() {
  const cfg = loadConfig();
  const sql = createDb(cfg.DATABASE_URL);
  try {
    const schema = await readFile(join(dirname(fileURLToPath(import.meta.url)), "schema.sql"), "utf8");
    await sql.unsafe(schema);
    console.log("schema applied");
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
