"""
Production-mode axe-core accessibility regression.

Loads a small set of key pages against a running server (default
http://localhost:8080 — the CI job builds and previews before running),
injects axe-core, and fails on any WCAG 2.1 A/AA violations.

Baseline: violations known to be acceptable can be added to ALLOWED_RULES
(id-only) so this job only fails on *new* rule violations.
"""
import asyncio, json, os, sys, html
from pathlib import Path
from playwright.async_api import async_playwright

SS = Path(__file__).parent / "screenshots"; SS.mkdir(exist_ok=True)
REPORTS = Path(__file__).parent / "axe-reports"; REPORTS.mkdir(exist_ok=True)
BASE = os.environ.get("BASE_URL", "http://localhost:8080")
AXE_SRC = "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.0/axe.min.js"

PAGES = ["/", "/search", "/cities", "/auth", "/privacy", "/terms", "/dashboard"]

# Add rule IDs here only after human review; keep this list short and audited.
ALLOWED_RULES: set[str] = set()

async def audit(page, path: str):
    await page.goto(f"{BASE}{path}", wait_until="networkidle")
    await page.add_script_tag(url=AXE_SRC)
    result = await page.evaluate("""async () => {
      const r = await window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa'] },
        resultTypes: ['violations'],
      });
      return r.violations.map(v => ({
        id: v.id, impact: v.impact, help: v.help,
        nodes: v.nodes.slice(0, 3).map(n => n.target),
      }));
    }""")
    return result

async def main():
    fails: list[str] = []
    report: dict[str, list] = {}
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()
        for path in PAGES:
            try:
                violations = await audit(page, path)
            except Exception as e:
                fails.append(f"{path}: audit crashed — {e.__class__.__name__}: {e}")
                report[path] = [{"id": "audit_crash", "impact": "critical", "help": str(e), "nodes": []}]
                continue
            new = [v for v in violations if v["id"] not in ALLOWED_RULES]
            report[path] = new
            if new:
                await page.screenshot(path=str(SS / f"a11y_{path.strip('/').replace('/','_') or 'root'}.png"))
                for v in new:
                    fails.append(f"{path}: [{v['impact']}] {v['id']} — {v['help']} · nodes={v['nodes']}")
        await browser.close()

    if fails:
        (REPORTS / "axe-report.json").write_text(json.dumps(report, indent=2))
        rows = []
        for path, vs in report.items():
            for v in vs:
                rows.append(
                    f"<tr><td>{html.escape(path)}</td><td>{html.escape(str(v.get('impact')))}</td>"
                    f"<td><code>{html.escape(v['id'])}</code></td><td>{html.escape(v.get('help',''))}</td>"
                    f"<td><pre>{html.escape(json.dumps(v.get('nodes', []), indent=2))}</pre></td></tr>"
                )
        (REPORTS / "axe-report.html").write_text(
            "<!doctype html><meta charset='utf-8'><title>axe-core report</title>"
            "<style>body{font:14px system-ui;margin:24px}table{border-collapse:collapse;width:100%}"
            "td,th{border:1px solid #ddd;padding:6px;vertical-align:top;text-align:left}"
            "pre{margin:0;font-size:12px;white-space:pre-wrap}</style>"
            f"<h1>axe-core violations ({sum(len(v) for v in report.values())})</h1>"
            "<table><thead><tr><th>Page</th><th>Impact</th><th>Rule</th><th>Help</th><th>Nodes</th></tr></thead>"
            f"<tbody>{''.join(rows)}</tbody></table>"
        )
        print("FAIL: accessibility violations:")
        for f in fails: print(" -", f)
        print(f"Reports written to {REPORTS}/axe-report.json and axe-report.html")
        sys.exit(1)
    print(f"PASS: 0 axe violations across {len(PAGES)} pages (allowed rules: {len(ALLOWED_RULES)}).")

asyncio.run(main())