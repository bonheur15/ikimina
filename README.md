# Ikimina dashboard

A UI-only savings-group workspace built with Next.js App Router, TypeScript, Tailwind CSS and shadcn/ui (Radix primitives).

## Run locally

```sh
npm install
npm run dev
```

Open http://localhost:3000.

## Validate and build

```sh
npx tsc --noEmit
npm run build
```

The production build is a static export in `out/`.

## Included views

- Overview with savings pool, participation and contribution visuals
- Members with search, readiness filters and profile panels
- Savings and share register
- Social fund and support allocations
- Penalties and settlement status
- Cashbook with incoming and outgoing entries
- Reports with statement previews and yearly comparisons
- Settings and English/Kinyarwanda switching

## Scope

All figures and member profiles are illustrative. The original Excel files are not imported or modified. Navigation, filters, language switching, dialogs and form previews work in the browser. Payments, member creation and settings are not saved; there is no backend, authentication, database or export workflow.

## Main files

- `src/components/dashboard.tsx`: shell, overview and recording preview
- `src/components/workspace-views.tsx`: management screens
- `src/components/ui/`: shadcn/ui primitives
- `src/lib/demo-data.ts`: fictional sample data
- `src/app/globals.css`: brand theme, responsive layouts and reduced-motion support

Kinyarwanda labels are provided as draft interface translations for review by a native speaker.
