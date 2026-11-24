# Paid features: approval and usage controls

Migration `011_paid_feature_controls.sql` and the matching `travel-services`
deployment require explicit approval for every account. Trip ownership does not
grant paid access. Signup, manual planning and collaboration remain available.
Existing accounts, including the operator, are not automatically approved.

## Approve or revoke an account

In your [Supabase dashboard](https://supabase.com/dashboard/project/vgyitrkaurotcibtgxbh),
open **Authentication → Users**, find the verified email and copy its user ID.
In **Table Editor → paid_feature_access**, insert that ID with `approved = true`.
To revoke access, change it to `false`. Accounts cannot change this table through
the website. Approval is account-wide, but trip membership is still required.
You do not need to share your Supabase dashboard with approved users.

Alternatively run this in the dashboard's SQL Editor, replacing the email:

```sql
insert into public.paid_feature_access(user_id, approved, updated_at)
select id, true, now() from auth.users
where lower(email) = lower('friend@example.com')
  and email_confirmed_at is not null
on conflict(user_id) do update set approved=true, updated_at=now();
```

Ensure the statement reports **one affected row**. Zero means no matching verified
account. To revoke, set `approved=false` for that user in the Table Editor. A
revocation blocks new requests; it cannot cancel a provider request already sent.

## Default limits

| Control | Default |
| --- | --- |
| Site monthly reserved usage | $10 USD |
| Site daily reserved usage | $3 USD |
| Account daily reserved usage | $3 USD, 100 requests |
| Site requests per calendar minute | 30 |
| Account requests per calendar minute, all actions combined | 12 |
| Concurrent requests | 2 per account, 5 site-wide |
| Abandoned request lease | 90 seconds |

Calendar periods reset in **UTC**, including the monthly allowance on the first
day of each month. Daily and monthly counters survive function restarts and
redeployments. Database row locks serialize reservations across accounts and
function instances. The existing per-action minute limits remain in force too.
Calendar-minute limits can allow adjacent-window bursts; concurrency and budget
ceilings still apply.

Requests reserve conservative USD cents **before** any provider request:

| Action | Reserved allowance |
| --- | --- |
| Text search, place details, one route | 5 cents |
| Nearby search, including resolving its center | 10 cents |
| Route matrix | 2 cents × number of origins × number of destinations |
| One new browser map instance | 2 cents |

Failed/cancelled requests are not refunded. This intentionally overcounts actual
usage. A 12-stop matrix reserves $2.88, including both chunks. Prices were checked
against [Google's global price list](https://developers.google.com/maps/billing-and-pricing/pricing)
on November 24, 2026. Review these reservations if APIs, fields, billing terms or
pricing change. Provider free allowances are ignored. This is a usage estimate,
not a billing integration or a guarantee of a $10 total invoice.
The ledger begins at zero when deployed; it does not import charges incurred
earlier in the month or charges from other projects using the same billing account.

The legacy AI and automatic exchange-provider endpoints are disabled, including
for approved users, because they are unused/unpriced by these controls. Manual
rates remain available. Do not re-enable them without adding budget reservations.

`paid_service_settings` can lower the limits. Its monthly setting cannot exceed
1000 cents. Set `enabled=false` to stop new paid requests immediately. View
`paid_service_usage`, particularly `scope='global:month'`, for reserved cents.
Do not delete current counters to unblock users: that resets spending protection.
Old rows can be archived after their periods have ended. Expired concurrency
leases are pruned automatically; they never refund reserved budget.

## External controls still required

Browser maps must be authorized by the backend before the app constructs them.
However, Maps JavaScript uses a public browser key: scripts can bypass the app
and call Google directly. Older cached app versions also predate the map gate.
Application approval does not make a browser API key secret.

In Google Cloud, keep separate browser/server keys, restrict each to the required
APIs and appropriate application restrictions, and set conservative quotas for
Maps JavaScript, Places API (New), and Routes API. Review billing units: matrices
are billed per element. Disable unused APIs, review usage and set budget alerts.
Google budget alerts do **not** stop spending. Previously exposed keys may need
rotation; frontend changes cannot revoke an old key.

Supabase and SMTP traffic are outside this $10 Google-service reservation ledger.
Check your Supabase plan's Spend Cap coverage and Auth email rate limits. CAPTCHA
can reduce signup/email abuse but is not a substitute for approval and quotas.
No IP limiter is claimed here: IP-based enforcement needs a trusted ingress with
an address the caller cannot forge. A firewall protecting just the static Pages
site does not protect the public Supabase endpoint.

## Deploy and verify

1. Apply migration 011 with `supabase db push --linked`.
2. Deploy `supabase functions deploy travel-services --project-ref vgyitrkaurotcibtgxbh`.
   Supabase provides `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions automatically;
   never put it in a browser environment variable.
3. Build and publish the frontend so map creation uses the gate.
4. Approve your own verified account explicitly. Verify a different unapproved
   account receives 403 with no upstream requests, then approve/revoke it as needed.
5. Check Google and Supabase provider-side controls separately. The code deployment
   does not provision or verify provider billing settings.

The endpoint returns 403 for missing approval, 429 plus `Retry-After` for exhausted
allowances, and 503 if budget enforcement is unavailable. Budget enforcement fails
closed. Leases are released in `finally`; errors leave them to expire safely.

Coordinate-only map lookups now use a shared 29-day cache. Cache hits require approval but do not reserve paid allowance. See [location caching](location-caching.md).
