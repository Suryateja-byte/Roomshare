"""Debug Flow 8: Why listing link click doesn't navigate in headless Playwright."""
from playwright.sync_api import sync_playwright
import os

SCREENSHOTS_DIR = "/tmp/roomshare-tests"
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900})

    page.goto("http://localhost:3000/search", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(5000)

    # Approach 1: Click on card content area (not image) to avoid carousel drag handlers
    print("=== Approach 1: Click on card title/content area ===")
    card = page.locator("[data-testid='listing-card']").first
    link = card.locator("a[href*='/listings/']").first
    href = link.get_attribute("href")
    print(f"  Link href: {href}")

    # Find the title <h3> inside the link - this is below the image
    title_el = link.locator("h3").first
    if title_el.is_visible():
        title_text = title_el.text_content().strip()
        print(f"  Clicking title: '{title_text}'")
        title_el.click()
        page.wait_for_timeout(5000)
        print(f"  URL after title click: {page.url}")
        if "/listings/" in page.url:
            print("  SUCCESS: Title click navigated!")
        else:
            print("  FAIL: Title click didn't navigate")

    # Reset
    page.goto("http://localhost:3000/search", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(5000)

    # Approach 2: Click with force (bypasses actionability checks)
    print("\n=== Approach 2: Force click the link ===")
    link = page.locator("a[href*='/listings/']").first
    href = link.get_attribute("href")
    print(f"  Link href: {href}")
    link.click(force=True)
    page.wait_for_timeout(5000)
    print(f"  URL after force click: {page.url}")
    if "/listings/" in page.url:
        print("  SUCCESS: Force click navigated!")
    else:
        print("  FAIL: Force click didn't navigate")

    # Reset
    page.goto("http://localhost:3000/search", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(5000)

    # Approach 3: JavaScript click on the link
    print("\n=== Approach 3: JavaScript click ===")
    link = page.locator("a[href*='/listings/']").first
    href = link.get_attribute("href")
    link.evaluate("el => el.click()")
    page.wait_for_timeout(5000)
    print(f"  URL after JS click: {page.url}")
    if "/listings/" in page.url:
        print("  SUCCESS: JS click navigated!")
    else:
        print("  FAIL: JS click didn't navigate")

    # Reset
    page.goto("http://localhost:3000/search", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(5000)

    # Approach 4: Dispatch click event
    print("\n=== Approach 4: Dispatch click event on link ===")
    link = page.locator("a[href*='/listings/']").first
    href = link.get_attribute("href")
    link.dispatch_event("click")
    page.wait_for_timeout(5000)
    print(f"  URL after dispatched click: {page.url}")
    if "/listings/" in page.url:
        print("  SUCCESS: Dispatched click navigated!")
    else:
        print("  FAIL: Dispatched click didn't navigate")

    # Approach 5: Check if isDragging state is stuck
    print("\n=== Approach 5: Check drag state + pointer-events ===")
    page.goto("http://localhost:3000/search", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(5000)

    link = page.locator("a[href*='/listings/']").first
    # Check computed pointer-events
    pe = link.evaluate("el => window.getComputedStyle(el).pointerEvents")
    print(f"  pointer-events on link: {pe}")

    # Check classes on link
    classes = link.get_attribute("class")
    print(f"  Link classes: {classes}")

    # Check if the link has pointer-events-none
    has_pe_none = "pointer-events-none" in (classes or "")
    print(f"  Has pointer-events-none: {has_pe_none}")

    # Approach 6: Use page.goto directly (simulates user typing URL)
    print(f"\n=== Approach 6: Direct navigation to {href} ===")
    page.goto(f"http://localhost:3000{href}", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(5000)
    print(f"  URL: {page.url}")
    if "/listings/" in page.url:
        print("  SUCCESS: Direct navigation works!")
        # Check detail page elements
        h1 = page.locator("h1").first
        if h1.is_visible():
            print(f"  Title: {h1.text_content().strip()[:60]}")

        # Check price element - what's the actual markup?
        price_els = page.locator("[class*='price'], [data-testid*='price']").all()
        print(f"  Price elements (class/testid match): {len(price_els)}")

        # Look for $ sign in the page
        dollar_els = page.locator("text=/\\$\\d/").all()
        print(f"  Elements containing $[digit]: {len(dollar_els)}")
        for el in dollar_els[:5]:
            text = el.text_content().strip()[:50]
            tag = el.evaluate("e => e.tagName")
            print(f"    {tag}: '{text}'")

    browser.close()
