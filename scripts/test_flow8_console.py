"""Check if onSlideClick fires by monitoring console output."""
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900})

    console_msgs = []
    page.on("console", lambda msg: console_msgs.append(msg.text))

    page.goto("http://localhost:3000/search", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(5000)

    # Inject debug logging into the first carousel's Embla event handlers
    page.evaluate("""() => {
        // Check if our onSlideClick handler was invoked by checking router navigation
        // We can monkey-patch router.push
        const origPush = window.history.pushState;
        window.history.pushState = function(...args) {
            console.log('ROUTE: pushState called with', JSON.stringify(args[2]));
            return origPush.apply(this, args);
        };

        // Also intercept Next.js router
        if (window.__NEXT_DATA__) {
            console.log('ROUTE: Next.js data found');
        }
    }""")

    # Click the first listing link
    link = page.locator("a[href*='/listings/']").first
    href = link.get_attribute("href")
    print(f"Clicking link with href={href}")
    link.click()
    page.wait_for_timeout(5000)

    print(f"URL after click: {page.url}")
    print(f"\nConsole messages with 'ROUTE' or 'slide' or 'drag':")
    for msg in console_msgs:
        if any(kw in msg.lower() for kw in ['route', 'slide', 'drag', 'click', 'pointer', 'navigate']):
            print(f"  {msg[:200]}")

    # Try clicking on a listing that has a SINGLE image (no carousel)
    print("\n--- Check which listings have multiple images ---")
    page.goto("http://localhost:3000/search", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(5000)

    # Count images per card
    cards = page.locator("[data-testid='listing-card']").all()
    for i, card in enumerate(cards[:5]):
        images = card.locator("img").all()
        dots = card.locator("[role='tablist']").all()
        has_carousel = len(dots) > 0
        link_el = card.locator("a[href*='/listings/']")
        href_val = link_el.get_attribute("href") if link_el.count() > 0 else "none"
        print(f"  Card {i}: {len(images)} images, carousel={has_carousel}, href={href_val}")

    # Find a card without a carousel (single image) and click it
    for i, card in enumerate(cards[:10]):
        dots = card.locator("[role='tablist']")
        if dots.count() == 0:
            print(f"\n--- Clicking card {i} (no carousel) ---")
            card_link = card.locator("a[href*='/listings/']")
            if card_link.count() > 0:
                href_val = card_link.get_attribute("href")
                print(f"  href={href_val}")
                card_link.click()
                page.wait_for_timeout(5000)
                print(f"  URL: {page.url}")
                break

    browser.close()
