# Daily savings penalties and OneSignal setup

## Savings window and charge calculation

A savings month is identified by the month in which its window opens. October 2026 runs from **20 October through 10 November**, inclusive, in Africa/Kigali time. Its first penalty day is **11 November**.

The rate is **500 RWF per share per day**, with **at most ten charged days per member per savings window**. The default charges only unpaid shares; administrators can select all committed shares instead. A partly unpaid share counts as one unpaid share. For example, four unpaid shares cost 2,000 RWF per charged day and at most 20,000 RWF if the unpaid balance does not change.

A day's fine is calculated using the outstanding shares at midnight Kigali time. A payment during that day stops/reduces the next day's charge; it does not erase a fine already charged. Each day has a unique member/window/day key, so retrying jobs cannot duplicate it. Charges are assessments rather than received-income entries. They are paid using the existing linked full/partial penalty-payment flow.

The expected share commitment is frozen when the cycle is first created. Only active members with positive monthly commitments that are whole multiples of 5,000 RWF are eligible. Members added after the window opens start with a later window. Administrators should confirm commitments in Members before enabling this rule: the source import initially inferred commitments from historical payments. Historical months before the selected start month are not charged.

## Reasons and administrator review

Members can select a covered savings month, explain their reason, and request a new payment date. Administrators review requests under Penalties and either decline with a note or approve a deadline after the original deadline. One request is allowed per member/window to avoid repeatedly restarting a pending pause.

By default, new charges pause while a reason awaits review; this is configurable. Approval pauses charges through the approved deadline and resumes on the following day. Declining a request resumes charges on the day after review when pending pauses are enabled. Paused days do not consume the ten charged-day allowance, and are never billed afterward. Earlier fines remain recorded; administrators can cancel unpaid assessments separately with an audit reason.

The unpaid-share basis and pending-review pause were selected provisionally from the user clarification questions; both are visible and configurable by administrators.

## Running automation

In Penalties, review the rule, choose the first savings month, confirm monthly commitments, and select **Enable automatic penalties**, then save. New installations default to paused. **Check now** performs the same idempotent check manually.

After migrations, the production Next.js process starts a worker every five minutes. It catches up any unprocessed days and stops after ten charged days. This hosting setup must keep the application running (the current deployment is configured for 24/7 operation). Development background processing stays off unless `PENALTY_WORKER_ENABLED=true`.

An external scheduler can instead or additionally POST `/api/penalties/run` with `Authorization: Bearer <CRON_SECRET>`. Missing configuration returns 503; incorrect authentication returns 401. Multiple app processes and simultaneous scheduled/manual checks are protected by member/cycle row locks and unique daily charge keys.

Use `npm run test:penalties` to run date/rate tests and integration tests in a disposable PostgreSQL database. Tests never run financial mutations against the app database.

## OneSignal

The app queues deadline reminders for still-unpaid members, new penalty alerts, new delay requests for administrators, and approval/decline updates for members. Queue records commit with the underlying change. Delivery retries reuse the queue UUID as OneSignal's `idempotency_key`; failed or unsubscribed sends are not reported as delivered.

1. Create/configure a OneSignal Web Push app with **Custom Code Setup**, for the exact production HTTPS origin.
2. Set server variables `ONESIGNAL_APP_ID` and `ONESIGNAL_REST_API_KEY`. Keep the API key private. `AUTH_SECRET` must remain stable, since it also derives opaque per-user push identities. No private user identifiers or API keys are included in browser configuration.
3. Set the OneSignal worker path to `onesignal/OneSignalSDKWorker.js`, with scope `/onesignal/`. The worker is hosted publicly at `/onesignal/OneSignalSDKWorker.js`; it uses a separate scope from the existing `/sw.js` PWA worker.
4. Members sign in and select **Enable savings notifications**. Browser notification permission is required. The SDK uses an opaque, authenticated user identity and clears it on sign-out.
5. Confirm a test subscription and notification in OneSignal. Until these variables are configured and real devices opt in, live delivery cannot be verified.

Official references:
- https://documentation.onesignal.com/docs/en/web-sdk-reference
- https://documentation.onesignal.com/reference/push-notification
- https://documentation.onesignal.com/docs/en/onesignal-service-worker

## Source document boundary

The workbooks describe historical monthly amounts, not daily receipt timestamps or this new policy. See `penalty-automation-review.md` for the earlier source investigation. The user-defined daily policy above supersedes the earlier proposed five-day rule. Imported unknown-timestamp savings are credited as already recorded, so the system does not invent retrospective lateness from historical cells.
