# Admin registration management — staged test checklist

This feature is committed only to `feature/secure-sheets-admin-api`. Original Streamlit `main` is unchanged. All real secrets remain in Cloudflare encrypted environment settings. The test Pages app is connected to the **actual Google Sheet**: changes are real.

## Admin UI
Open Admin Dashboard → **จัดการข้อมูลลงทะเบียนและตรวจสอบรายการซ้ำ**. Use name/date/status filters. Duplicate warning is based on *two or more separate active registration groups sharing the same name and date*, not on multiple topic rows within a single registration.

Registration groups use `RegistrationID + Date` when metadata is present; older entries without RegistrationID are grouped by `Timestamp + Name + Date + Attendance`.

Admin can **ยกเลิกชุดนี้** (sets `RecordStatus = ARCHIVED` in column O on all rows belonging to the group) and **กู้คืนชุดนี้** (clears status). Original rows remain in the sheet. The Dashboard's attendance/agenda/food/drink totals exclude archived rows. User Portal's duplicate checker and private receipt lookup also ignore archived rows, so a replaced registration can be submitted again. Restoring a group is blocked if another active group with the same name/date exists.

## Test safely
1. **Make a backup of the Google Sheet before testing.** Note a real test registration and its agenda topic(s).
2. Open Admin, expand registration management, filter by meeting date/name. Check one registration with 2 topics displays **one group** and **rowCount=2**.
3. Confirm an actual duplicate group is highlighted if two active groups have the same participant and meeting day. Do not manufacture duplicates in live data.
4. Archive **only a verified test group**. Read confirmation. Ensure all rows for that group show `ARCHIVED` in column O. Compare Admin summary before/after: only that group's meals/drinks/topics should disappear. Other attendees must remain.
5. Reload Admin and verify group remains archived.
6. Restore the test group if it does not conflict with another active group. Verify the summary counts return and column O is blank for the group.
7. Try archive→new submission of same name/date if there is an approved test case; new submission should no longer be blocked by the archived group. A newly submitted registration may cause restore of the original group to be correctly denied as a duplicate.
8. Test non-attendee legacy rows with Date `-` if available.
9. Test search, status filters, and an older closed meeting date.

## Important limits
- This is **soft archive**, not permanent deletion. Exports and any external systems that read Google Sheets directly must also exclude rows whose column O (`RecordStatus`) is `ARCHIVED` if they should ignore test data. The Cloudflare Admin summary is updated, but the separate Streamlit app may **still count archived rows** until its filtering logic is adjusted.
- No real data was deleted or changed while creating this feature. Admin status buttons write to Google Sheets **only after a human click and confirmation**.
- Do not alter the column order of A:O; column O is reserved for `RecordStatus`.
- Old records lacking a stable RegistrationID use timestamp-based grouping. If a legacy batch has inconsistent timestamps, verify its rows before archiving.
- Avoid concurrent Admin archiving and User edits of the same registration; row-number-based Google Sheets operations are not transactional across independent requests.
- The new functionality was statically checked and unit-tested on synthetic sample rows; full Cloudflare/Google Sheets runtime tests are still required.
