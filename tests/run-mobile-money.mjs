import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import postgres from "postgres";

if (!process.env.DATABASE_URL)
  throw new Error("Set DATABASE_URL for the local PostgreSQL server. Tests create and drop their own database.");
const connection = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
try {
  for (const group of [
    ["tests/xendly.test.ts", "tests/payment-fees.test.ts", "tests/loan-policy.test.ts", "tests/mobile-money.test.ts"],
    ["tests/loans.test.ts"],
    ["tests/contribution-proofs.test.ts"],
    ["tests/shares.test.ts"],
  ]) {
    const database = `elayo_mobile_money_test_${randomUUID().replaceAll("-", "")}`;
    const testUrl = new URL(process.env.DATABASE_URL);
    testUrl.pathname = `/${database}`;
    await connection`CREATE DATABASE ${connection(database)}`;
    try {
      const child = spawn(process.execPath, ["--conditions=react-server", "--import=tsx", "--test", ...group], {
        stdio: "inherit",
        env: { ...process.env, TEST_DATABASE_URL: testUrl.toString() },
      });
      process.exitCode = await new Promise((resolve, reject) => {
        child.on("error", reject);
        child.on("exit", (code) => resolve(code ?? 1));
      });
    } finally {
      await connection`DROP DATABASE ${connection(database)} WITH (FORCE)`;
    }
    if (process.exitCode) break;
  }
} finally {
  await connection.end();
}
