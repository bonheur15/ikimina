import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import postgres from "postgres";

if (!process.env.DATABASE_URL) throw new Error("Set the local DATABASE_URL. Tests use their own disposable database.");
const database = `elayo_penalty_test_${randomUUID().replaceAll("-", "")}`;
const connection = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const testUrl = new URL(process.env.DATABASE_URL);
testUrl.pathname = `/${database}`;
let created = false;
try {
  await connection`CREATE DATABASE ${connection(database)}`;
  created = true;
  const child = spawn(
    process.execPath,
    [
      "--conditions=react-server",
      "--import=tsx",
      "--test",
      "tests/penalty-policy.test.ts",
      "tests/penalty-automation.test.ts",
    ],
    {
      stdio: "inherit",
      env: { ...process.env, TEST_DATABASE_URL: testUrl.toString() },
    },
  );
  process.exitCode = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
} finally {
  if (created) await connection`DROP DATABASE ${connection(database)} WITH (FORCE)`;
  await connection.end();
}
