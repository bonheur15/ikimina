// Imports the source workbooks into the database. Safe to re-run: imported
// records are replaced, manually recorded ones and edited member details are kept.
//   npm run db:import -- [savings.xlsx] [roster.xlsx]
import "./env";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { db, sql } from "../src/db";
import { importSourceWorkbooks } from "../src/lib/import/workbook-import";

const [savingsPath = "../TOOLS FOR SAVINGS FOR SOFTWARE.xlsx", rosterPath = "../Account_creation_Member_Email_Collection.xlsx"] = process.argv.slice(2);
const load = (path: string, title: string) => ({ fileName: basename(path), title, data: readFileSync(resolve(path)) });

async function main() {
  const started = Date.now();
  const { summary } = await importSourceWorkbooks(db,
    load(savingsPath, "Savings, social fund and penalty records"),
    load(rosterPath, "Member email collection register"));
  console.log(`Imported in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.table(summary.counts);
  console.log(`\n${summary.findings.length} findings to review:`);
  for (const f of summary.findings) console.log(` - [${f.ref ?? f.sheet}] ${f.message}`);
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => sql.end());
