"""Flow 8 fix: Test listing click navigation with proper Next.js handling."""
from playwright.sync_api import sync_playwright
import os

SCREENSHOTS_DIR = "/tmp/roomshare-tests"
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

issues = []
passes = []

def log_pass(msg):
    passes.append(msg)
    print(f"  PASS: {msg}")

def log_issue(msg):
    issues.append(msg)
    print(f"  ISSUE: {msg}")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900})

    page.goto("http://localhost:3000/search", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(5000)

    # Debug: examine the listing card structure
    print("=== Listing Card Structure ===")
    first_card = page.locator("[data-testid='listing-card']").first
    if first_card.is_visible():
        html = first_card.evaluate("el => el.outerHTML.substring(0, 500)")
        print(f"  First card HTML: {html[:300]}...")

        # Get all links in the card
        card_links = first_card.locator("a").all()
        print(f"  Links inside card: {len(card_links)}")
        for i, link in enumerate(card_links[:5]):
            href = link.get_attribute("href") or ""
            text = link.text_content().strip()[:50] if link.text_content() else ""
            print(f"    [{i}] href='{href}' text='{text}'")

    # Try clicking the listing link with different approach
    print("\n=== Approach 1: Click listing link directly ===")
    listing_link = page.locator("a[href*='/listings/']").first
    href = listing_link.get_attribute("href")
    print(f"  Link href: {href}")

    # Use expect_navigation pattern
    try:
        with page.expect_navigation(timeout=10000):
            listing_link.click()
        print(f"  URL after click: {page.url}")
        if "/listings/" in page.url:
            log_pass(f"Navigated to: {page.url}")
        else:
            log_issue(f"Wrong URL: {page.url}")
    except Exception as e:
        print(f"  Navigation not detected: {e}")
        # Wait longer and check
        page.wait_for_timeout(5000)
        print(f"  URL after wait: {page.url}")

    # Back to search
    page.go_back()
    page.wait_for_timeout(3000)

    print("\n=== Approach 2: Click and wait for URL change ===")
    page.goto("http://localhost:3000/search", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(5000)

    listing_link = page.locator("a[href*='/listings/']").first
    href = listing_link.get_attribute("href")
    print(f"  Link href: {href}")

    listing_link.click()
    # Wait for URL to change
    try:
        page.wait_for_url("**/listings/**", timeout=10000)
        print(f"  URL after wait: {page.url}")
        log_pass(f"Approach 2 worked: {page.url}")
    except Exception:
        page.wait_for_timeout(5000)
        print(f"  URL after 5s wait: {page.url}")
        if "/listings/" in page.url:
            log_pass(f"Approach 2 slow nav: {page.url}")
        else:
            # Maybe the link opens in a new tab?
            pages = page.context.pages
            print(f"  Open pages: {len(pages)}")
            for pg in pages:
                print(f"    {pg.url}")

    print("\n=== Approach 3: Direct navigation ===")
    page.goto(f"http://localhost:3000{href}", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(5000)
    print(f"  Direct nav URL: {page.url}")
    if "/listings/" in page.url:
        log_pass(f"Direct navigation works: {page.url}")

        # Check page content
        title = page.locator("h1").first
        if title.is_visible():
            print(f"  Page title: '{title.text_content().strip()[:60]}'")
            log_pass("Listing detail page renders correctly")

        page.screenshot(path=f"{SCREENSHOTS_DIR}/flow8_direct_detail.png", full_page=False)
    else:
        log_issue("Direct navigation also failed")

    # Check for touch targets on mobile
    print("\n=== Touch Target Debug ===")
    page.goto("http://localhost:3000/search", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(4000)
    page.set_viewport_size({"width": 375, "height": 812})
    page.wait_for_timeout(2000)

    buttons = page.locator("button:visible").all()
    for btn in buttons[:20]:
        box = btn.bounding_box()
        text = btn.text_content().strip()[:30] if btn.text_content() else "?"
        aria = btn.get_attribute("aria-label") or ""
        if box and (box["width"] < 44 or box["height"] < 44):
            print(f"  SMALL: {box['width']:.0f}x{box['height']:.0f} text='{text}' aria='{aria}'")

    # Summary
    print(f"\n  PASSES: {len(passes)} | ISSUES: {len(issues)}")
    for p_msg in passes:
        print(f"  ✅ {p_msg}")
    for i_msg in issues:
        print(f"  ❌ {i_msg}")

    browser.close()
