# SVS Meeting User Portal — duplicate prevention and edit-your-registration test plan

**Scope:** branch `feature/secure-sheets-admin-api`, Cloudflare Pages test project; original Streamlit `main` untouched. Existing registered A:J rows remain intact.

## Changes
- New submissions check for existing **Name + Meeting Date**, rather than assuming a single row per person. Multiple agenda topics produce multiple rows but belong to one registration.
- If the person already registered for the chosen meeting day, the API responds with HTTP 409 and does **not** append duplicate rows.
- New successful submissions return a random 48-character private **edit receipt**. Show and copy it after submitting; do not share it with coworkers.
- Only a matching **name + edit receipt** can load and update a registration. The receipt is stored in the sheet as a SHA-256 digest only.
- Registration metadata stored in added columns **K:N**: `EditTokenHash`, `RegistrationID`, `RequestID`, `Revision`. Columns A:J and existing Admin reports continue to work.
- Editing one registration deletes its original rows and appends the updated rows as a single Google Sheets `spreadsheets.batchUpdate` request. Other participants' entries are not intentionally changed. Its date/menu/topic values are replaced by the newly submitted selection.
- Old entries created before the receipt feature do **not** have edit receipts; users must contact Admin to correct those records.
- Entries from a **closed meeting date** are not editable through this public interface; contact Admin.

## Manual test, use an agreed temporary participant/date and avoid real duplicate meals
1. Deploy the current branch and open `register.html` in a private browser window.
2. Submit one new registration and verify the success banner contains an edit receipt; copy it privately.
3. Verify Sheets columns K:N populated and Admin counts show one meal/drink.
4. In a separate private browser window, select the **same participant and date** and attempt to submit again. Expect duplicate warning and **no extra rows**.
5. Return to the first browser or open a new window. Select the same name, paste the edit receipt and click **โหลดข้อมูลเดิมเพื่อแก้ไข**. Verify food, drink, agenda topic, category and meeting date are loaded.
6. Change food/drink or add an agenda topic, then click **บันทึกการแก้ไข**.
7. Verify Admin shows **one attendee and only one set of meals/drinks**, while topics match the updated registration; registration old rows were replaced.
8. Attempt to load the record with a wrong receipt. Expect denial; no data returned.
9. Verify a participant cannot use a different name with the same receipt.
10. Test the **ไม่เข้าร่วม** status and subsequent duplicate detection with care; new declined submissions create a dated record for each currently open day; historical legacy declined rows with Date = "-" remain untouched and cannot be reliably matched to a future meeting date.

## Known limits & release blockers
- **Concurrent write race:** Google Sheets has no atomic unique key. Two submissions for the same person/date at nearly the exact same instant may both pass the pre-insert duplicate lookup. Solve with Durable Objects (serialized per participant/date) or another transactional store before claiming strict concurrency-safe prevention.
- **Old records:** No self-service edits before receipts were introduced; Admin must resolve legacy duplicates or invalid data.
- **Token storage:** Receipt is not stored for recovery in the browser; participant must copy it. Losing it requires Admin help. Avoid sending it via shared channels.
- **Editing metadata:** Do not manually edit or rearrange columns K:N, and do not alter the sheet column order.
- **Open form abuse:** Apply Cloudflare rate limiting / Turnstile and consider stronger participant identity verification before broad sharing. Name-selection is public and edit receipts are bearer secrets, so their protection is important.
- **Test uses live Google Sheets:** register only a clearly marked approved test participant, or manually arrange an agreed test window. Do not repeat submissions against live records.
- This is statically syntax-checked only. Cloudflare runtime and real Google Sheets updates must be tested before rollout.
