import asyncio, sys
from pathlib import Path
from playwright.async_api import async_playwright

SS = Path(__file__).parent / "screenshots"; SS.mkdir(exist_ok=True)
BREAKPOINTS = [("iphone-se", 320, 568), ("iphone-12", 390, 844), ("pixel-7", 412, 915), ("md", 768, 1024)]

async def main():
    fails = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for name, w, h in BREAKPOINTS:
            ctx = await browser.new_context(viewport={"width": w, "height": h})
            page = await ctx.new_page()
            await page.goto("http://localhost:8080/", wait_until="domcontentloaded")
            await page.wait_for_timeout(500)
            for label in ["Post an ad", "Buy credits"]:
                btn = page.locator(f"a[aria-label=\"{label}\"]")
                try:
                    await btn.wait_for(state="visible", timeout=3000)
                    box = await btn.bounding_box()
                    if not box or box["width"] < 20 or box["height"] < 20:
                        fails.append(f"{name}: {label} not clickable (box={box})")
                except Exception as e:
                    fails.append(f"{name}: {label} not visible ({e.__class__.__name__})")
            await page.screenshot(path=str(SS / f"{name}.png"))
            await ctx.close()
        await browser.close()
    if fails:
        print("FAIL"); [print(" -", f) for f in fails]; sys.exit(1)
    print("PASS: Post Ad + Buy Credits visible & clickable on all breakpoints")

asyncio.run(main())
