"""
Verify anonymous callers never receive contact_email / contact_phone from
any public ads endpoint (server-fn RPC and any /api/public/* surface).

Strategy: enumerate live ad short_ids via the search page, fetch the same
data an anon browser would, then assert the response bodies never contain
the forbidden field names.
"""
import asyncio, json, os, re, sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE = os.environ.get("BASE_URL", "http://localhost:8080")
FORBIDDEN = ("contact_email", "contact_phone")

PUBLIC_PAGES = [
    "/",
    "/search",
    "/search?q=a",
    "/search?q=a&page=2",
    "/search?q=service",
    "/search?category=services",
    "/cities",
]

async def main():
    leaks: list[str] = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()

        captured: list[tuple[str, str]] = []

        async def on_response(resp):
            url = resp.url
            if "/_serverFn/" not in url and "/api/" not in url:
                return
            try:
                body = await resp.text()
            except Exception:
                return
            captured.append((url, body))

        page.on("response", on_response)

        for path in PUBLIC_PAGES:
            await page.goto(f"{BASE}{path}", wait_until="networkidle")
            await page.wait_for_timeout(400)

        # Walk into any city listing pages surfaced from /cities (state/city/category).
        try:
            await page.goto(f"{BASE}/cities", wait_until="networkidle")
            hrefs = await page.eval_on_selector_all(
                'a[href^="/"]',
                "els => Array.from(new Set(els.map(e => e.getAttribute('href')))).filter(h => h && h.split('/').length >= 3).slice(0, 6)",
            )
            for href in hrefs:
                try:
                    await page.goto(f"{BASE}{href}", wait_until="networkidle")
                    await page.wait_for_timeout(300)
                    # Follow the first ad detail (deepest path) on that listing.
                    ad = await page.eval_on_selector_all(
                        'a[href^="/"]',
                        "els => els.map(e => e.getAttribute('href')).find(h => h && h.split('/').length >= 5) || null",
                    )
                    if ad:
                        await page.goto(f"{BASE}{ad}", wait_until="networkidle")
                        await page.wait_for_timeout(300)
                except Exception:
                    continue
        except Exception:
            pass

        await browser.close()

    # Assert: no captured body contains contact_email/contact_phone.
    for url, body in captured:
        low = body.lower()
        for field in FORBIDDEN:
            if field in low:
                leaks.append(f"{field} present in response from {url} (first 200 chars: {body[:200]!r})")

    print(f"Inspected {len(captured)} anon responses across {len(PUBLIC_PAGES)+2} pages.")
    if leaks:
        print("FAIL: contact fields leaked to anonymous clients:")
        for l in leaks: print(" -", l)
        sys.exit(1)
    print("PASS: no contact_email/contact_phone found in anon public payloads.")

asyncio.run(main())