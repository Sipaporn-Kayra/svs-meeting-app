# SVS Meeting App — ตั้งค่ารอบประชุมและรูปรวม (Branch ทดสอบ)

Branch: `feature/secure-sheets-admin-api` (Cloudflare Pages test). No changes to Streamlit `main`.

## Admin features

1. **ตั้งค่ารอบประชุม**: pick a YYYY-MM-DD date, and choose either:
   - **แทนวันเดิม** (`replace`): replace `Global_Dates` with this single active day.
   - **เพิ่มวันที่** (`add`): append this day to active `Global_Dates`, max 10 open dates.
2. Edit the food and drink lists as one menu name per line. Save through the dashboard. This writes `Lunch_<date>`, `Drink_<date>` and `Global_Dates` to the existing Settings sheet.
3. **รูปรวม**: choose active date and category (food/drink), then upload from computer to the already configured R2 bucket or paste an HTTPS URL. Saving writes `LunchBanner_<date>` or `DrinkBanner_<date>` to Settings.
4. The existing per-menu picture manager continues to work and reloads menu lists after a meeting-round update.
5. User Portal displays the shared image above the corresponding menu list, plus individual menu cards when an image exists for that menu.

## Preserve historical data

- No registration rows are deleted or rewritten by meeting-round editing.
- Admin's filter includes active dates **and past dates found in the registration records**.
- Per-menu image mappings for old dates are not deleted; they remain in Settings.
- A previous date disappears from **new** User Portal registrations when replaced in `Global_Dates`, but can continue to appear as historical records in Admin.
- Avoid renaming or removing a currently offered menu or active date after participants have already submitted. New registrations will use the changed settings, while old registration rows remain unchanged.

## Suggested manual tests (protect real data)

1. In the test Admin, use an existing upcoming date and inspect the currently loaded food/drink lists without saving.
2. Test the shared food image for that date with one picture (R2 upload), then reload the User Portal and confirm the banner appears above food cards and that individual menu pictures still appear.
3. Test the shared drink image similarly. Test HTTPS URL fallback for one category.
4. Before using `replace` or `add`, plan an actual new registration round: **the test site shares the existing Google Sheets Settings**. Saving changes active dates for other connected clients, including the older Streamlit app.
5. When approved, create the next meeting date, configure both menu lists and save. Verify User Portal now displays only the intended open dates and Admin still shows old registrations by their historical date.
6. Check registration submission, Admin counts, PDF/Word exports, and menu upload after the date change.
7. Configure suitable Cloudflare rate limits and a plan for duplicate-submission handling before wide distribution.

## Security and operational considerations

Only authenticated Admin endpoints can change Settings or upload images. Google credentials stay in Cloudflare Secrets; no secrets need to be shared in chat or GitHub.

The shared photo is intended to illustrate the whole food/drink section. It should not misleadingly imply that all shown items are offered. Uploaded R2 images remain when replaced/removed from a menu and need retention cleanup later.

The feature code was statically checked but cannot be considered runtime-tested until the user deploys it to Cloudflare and verifies real behavior.
