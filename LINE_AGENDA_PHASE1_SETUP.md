# SVS LINE agenda notifications — Phase 1 (manual Admin send)

**Branch:** `feature/secure-sheets-admin-api` only. Main/Streamlit unchanged. The Cloudflare Pages test project shares the actual Google Sheet; changes to Settings are real.

## What was implemented

- Admin Dashboard → **แจ้งความคืบหน้าวาระเข้า LINE** (collapsible).
- Admin selects an *active meeting date*, clicks **ดูตัวอย่างข้อความล่าสุด**, reviews the text, then explicitly confirms **ส่งข้อความเข้า LINE กลุ่ม**.
- Counts proposed agenda topics, total proposed minutes and four agenda categories. Excludes rows marked `RecordStatus=ARCHIVED` in column O, does not show attendee names, food, or drinks. Warns that topics are proposals, not the approved schedule.
- The server re-reads Google Sheets immediately before sending. If proposed agenda content has changed since preview, sending is refused until a fresh preview.
- Calls LINE Messaging API `POST https://api.line.me/v2/bot/message/push` with an `X-Line-Retry-Key` UUID. The same key is not reused for a later button click.
- Only authenticated Admin sessions can preview, configure the group, or send. LINE Channel Access Token stays in Cloudflare Secrets.
- A separate signed webhook `POST /api/line/webhook` receives group events; it never sends messages or saves chat content. It writes the latest candidate group ID to `Settings` and requires Admin confirmation to use it.

## Initial setup — no LINE messages will be sent automatically

1. Create or open an appropriate **LINE Official Account** and **Messaging API channel** using [LINE Developers Console](https://developers.line.biz/console/).
2. In the Messaging API channel, enable **Allow bot to join group chats** and enable **Use webhook**.
3. Configure webhook URL to the complete **test Pages** host, ending with `/api/line/webhook`. Example format: `https://YOUR-TEST-HOST.pages.dev/api/line/webhook`. Use the exact host for the test deployment.
4. Copy credentials directly into the **correct Cloudflare Pages deployment environment** under **Settings → Variables and Secrets**:
   - `LINE_CHANNEL_ACCESS_TOKEN` = Messaging API channel access token (**Secret**).
   - `LINE_CHANNEL_SECRET` = Messaging API channel secret (**Secret**).
   Do not put them in GitHub, Google Sheets, screenshots, or chat.
5. Redeploy the test environment after configuring the Secrets.
6. Invite the LINE OA bot into the intended SVS LINE group. In that group, send the exact text `/svs-connect` (group message; the webhook reads this command only to capture the group ID). The bot does **not** reply to this command.
7. Open **Admin Dashboard → แจ้งความคืบหน้าวาระเข้า LINE → เชื่อม LINE กลุ่ม**. Click **ตรวจสอบกลุ่มที่พบ**. Compare the timing/group with the intended group, then click **ยืนยันใช้กลุ่มนี้**. Only the selected Group ID becomes active.
8. Select an active meeting date, click **ดูตัวอย่างข้อความล่าสุด**, verify counts/categories and **only if ready** click **ส่งข้อความเข้า LINE กลุ่ม**. A second confirmation appears before sending. A successful API response means LINE accepted the request, not that every member read it.

**Alternative:** A technically responsible Admin may enter a verified Group ID in the manual field. Do not guess or share Group IDs. Prefer the signed webhook flow.

## Testing checklist

- Admin without LINE secrets: preview works, send remains disabled.
- Authenticated Admin: correct active dates, correct totals and four categories, no food or names.
- Archived test entries: excluded from the preview as from Admin KPI.
- Closed date: API refuses sending.
- Without login: LINE admin endpoints return 401.
- With invalid webhook signature: `POST /api/line/webhook` returns 401 and does **not** write a group ID. With no channel secret: 503.
- Group join or `/svs-connect`: a verified webhook records the candidate ID, but nothing is pushed.
- Group approval by Admin: candidate masked in UI; no token exposed.
- When agenda changes after preview: send returns 409 and requires new preview.
- Real send: perform **one authorized test** into a group whose members are aware. Verify the LINE message matches Admin preview.
- Recheck LINE OA messaging allowance/quota. Sending a group push may count toward the monthly message quota by number of recipients.

## Limits / future features

- This Phase 1 intentionally has **no automatic per-submission notifications** and **no reminders on a timer**.
- The LINE message summarizes **proposed** items stored in Google Sheets, not the manually edited final agenda layout.
- No promised free monthly message quota; check the actual LINE OA subscription/plan.
- Webhook stores only the last verified candidate group. Invite/send command in the correct group right before Admin approval, so no unrelated group's event is selected.
- If the bot leaves the group or its token is revoked, LINE push will fail.
- A separate approved workflow is needed for personal meal-order lookups (Phase 2). Do not disclose individuals' menu selections in a group chat.

References: [LINE webhook signature](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/), [group chats](https://developers.line.biz/en/docs/messaging-api/group-chats/), [send messages](https://developers.line.biz/en/docs/messaging-api/sending-messages), [retry key](https://developers.line.biz/en/docs/messaging-api/retrying-api-request/).
