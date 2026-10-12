# Penalties: source review and proposed automation

Reviewed on 12 October 2026 against the supplied `../TOOLS FOR SAVINGS FOR SOFTWARE.xlsx`, the earlier `../PROJECT_REVIEW.md`, and the app's import and accounting code. No source workbook values were changed.

## What the documents support

- `Penalties!F2:CC114` is a monthly register for June 2019–December 2024, with 112 coded member rows and 301 positive, directly entered monthly amounts. There are 83 entries of 500 RWF, 77 of 1,000 RWF, and 30 of 1,500 RWF. These are consistent with a 500 RWF increment, but do not prove the reason, deadline, or recurrence of the charge.
- Three monthly entries are not multiples of 500 RWF: `Penalties!X27` = 2,100; `H45` = 3,050; `H53` = 1,550. These require interpretation, not rounding or replacement.
- Savings period headers vary: `Saving!G3` represents 19 June 2019; later headers use the 1st, 21st or 22nd. Penalty headers use the 19th and 1st. The importer treats these as reporting months, not payment timestamps or contractual deadlines.
- No written five-day late-contribution rule, actual payment timestamps, or assessment/settlement links were found in the supplied workbooks. Blank months cannot establish arrears, particularly for future periods, joining/exiting members, or incomplete records.
- The detailed penalty register ends in December 2024. The 2025 annual summary includes fines but does not supply individual penalty records for that year.
- `src/lib/import/workbook-import.ts` initially derives monthly commitments from the most frequently recorded savings amount since January 2025. This is a participation estimate that administrators can edit; it is not a documented contractual commitment for every historical month.

## Manual workflow implemented

Penalty assessments live separately from receipt ledger entries. Assigning an amount records what the member owes without increasing savings, penalty collections, cash, or received-income reports. Payments can be linked to an assessment, including partial payments; the outstanding balance is assessed amount less active linked payments. Removing a linked payment restores the corresponding debt. Unpaid assessments can be cancelled with a reason. These actions require an administrator and are audited. Members receive only their own outstanding assessments.

Imported and unlinked payments remain receipt records. They are not automatically matched to newly assigned debts or used to reconstruct unknown historic fines. The existing payment report remains a report of money received, rather than amounts assessed.

## Rule decisions needed

1. The monthly contribution due date and its treatment in short months.
2. Whether 500 RWF is charged once after five overdue days, or for every further five-day interval.
3. Whether partial contributions count as overdue and whether the full confirmed monthly commitment is required.
4. Member eligibility start/end dates, approved exemptions, pauses and grace periods.
5. Whether a late, backdated payment cancels an already generated charge, and who approves such corrections.
6. Effective date for automation. Do not backfill historical fines from blank imported cells.

## Recommended first release

Use the Africa/Kigali calendar. Let administrators confirm each eligible member's monthly commitment and the group rule. Start with a preview of proposed 500 RWF assessments for current eligible months; show the confirmed due date, five-day threshold, required savings, credited savings and remaining amount. Administrators can review and approve the preview before unattended automation is enabled.

Once the rule is agreed, a daily scheduled job should create assessments in a transaction. Use a database uniqueness key for member + contribution month + rule version + charge interval, so retries and concurrent runs cannot issue the same fine twice. A job must recheck savings and exemptions while holding the relevant lock, log the rule and triggering calculation, and never create a payment entry. Calendar boundaries, partial payments, repeated runs, former members, missing commitments and payment corrections need explicit tests.

The current monthly savings total is sufficient to identify an unpaid balance today after a confirmed deadline. It is not enough to determine whether a historical payment arrived before a threshold; imported records lack that timestamp. Any retrospective rule needs reliable dated payments or an administrator decision.

Automatic penalty creation is not enabled by this change; its policy inputs remain unconfirmed.
