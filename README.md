# Ikimina dashboard

Savings-group records for Caisse d’entraide Elayo Family. Administrators manage members, contributions, the social fund, penalties, the petty-cash book and reports; each member signs in to see only their own savings, contributions, interest and statements. The group’s Excel workbooks can be opened in the browser with their original layout.

Stack: Next.js App Router, TypeScript, PostgreSQL with Drizzle ORM, Auth.js (credentials), Tailwind CSS and Radix UI.

## Run locally

```sh
npm install
cp .env.example .env.local        # then set AUTH_SECRET (openssl rand -base64 32)
npm run db:up                     # local Postgres in Docker on port 55433
npm run dev
```

Everything else happens in the app:

1. **Database tables** are created and updated automatically when the server starts (`src/instrumentation.ts` applies the migrations in `drizzle/`).
2. **First administrator:** with no administrator yet, `/login` sends you to `/setup` to create one. The page closes once an administrator exists. Set `SETUP_TOKEN` to also require a code there (recommended on a public server until setup is done).
3. **Load the records (fresh installs only):** while the database has no members, **Settings** shows *Load the group’s records*. Upload `TOOLS FOR SAVINGS FOR SOFTWARE.xlsx` and the member email register once; the panel then disappears and records are managed in the app. Differences found in the workbooks are listed in **Reports → Import review**.

**Quick testing:** in development, open http://localhost:3000/demo for a ready-made administrator and member account — copy the details or sign in with one click. The demo member is linked to the first current member without an account, so it shows real imported records. The page returns 404 in production unless `ENABLE_DEMO=true` is set.

## Accounts

Members can make mobile money contributions and request loans or savings withdrawals through **Payments & loans**. Administrators review requests and confirm payouts in **Mobile money**. See [XendlyPay setup and accounting](docs/mobile-money.md) for credentials, signed webhook setup, test-mode behavior, loan terms, fees and validation commands.

- Members sign in with their **email or member code** and a password.
- An administrator creates a single-use **sign-in link** from a member’s profile (Members → select member) and shares it privately. The link expires after 7 days; the same button creates password-reset links later. Members without an email can still sign in with their member code.
- Sign-in can be blocked per member. Failed sign-ins are rate-limited.
- Every page, server action and API route checks the session and role on the server; members only ever receive their own records.

## What’s imported

| Source | Becomes |
| --- | --- |
| Email register `Members` | Current roster (111), emails |
| `INTEREST 2025` | District, national ID, phone; 2025 interest allocations |
| `Saving` month columns | One savings record per member per month |
| Literal deductions in `Saving!DR`/`DS` formulas | Adjustment (withdrawal) records, undated |
| `Saving!EF/EE/EH` | Interest allocations up to 2021, 2022, 2023 |
| `Social funds`, `Penalties` month columns | Social and penalty records per month |
| `Cashbook` | Petty-cash entries in original order, with the date as written |

Workbook subtotal cells are not imported; reports are calculated from the monthly records. Members found in registers but not in the email roster are kept as **former** members so no history is lost. Imported records show the month they count for (no exact payment day) and link back to their source cell.

## Reports

**Reports** lists every report (financial summary, year-by-year comparison, monthly collections, member balances, member statements, interest allocation, member register, register sheets/summaries/payments, cashbook, spending by category and the import review). Each one can be previewed in a spreadsheet-style table and downloaded as **Excel** (formatted, with frozen headers and filters), **CSV** or **PDF** (print view). Reports only read data. The same downloads are available on the Members, register and Cashbook pages for their current filters.

## Database

```sh
npm run db:generate   # after editing src/db/schema.ts; the next server start applies it
npm run db:studio     # browse the data
```

## Validate and build

```sh
npm run lint
npm run typecheck
npm run build
```

The Docker image builds the app and runs `next start` on port 3000; migrations are applied as the server starts. It needs `DATABASE_URL` and `AUTH_SECRET` at runtime (not at build time), plus `AUTH_URL` when behind a proxy so sign-in links use the public address, and optionally `SETUP_TOKEN`.
