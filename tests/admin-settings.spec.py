"""
E2E: sign in as admin, save a Global Settings field, verify it persists.

Requires env:
  TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD  (skip if either missing)
  BASE_URL                                (default http://localhost:8080)
"""
import asyncio, os, sys, time, uuid
from pathlib import Path
from playwright.async_api import async_playwright

SS = Path(__file__).parent / "screenshots"; SS.mkdir(exist_ok=True)
BASE = os.environ.get("BASE_URL", "http://localhost:8080")
EMAIL = os.environ.get("TEST_ADMIN_EMAIL")
PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD")

async def main():
    if not EMAIL or not PASSWORD:
        print("SKIP: TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD not set"); return

    unique = f"e2e-{uuid.uuid4().hex[:8]}-{int(time.time())}"

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()

        # 1) Sign in via /dashboard
        await page.goto(f"{BASE}/dashboard", wait_until="domcontentloaded")
        await page.locator('input[type="email"]').fill(EMAIL)
        await page.locator('input[type="password"]').fill(PASSWORD)
        await page.screenshot(path=str(SS / "settings_1_signin.png"))
        await page.locator('button[type="submit"]').click()
        await page.wait_for_url(lambda u: "/admin" in u or "/dashboard/mfa" in u, timeout=15_000)
        if "/dashboard/mfa" in page.url:
            print("SKIP: MFA required for this account"); await browser.close(); return

        # 2) Go to Global Settings
        await page.goto(f"{BASE}/admin/settings", wait_until="networkidle")
        await page.screenshot(path=str(SS / "settings_2_page.png"))

        # 3) Edit "Tagline" (General panel)
        tagline = page.get_by_text("Tagline", exact=True).locator("..").locator("input")
        await tagline.wait_for(state="visible", timeout=8000)
        await tagline.fill(unique)

        # 4) Click the Save button inside the General panel
        general_save = page.get_by_role("heading", name="General & Privacy").locator("..").get_by_role("button", name="Save")
        await general_save.click()
        await page.wait_for_timeout(1500)
        await page.screenshot(path=str(SS / "settings_3_saved.png"))

        # 5) Full page reload — server re-reads from the DB via getAllSettings.
        await page.reload(wait_until="networkidle")
        tagline = page.get_by_text("Tagline", exact=True).locator("..").locator("input")
        await tagline.wait_for(state="visible", timeout=8000)
        after_reload = await tagline.input_value()
        await page.screenshot(path=str(SS / "settings_4_reload.png"))

        # 6) Fresh browser context (no cached React state / no service worker) —
        #    re-sign-in and confirm the same value comes back from the DB.
        fresh_ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        fresh = await fresh_ctx.new_page()
        await fresh.goto(f"{BASE}/dashboard", wait_until="domcontentloaded")
        await fresh.locator('input[type="email"]').fill(EMAIL)
        await fresh.locator('input[type="password"]').fill(PASSWORD)
        await fresh.locator('button[type="submit"]').click()
        await fresh.wait_for_url(lambda u: "/admin" in u or "/dashboard" in u, timeout=15_000)
        await fresh.goto(f"{BASE}/admin/settings", wait_until="networkidle")
        tagline2 = fresh.get_by_text("Tagline", exact=True).locator("..").locator("input")
        await tagline2.wait_for(state="visible", timeout=8000)
        fresh_value = await tagline2.input_value()
        await fresh.screenshot(path=str(SS / "settings_5_fresh_context.png"))

        await browser.close()

    if after_reload != unique:
        print(f"FAIL: after reload expected {unique!r}, got {after_reload!r}"); sys.exit(1)
    if fresh_value != unique:
        print(f"FAIL: fresh context expected {unique!r}, got {fresh_value!r}"); sys.exit(1)
    print(f"PASS: Global Settings persisted (reload + fresh context) tagline = {unique!r}")

asyncio.run(main())