# Ikimina dashboard

A savings-group dashboard built with Next.js App Router, TypeScript, Tailwind CSS and Radix UI. The interface has separate member and administrator workspaces, with the member experience designed for phones first.

## Run locally

```sh
npm install
npm run dev
```

Open http://localhost:3000. If that port is occupied, run `npm run dev -- --port 3001`.

- `/` and `/member`: personal member dashboard
- `/admin`: group administrator dashboard
- `/admin/contributions`: savings shares and contributions
- `/admin/social-fund`: social contributions and support
- `/admin/penalties`: paid penalty register
- `/admin/members`, `/admin/cashbook`, `/admin/reports`, `/admin/settings`: dedicated management pages

## Validate and build

```sh
npm run lint
npx tsc --noEmit --incremental false
npm run build
```

The production build is a static export in `out/`.

The Docker image serves the export with `nginx.conf`, which resolves the member dashboard and all administrator pages to their generated HTML files. Local nginx checks verified the ten page routes and three illustration assets. Production browser checks verified recording five shares as 25,000 RWF and preserving the resulting member balance across client navigation.

## Member workspace

- Savings balance, shares, monthly commitment progress and balance visibility control
- Savings chart, separate interest allocation and social fund contributions
- Personal contribution timeline and ledger with month, type and reference filters
- Payment details with Kigali timestamps, references, methods and running savings balances
- Monthly and year-to-date statements with opening/closing savings and CSV downloads
- Editable preview contact details, help and English/Kinyarwanda preferences
- Safe-area-aware bottom navigation, touch controls and single-column phone layouts

## Administrator workspace

- Collective savings, participation, social fund and contact readiness
- Searchable member register, contact filters and individual contribution histories
- Separate savings, social fund and paid penalty registers with their own URLs, filters, totals and recording windows
- Search members by name, code, district or email when recording; choose a member directly from a register summary
- Savings recording uses whole shares only, at 5,000 RWF per share, with a calculated amount and quick share buttons
- Social and penalty recording use amounts; penalty payments require a reason or reference
- Member summaries show recorded shares or payments and savings/social commitment progress for the selected month
- Social support payments are shown alongside the social register
- Cashbook with opening balance, receipts, expenses and closing balance
- Financial summaries, member savings and separate interest allocation reports, with CSV downloads
- Group name and language preferences

## Preview scope

These are account **screens**, using eight fictional members and 2026 sample payments. The Excel files and real member information are not imported or changed. There is no authentication, database, account invitation or real payment integration yet.

Payments, contact edits, group name and language are held in React state. They stay connected when switching workspaces through the preview links and reset on a full page refresh. Downloads contain the displayed sample records; contribution exports respect the selected filters. Statements and cash reports use payment dates, while contribution history can be filtered by the contribution month, including payments made in advance.

Savings principal, social contributions, paid penalties and interest allocations are kept separate. Interest allocations do not imply payment or a credit to savings. Cashbook opening cash is a separate sample figure from member savings. Unpaid penalties require an assessment register.

Kinyarwanda labels are draft translations for native-speaker review. Mobile layouts were checked at 360, 390, 430 and 768px widths in both languages. Browser checks covered filters, receipts, statements, CSV content, contact updates, search and member preselection in all recording windows, zero/fractional-share rejection, share-to-RWF calculation, separate social/penalty payments, and payments updating member balances and group reports across workspace navigation. Register exports follow the selected payments or member summary view.

## Main files

- `src/components/account-dashboard.tsx`: shared preview state, workspace shell and navigation
- `src/components/contribution-recording.tsx`: searchable member picker and dedicated share/payment forms
- `src/components/contribution-register.tsx`: separate registers, member summaries and exports
- `src/lib/portal-navigation.ts`: administrator page URLs
- `src/components/member-dashboard.tsx`: personal dashboard, contributions, statements and account details
- `src/components/admin-dashboard.tsx`: group management and reporting screens
- `src/components/portal-ui.tsx`: shared charts, receipts, formatting and UI components
- `src/lib/portal-data.ts`: fictional profiles, payment records, financial calculations and CSV downloads
- `src/app/portal.css`: theme, responsive layouts, accessibility and reduced-motion styles
- `src/app/portal-recording.css`: register and recording form styles
- `src/components/portal-illustrations.tsx` and `src/app/portal-illustrations.css`: responsive decorative illustrations
- `public/images/portal/`: three transparent, optimized WebP illustrations (about 163 KiB combined)
- `assets/generated/portal/`: preserved original generated PNGs
- `docs/portal-image-prompts.md`: exact prompts and built-in generation provenance
- `src/components/ui/`: Radix/shadcn UI primitives

The earlier dashboard components and image assets remain in the repository; the new routes render the portal components above. Savings, community support and statement illustrations appear in the member and administrator dashboards, statements, registers and reports. Images are decorative, preserve alpha transparency, use fixed dimensions to avoid layout shifts and are lazy-loaded below the fold.

## Existing deployment history

The entries below describe the earlier deployment. This UI rewrite has not been deployed.

Hubfly deployment preparation uses `Dockerfile` (Next.js static export served by nginx) and the schema-v2 `hubfly.build.json` binding for the `ikimina` project in EU Central. Run `hubfly deploy --config hubfly.build.json --mode smart --yes` to deploy. The first session, `build_abf389c8-bea2-486c-b414-87b542a4f119`, built and uploaded successfully but failed in Hubfly remote provisioning with no detailed error; no container or public endpoint was created.

Local Docker validation completed successfully: production container served the Ikimina dashboard with HTTP 200.

Dedicated Hubfly deployment succeeded in EU Central: https://ikimina.eu1.hubfly.app. Container `cont_abd4b201-7fce-4552-9870-d0c9d9bef6c4`; session `build_43410b63-59b5-4bf6-b695-d14096d1d68b`. HTTPS serves the dashboard and HTTP redirects to HTTPS. The durable manifest now binds this container with dedicated resources (1 CPU, 800 MiB RAM, 1 GiB disk).
