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
- Member contribution timelines and ledgers with month/type/search filters, exact Kigali timestamps, running savings balances and payment-detail previews
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
- `src/components/member-history.tsx`: member timelines, ledgers and payment details
- `public/images/`: generated editorial images used by the interface
- `docs/image-prompts.md`: exact image prompts and provenance
- `src/components/ui/`: shadcn/ui primitives
- `src/lib/demo-data.ts`: fictional sample data
- `src/app/globals.css`: brand theme, responsive layouts and reduced-motion support

Kinyarwanda labels are provided as draft interface translations for review by a native speaker.

Mobile layouts include safe-area-aware bottom navigation, a keyboard-accessible menu, labeled record cards in place of wide tables, larger touch controls, and responsive member timelines and receipts. English and Kinyarwanda layouts were checked at 360, 390, 430, and 768px widths.
