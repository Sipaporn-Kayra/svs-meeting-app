# SVS Meeting User Portal — staging setup

This feature runs only on branch `feature/secure-sheets-admin-api`. The production Streamlit `main.py` is unchanged.

## New Cloudflare Secret (required)

In the **test Pages project** → Settings → Variables and Secrets → Production:
- `USER_FORM_CODE`: add as **Secret**, at least 6 characters. Use a different long, hard-to-guess code from `ADMIN_PASSWORD`.
- Existing `GOOGLE_SERVICE_ACCOUNT_JSON` and `GOOGLE_SHEET_ID` are reused.
- **Important:** The service account needs Google Sheet **Editor** access for writing, not Viewer.
- Save and redeploy. Do not share the Service Account JSON or private key.

Open `https://<your-test-pages-domain>/register.html` after deployment. The Admin dashboard links to this page.

## Form data and backward compatibility

- Reads date, employees, menu, drink customizations, and sport options from the original `Settings` tab.
- User form submits to a separate `/api/user/config` and `/api/user/submit` endpoint. Both require the form code in a POST request.
- Existing registrations stay in columns **A:I**. New rows are appended in columns **A:J**, with the new `Category` header created at **J1**. No existing cells in A:I are overwritten.
- Admin API now reads A:J and maps `Category` when supplied. For historical registrations it defaults to `อื่น ๆ`.
- Categories: `โรคระบาด / สุขภาพสัตว์`, `งานทดลอง / วิชาการ`, `งานฟาร์ม / ปฏิบัติการ`, `งานบริหาร / ทั่วไป`, `อื่น ๆ`.
- The Cloudflare form includes support for one beverage and multiple food selections per meeting date, matching the current Streamlit schema.
- This test endpoint **writes to the same Google Sheet** as the current Streamlit app. Use test dates/data, notify the organizer, and clean up test rows if needed. Do not distribute the code broadly yet.
- The form deliberately does not support image upload; **HTTPS image URLs** provide pictures, while names and menu orders still come from the Settings sheet.

## Optional menu image mappings in Settings

Add one row per date and type with exact Key and Value.

| Key | Value |
|---|---|
| `LunchImage_2026-11-27` | `{"ข้าวไก่อบ":"https://images.example.org/roast-chicken.jpg"}` |
| `DrinkImage_2026-11-27` | `{"ชาไทย":"https://images.example.org/thai-tea.jpg"}` |

Keys must match the actual date in `Global_Dates`, and JSON object keys must match the menu names configured under `Lunch_<date>` and `Drink_<date>`. The browser loads only image URLs starting with `https://`; when absent or invalid, a food/drink symbol appears. These are placeholder **examples**, not live image links. Host actual images where the browser can view them without login.

## Acceptance testing

1. Test form-code login (correct and incorrect), and admin dashboard still works.
2. Submit **one attendance registration** with one agenda/category and food/drink on a test date.
3. Refresh Admin and verify one person, food/drink totals, topic, presenter, minutes, and category.
4. Test multiple agendas per date. Verify meals/drinks are **not double counted**.
5. Test non-attendance, selecting more than one date, no agenda, and invalid/missing beverage.
6. Review menu images and mobile view on a phone.
7. Test expired date settings, missing Editor permission, and failure/retry behavior.
8. Ensure exporting Word/PDF continues to work on the Admin branch.

**Security before broader rollout:** Put Cloudflare WAF rate limiting on `/api/user/*` (especially form-code attempts and submit), add server-side submission deduplication/idempotency, and consider a team-specific login rather than a shared form code. At present the code only gates via `USER_FORM_CODE` and repeated submits from separate tabs can produce duplicate data.

## Known limits

- No image upload UI yet; images are mapped via Sheet Settings JSON.
- New Cloudflare form writes through a new backend, not Streamlit; original Streamlit form still works alongside it.
- On an unstable network, an API failure can be ambiguous: a retry might duplicate rows. Confirm in Admin before retrying.
- Do not merge to main or promote the test URL to the whole team until tests and security hardening are complete.
