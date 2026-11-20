# SVS Meeting App — Secure Google Sheets Admin (development branch)

This branch is an **isolated, read-only backend integration**. Existing Streamlit `main.py` remains untouched.

## Files
- `functions/api/admin/[[path]].js`: Cloudflare Pages Functions, admin login/logout/session, fresh Google Sheets fetch (no cache), attendance/food/drink/agenda aggregation.
- `public/index.html`: Admin dashboard, Kanit headings + Noto Sans Thai body. No prototype/font-name banner.

## Deploy the test branch (do not point production domain here yet)
1. Create a **separate** Cloudflare Pages project connected to this GitHub repository, selecting branch `feature/secure-sheets-admin-api`.
2. Use **Build command:** `exit 0`, **Build output directory:** `public`. Pages Functions live in repository `functions/`.
3. Add the following encrypted Secrets in the Cloudflare Pages project (production and preview independently):
   - `ADMIN_PASSWORD`: a strong, unique admin password (do not reuse the Streamlit password).
   - `SESSION_SECRET`: random secret of at least 32 characters.
   - `GOOGLE_SERVICE_ACCOUNT_JSON`: the **full JSON** of the existing Google service account (as a Secret, never in GitHub).
   - `GOOGLE_SHEET_ID`: spreadsheet identifier taken from the URL for `SVS_Database`.
4. Enable Google Sheets API in the service account's Google Cloud project (if needed), and share the spreadsheet **Viewer** access with the service account's `client_email`. Read-only access is sufficient.
5. Verify the actual first worksheet title (the Streamlit code uses `db.sheet1`, which does not guarantee the title is `Sheet1`). Update the range in `functions/api/admin/[[path]].js` if its name differs.
6. Test login, wrong password, login expiry, selecting a date, Refresh after new registration, food/drink counts, and logout.
7. Configure Cloudflare WAF/rate limiting for `/api/admin/login` **before exposing** the test deployment; only give test URL to authorized staff.

## Existing data compatibility
User tab columns: `Timestamp,Name,Attendance,Date,Lunch,Drink,Sport,Topic,Time`.
Settings columns: `Key,Value`. Presenters use `Name`; topics use `Topic`; durations use `Time`.
Rows with repeated presentations often contain `Lunch=-` and `Drink=-`, so food and drink totals must skip `-`.
Records are read directly on each Refresh; no write call is made to Sheets.

## Security and release notes
- Browser receives only filtered API output; Google credentials and admin password remain server-side.
- Admin is authenticated with an eight-hour HMAC-signed HttpOnly/Secure/SameSite=Strict cookie. Rate-limit the password endpoint. HTTPS is mandatory.
- The current password check uses a configured secret and constant-time digest comparison. For larger multi-admin deployments, replace with user-level identities and stronger identity controls (e.g., Cloudflare Access + enterprise IdP).
- The API deliberately has **read-only scope** and never changes existing Google Sheets data.
- Current page is the **live-data integration stage**, not yet the full V5 agenda editor/Word/PDF page. The reviewed merge workflow must be integrated before switching to production.
- Do not merge into `main` or change the existing Streamlit deployment until security and functionality have been verified.
