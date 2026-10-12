# XendlyPay mobile money

Members use **Payments & loans** to contribute savings shares (5,000 RWF each), pay the social fund, request loans or savings withdrawals, accept approved loan terms, and repay disbursed loans. Managers use **Mobile money** to approve or decline loans. Secretaries handle withdrawal reviews and approved payouts to the displayed destination. Requests can be cancelled before a payout starts. The member account, amount and phone are always checked on the server.

## Contributions paid outside Elayo

Mobile money is the default contribution method. Both contribution methods show a live RWF value for entered savings shares and use custom month/date pickers. Members choose **Contribute → Upload a receipt** when they paid by bank transfer, cash or mobile money outside the app. They enter the contribution type, whole savings shares or social amount (excluding transfer fees), contribution month, payment date and transaction reference, and attach one JPG, PNG or PDF up to 5 MB. No XendlyPay setup is required. Receipts are stored privately in PostgreSQL and served only to their owner or authenticated group staff, without public URLs or caching.

Submissions appear in the member’s **Receipts** activity tab as awaiting secretary review. Pending, declined and cancelled receipts never increase savings or group income. The secretary opens **Payments → Contribution receipts**, checks the receipt against money actually received and existing records, and approves or declines with a note. Only secretaries can approve contribution receipts; managers and superadmins can inspect but cannot approve them. Approval atomically records the member contribution and cashbook receipt, preserving the submitted payment date and month. Repeated approval cannot create a second credit. The source receipt and review are retained, and this contribution cannot be removed as an ordinary manual entry.

Active receipt hashes and normalized transaction references cannot be reused for another pending/approved submission. Declined receipts can be corrected and resubmitted; members can cancel only pending submissions. A rejected or cancelled receipt cannot later be approved. The app queues notifications for secretaries on submission and members after review; delivery uses the configured OneSignal queue. Approved late-payment proof does not automatically reverse already-assessed penalties.

## Connect an app

1. Create an app in XendlyPay. Add its API key and matching webhook signing secret to `.env.local` locally, or your deployment's secret environment variables:

   ```dotenv
   XENDLY_API_KEY=your-app-key
   XENDLY_WEBHOOK_SECRET=your-app-webhook-secret
   XENDLY_MODE=test
   ```

2. Set the XendlyPay app's webhook URL to `https://YOUR_DOMAIN/api/payments/xendly/webhook`. Local development needs a public HTTPS tunnel. Use the provider dashboard's **Send test** button to check the signed `ping` response.
3. Restart the application after changing environment variables. Pending database migrations are applied at startup.
4. Check the provider app's actual mode. `XENDLY_MODE` must match it. Test numbers must be registered with XendlyPay. **Test collections debit real mobile money**; this application stores them separately and excludes them from live savings, loan repayments and the cashbook. There are no provider calls in the automated tests.
5. For live use, complete XendlyPay business verification, set the provider app to live, use its matching credentials and set `XENDLY_MODE=live`. Cashouts require an active live app, a verified business, and sufficient available provider balance for the amount plus fee. The minimum payout is 10,000 RWF. Check the destination in the application's confirmation dialog before sending.

No provider key or webhook secret is sent to the browser. A missing key or secret disables collection and payout buttons; members can still submit requests for administrator review.

## Accounting and terms

The fee policy for new transactions is **members cover provider fees**. Collections are quoted so the member pays the intended contribution plus the collection fee: at 2.5%, a 5,000 RWF savings share costs 5,128 RWF and the provider retains 128 RWF. Payout requests show the wallet amount, provider fee and total savings debit or financed loan principal separately. A 10,000 RWF payout costs 10,250 RWF; withdrawals reserve this full cost, and a loan includes the payout fee in its principal. Collection fees do not repay loan principal. The provider rate is configurable with `XENDLY_FEE_BPS` (250 = 2.5%) for negotiated merchant pricing. XendlyPay rounds fees down. Accounting uses the actual confirmed fee: a savings fee difference is recorded as a separate adjustment, and a repayment surplus is returned to the member's savings. Existing transactions retain their originally agreed group/member fee policy so migrations cannot silently change their accounting. The cashbook records gross receipts/payments and provider fees separately.

Loan defaults are active for new requests: own savings loans use at most 80% of saved funds after existing commitments, including the financed payout fee; interest is 1% monthly. Member-backed loans use consenting members’ savings pools and 5% interest per three months, prorated for early repayment. Both have a default maximum term of 12 months. Default interest is simple on unpaid principal, using actual calendar periods and rounded up to whole RWF; it continues after maturity. Default backing keeps savings in the owner’s balance, locked until full repayment. No backer’s savings are reserved before they approve.

The **non-refundable processing fee defaults to 1% of the requested wallet amount**, rounded up to whole RWF, and is **deducted directly from the borrower’s available savings when a new request is submitted**. A 100,000 RWF request deducts 1,000 RWF from savings. There is no separate mobile money fee prompt or collection charge. The deduction is excluded from financed principal and interest and remains charged if the loan is declined or cancelled. Members confirm the deduction before submitting; insufficient available savings blocks the request without a debit. Borrowing capacity is calculated after the fee, so backing and withdrawal reservations cannot reuse it.

The deduction appears once as a protected savings adjustment and an audit event. It reclassifies existing group-held money into a processing fee; it creates no new cashbook receipt or payout because no external cash moves. Retries cannot deduct twice. Older confirmed mobile money fee payments remain recorded under their original source. Unpaid older requests offer a **Deduct fee from savings** confirmation; the system deducts only the remaining amount, preserves any already-confirmed portion, and requires an unresolved prior mobile payment to finish before converting the fee source. Database migrations do not debit old requests automatically.

Superadmin configures enabled loan types, rates and interest periods, simple/compound calculation, original/unpaid principal, calendar/30-day proration, rounding, maturity accrual, borrowing/backing limits, repayment periods and amounts, number of backers, lock versus deduct/restore, full versus proportional release, repayment allocation, grace days, self-approval and processing fee (0 disables it). Each new loan snapshots its terms so later policy changes do not alter existing agreements. All nominated backers must approve the exact principal funding plan before a manager approves it. The borrower accepts the approved terms before the secretary sends the payout. Confirmed repayments reduce principal and interest; backing is released under its frozen terms. Older loans retain their historical fixed-interest agreement.

## Staff accounts and notifications

Existing administrator accounts migrate to **secretary**. Managers can read members, numbers, reports and records, and approve/decline loans; they cannot edit records, change settings or send payouts. Only managers approve loans, including when a superadmin is present. Superadmin manages staff accounts and governance. In **Governance**, the secretary creates a separate first superadmin account with a one-use seven-day setup link; after that, only superadmin manages staff access and creates managers. Invitations are shown for sharing, not automatically emailed. Development `/demo` provides separate superadmin, manager, secretary and member accounts; it also creates the two new demo staff accounts when visited. A manager’s own loan needs another manager by default.

Superadmin connects OneSignal in **Governance** with the App ID, REST API key and public HTTPS application URL. Configure the same origin in OneSignal Web Push and the worker path `/onesignal/OneSignalSDKWorker.js`. The API key is encrypted using `AUTH_SECRET` and never returned to the browser; if that secret is rotated, re-enter the key and reconnect device identities. Members press **Enable notifications** and consent on each device. OneSignal settings control status updates, due-soon and overdue reminders, repeat intervals, optional backer reminders and stale queue expiry.

Production instrumentation checks reminders every five minutes. Local development can opt in with `PENALTY_WORKER_ENABLED=true`; a scheduler can also invoke `/api/penalties/run` with `Authorization: Bearer CRON_SECRET`. Superadmin’s **Run reminders & deliver queue now** checks loan reminders and retries queued delivery; it does not create fines. Retries retain the same OneSignal idempotency key. Paid-off loan reminders, disabled recipients and expired messages are discarded. An app instance must be running for the internal worker; use the scheduler on deployments that scale to zero.

Requested and approved withdrawals reserve savings so another withdrawal cannot reuse the same balance. Cancellation releases that reservation; a successful payout replaces it with a negative savings adjustment. Failed payouts leave the request approved for cancellation or an explicit new payout attempt. A pending or uncertain payout cannot be cancelled or recreated. Confirmed provider ledger records cannot be voided as ordinary manual records, and reserved savings cannot be removed by voiding a contribution.

## Confirmation and retries

Every payment is stored before calling the provider. Its UUID is both the provider reference and the permanent `Idempotency-Key`. Unknown network outcomes retain the saved transaction; **Check status** either retrieves its provider ID or safely repeats the same creation request and key. A known provider ID is reconciled through `GET /v1/payments/:id`, including for payouts. The documented minimal creation response is followed by a full transaction lookup before money is credited.

The webhook verifies HMAC-SHA256 over the exact timestamp and raw body, using constant-time comparison and a five-minute timestamp window. It checks transaction identity, phone, amount, currency, direction and mode. Delivery IDs have a unique database constraint. Member and payment row locks make concurrent deliveries and manual reconciliation safe. Status and accounting effects commit in one database transaction. Pending, failed and cancelled payments never credit savings; a succeeded transaction cannot regress to pending. Signed pings and unknown event types return success without changing money records.

Open member payment screens refresh saved pending statuses every five seconds while visible. **Check status** supplies reconciliation if a webhook is delayed. Administrators should review unresolved transactions periodically, and replay failed deliveries from XendlyPay when needed. The screens show up to 100 payments and requests, prioritizing unresolved items; the database retains the full history. There is no scheduled provider reconciliation job yet. Reconcile unresolved payments with their original app credentials before switching to a different XendlyPay app or mode.

## Validate

```sh
npm run test:payments
npm run test:payments:integration
npm run lint
npm run typecheck
npm run build
```

The integration runner uses the PostgreSQL connection in `.env.local` to create a uniquely named `elayo_mobile_money_test_*` database, applies the migrations there, runs mocked provider and signed-webhook scenarios, and drops that database afterwards. The local database role needs permission to create databases. Application records are not used for these tests.

Provider references: [Cash in](https://xendlypay.com/docs/cash-in), [Cash out](https://xendlypay.com/docs/cash-out), [Webhooks](https://xendlypay.com/docs/webhooks), [Idempotency](https://xendlypay.com/docs/idempotency), [Test mode](https://xendlypay.com/docs/testing), [API reference](https://xendlypay.com/docs/api-reference).
