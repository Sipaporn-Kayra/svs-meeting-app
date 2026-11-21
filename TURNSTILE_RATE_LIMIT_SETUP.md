# SVS Meeting App — Turnstile + Rate Limiting setup

Scope: Cloudflare Pages TEST project, branch `feature/secure-sheets-admin-api`. No private credentials are required in GitHub or chat.

## A. Turnstile — bot protection (strongly recommended)

1. In the [Cloudflare dashboard](https://dash.cloudflare.com/), open **Turnstile** and create a widget for the actual test Pages hostname (for example the project's `*.pages.dev` hostname; use the real host you see in the browser). Add a custom-domain hostname too if one is used. Choose **Managed** mode.
2. The widget displays a **Site Key** (public) and **Secret Key** (private). Do not post either secret in GitHub or chat.
3. In **Workers & Pages → SVS test Pages project → Settings → Variables and Secrets** for the environment deployed from the branch, add:
   - **`TURNSTILE_SITE_KEY`**: your public Site Key (plain text configuration is fine).
   - **`TURNSTILE_SECRET_KEY`**: your Secret Key (**Secret/encrypted**).
4. Add **both keys to the same environment**. If only one is configured, the API intentionally refuses to load the form.
5. Redeploy the most recent commit to apply runtime settings.

What changes: the registration page loads normally **without password**. The verification widget appears near the end of the form. A valid, fresh Turnstile token is required for *submit* and *restore* and is verified on the server through Siteverify, including expected hostname and action. Turnstile tokens expire and are single-use; the widget resets after a submit/restore attempt. The site key is public, but the secret key is server-only.

**Important:** without both keys Turnstile remains **disabled** for backward-compatible testing. This is a test branch; configure both keys before relying on bot protection.

## B. Request-rate limiting — Pages Functions

The test implementation supports a **best-effort Cloudflare KV limiter** on `/api/user/*`:
- `config`: approximately 60 requests / 5 minutes / visitor IP.
- `restore`: approximately 15 requests / 5 minutes / visitor IP.
- `submit`: approximately 10 requests / 5 minutes / visitor IP.

Set it up:
1. Cloudflare → **Storage & databases → Workers KV**: create a namespace, for example `svs-user-rate-test`.
2. **Workers & Pages → SVS test Pages project → Settings → Bindings → Add → KV namespace**.
3. Variable/binding name must be exactly **`SVS_RATE_KV`**; choose `svs-user-rate-test`. Apply to the correct deployment environment.
4. Save and redeploy.

**Critical limitation:** Workers KV is **eventually consistent**, and increments are not atomic. Two simultaneous requests may bypass the limit. This is abuse *mitigation*, **not a strict security limit**. It is not sufficient against distributed attackers or rapid parallel brute force. A robust production deployment should use zone-level **WAF Rate limiting rules** for a **Cloudflare-proxied custom domain**, or use a **Durable Object** with serialized counters, depending on hosting constraints. A `*.pages.dev` domain may not be in a customer-owned zone where zone WAF rules can be created. Do **not** claim WAF rules have been created unless explicitly confirmed.

If you own a custom Cloudflare-proxied domain, create a zone WAF rate limiting rule scoped precisely to `POST /api/user/submit` and `POST /api/user/restore`, not to the entire website or Admin login; start in log/challenge mode based on plan support to avoid blocking legitimate team users sharing a single office IP. [Cloudflare WAF rate limiting](https://developers.cloudflare.com/waf/rate-limiting-rules/). Evaluate available match keys and plans in your actual Cloudflare account. Rate limits should not block normal users submitting the form once, or the re-verification flow.

## C. Manual verification

- Open `register.html` in a private/incognito browser window. No access-code prompt should appear.
- Check Turnstile verification UI appears after the environment variables have been set.
- Try submitting without completing verification: should be stopped with a clear message.
- Complete Turnstile and submit a single approved **test** registration; capture the edit receipt. Ensure Google Sheets and Admin reflect one registration.
- To test restore, complete a new challenge and enter your private receipt. Check the saved registration loads. The receipt remains private.
- If you try too frequently with KV configured, API should return HTTP 429 and ask you to try later. **Do not flood live registration data.** Rate-limit requests can be measured with harmless `config` calls in a controlled development setting; be mindful of shared IP addresses.
- Test on desktop and mobile, and verify Admin login/export functions still work.

## Security notes

- Do not paste or screenshot Secret Keys, service account JSON, Admin passwords, or private edit receipts into chat.
- Turnstile siteverify is mandatory whenever both keys are configured; checks success + expected hostname + action.
- Turnstile is not a substitute for strong participant authentication or duplicate-concurrent-write protection. Edit receipts are bearer credentials. The Google Sheets duplicate check remains subject to race conditions across simultaneous writes.
- Existing Google Sheets data and original Streamlit `main` are unchanged by this code update.
