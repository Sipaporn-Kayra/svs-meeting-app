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
5. The API reads `A:I` from the first worksheet, matching Streamlit `db.sheet1`, and reads the named `Settings` worksheet. Confirm the `Settings` tab exists and the header columns match.
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


## Admin agenda editor (next development stage)
The admin page now includes an editor that reads live registrations and supports:
- Select a meeting date, then click **ตรวจสอบวาระใหม่** to review new submitted topics.
- Select entries and click **รวมรายการที่เลือก**. Submitted `Name` is used as Presenter, `Topic` as title, and `Time` as minutes.
- Edit topic/presenter/duration, reorder with arrows, or add/delete topics. All changes stay in the browser and **do not write back to Google Sheets**.
- After clicking Refresh, the current edited list stays intact; use Review to explicitly merge new submissions.
- **บันทึกร่าง** stores an unencrypted draft only in browser sessionStorage for the selected date; it is not shared across devices or suitable for sensitive meetings. Use the export functions to archive the work.
- Export as a browser print-to-PDF, editable .docx, or CSV. Headings use Thai month/B.E. year and a meeting-location field. Signature positions are left (ผู้เสนอ) and right (ผู้เห็นชอบ).
- Schedule time rules are a prototype: opening 45 min, breaks at ~10:30 (15 min), noon (60 min), 14:45 (15 min), closing at or after 16:30 (30 min). The editor warns on overruns, but its break placement and conflict handling need user acceptance testing before production.
- No Google Sheets write endpoint has been added. Login and live refresh still require the configured Cloudflare secrets.

### Regression testing
1. Login, select date, load registrations. Verify food/drink KPIs still match the source.
2. Click Review -> merge selected submissions -> confirm Presenter and minutes.
3. Edit an existing topic, click Refresh, and confirm the edit remains.
4. Add new row to Google Sheets through the existing Streamlit application, click Refresh then Review, and check that only the new row is offered.
5. Check date switching, manual topic creation, deleting and reordering, as well as a meeting extending beyond 17:00.
6. Download Word, open in desktop Word and check Thai text and left/right signatures.
7. Print/Save to PDF from Chrome, inspect pages and the signature layout.
8. Test from mobile and verify logout still blocks Admin API access.

**Do not promote this branch or direct production traffic to it until steps above pass.**
