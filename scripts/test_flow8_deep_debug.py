"""Deep debug: trace exactly what happens when clicking a listing card image."""
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900})

    page.goto("http://localhost:3000/search", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(5000)

    # Inject click event tracing on the first listing link
    page.evaluate("""() => {
        const link = document.querySelector("a[href*='/listings/']");
        if (!link) { console.log('DEBUG: No listing link found'); return; }

        const href = link.getAttribute('href');
        console.log('DEBUG: Found link with href=' + href);

        // Trace events on the link element
        ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click'].forEach(type => {
            link.addEventListener(type, (e) => {
                console.log('DEBUG: Link received ' + type + ' (target=' + e.target.tagName + ', defaultPrevented=' + e.defaultPrevented + ')');
            }, true);  // capture
            link.addEventListener(type, (e) => {
                console.log('DEBUG: Link bubble ' + type + ' (target=' + e.target.tagName + ', defaultPrevented=' + e.defaultPrevented + ')');
            }, false);  // bubble
        });

        // Trace on the carousel viewport (Embla's container)
        const emblaViewport = link.querySelector('[class*="overflow-hidden"][class*="aspect"]');
        if (emblaViewport) {
            ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click'].forEach(type => {
                emblaViewport.addEventListener(type, (e) => {
                    console.log('DEBUG: Embla viewport capture ' + type + ' (defaultPrevented=' + e.defaultPrevented + ', propagationStopped=unknown)');
                }, true);
            });
        } else {
            console.log('DEBUG: No Embla viewport found');
        }

        // Trace on document
        document.addEventListener('click', (e) => {
            console.log('DEBUG: Document click (target=' + e.target.tagName + ', defaultPrevented=' + e.defaultPrevented + ')');
        }, true);
    }""")

    # Also listen to console
    console_msgs = []
    page.on("console", lambda msg: console_msgs.append(msg.text) if "DEBUG:" in msg.text else None)

    # Now click the link (default center position = image area)
    link = page.locator("a[href*='/listings/']").first
    href = link.get_attribute("href")
    print(f"Clicking link with href={href}")

    # Get the bounding box to see where the click lands
    box = link.bounding_box()
    if box:
        print(f"  Link box: x={box['x']:.0f} y={box['y']:.0f} w={box['width']:.0f} h={box['height']:.0f}")
        print(f"  Click center: ({box['x'] + box['width']/2:.0f}, {box['y'] + box['height']/2:.0f})")

    link.click()
    page.wait_for_timeout(3000)

    print(f"\nURL after click: {page.url}")
    print(f"\nConsole trace ({len(console_msgs)} messages):")
    for msg in console_msgs:
        print(f"  {msg}")

    # Now try clicking specifically on the content area (bottom of card)
    print("\n--- Clicking on content area ---")
    page.goto("http://localhost:3000/search", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(5000)

    link = page.locator("a[href*='/listings/']").first
    box = link.bounding_box()
    if box:
        # Click at bottom 25% of the card (content area, below image)
        content_x = box['x'] + box['width'] / 2
        content_y = box['y'] + box['height'] * 0.85
        print(f"  Clicking at ({content_x:.0f}, {content_y:.0f}) — bottom of card")
        page.mouse.click(content_x, content_y)
        page.wait_for_timeout(3000)
        print(f"  URL: {page.url}")

    browser.close()
