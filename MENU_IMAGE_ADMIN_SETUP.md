# Admin menu-image manager setup — SVS Meeting App test

The menu-image manager is on branch `feature/secure-sheets-admin-api` only. The Streamlit `main` branch remains unchanged.

## One-time Cloudflare Pages setup

1. In Cloudflare, open **R2 Object Storage** and create a private bucket, for example `svs-menu-images-test`. This is an R2 bucket name, **not** a secret.
2. Open **Workers & Pages → svs-meeting-app-test → Settings → Functions → R2 bucket bindings** (the precise dashboard labels may vary).
3. Add a **binding name `MENU_IMAGES`** and select the R2 bucket you created. Make sure the binding applies to the **Production** environment of the test Pages project.
4. Save, then trigger a fresh production deployment from the latest branch commit.
5. Existing `GOOGLE_SERVICE_ACCOUNT_JSON` must remain a **Secret**; do not paste it into GitHub or messages. The existing Service Account needs **Editor** access to `SVS_Database` because saving menu images writes image-map rows in the `Settings` tab.

You do **not** need a public R2 bucket or R2 API token. The Pages Function reads the R2 bucket through the server-only binding and exposes individual menu photos through `/api/menu-image/<generated-id>`.

## Using it

After Admin login:

1. In **จัดการรูปอาหารและเครื่องดื่ม**, choose the meeting date, type (food or drink) and the configured menu.
2. **Recommended:** choose a JPG, PNG or WebP file (maximum 2 MB), and click **อัปโหลดและบันทึกให้เมนู**. The backend stores it in R2 and writes the image reference to the existing Settings tab.
3. **Fallback:** paste a publicly reachable HTTPS image URL and click **บันทึก URL แทน**; this does not use R2.
4. To disconnect a photo from the menu, click **ลบรูปของเมนูนี้**. This removes the link in Settings but currently does **not** remove the original object from R2.
5. Open `register.html` and reload it after access-code login. The food/drink card should show the newly configured photo.

The form's menu names and dates come from Settings. This feature does not create menu items or edit meal names. To add a new menu item, update the existing Lunch/Drink settings first.

## Verification

- Confirm wrong/non-Admin access to `/api/admin/menu-config` is denied (401).
- Confirm upload with nonimage or >2 MB files is rejected.
- Confirm photo upload, photo preview and User Portal card rendering.
- Confirm URL fallback persists and appears after reloading.
- Confirm switching meal date and saving different photos does not overwrite other menus.
- Recheck Admin Word/PDF exports and User Portal submissions afterward.

## Cautions

- This test instance is connected to the existing Google Sheet, so setting an image URL changes the **Settings** sheet used by the real form (only image-map keys, not agenda or registrations). Test with a limited menu before introducing to the team.
- Public read-only photo endpoints are designed for food/drink images, **not confidential images or people/patient data**.
- R2 uploads currently leave old objects behind when a menu photo is replaced or disconnected. Periodic cleanup or safe reference-aware deletion should be added before large-scale rollout.
- Photo source websites may block embedding or change image URLs later; R2 is the stable default.
- Consider image optimization and explicit R2 retention/cleanup policies for rollout across other teams.
