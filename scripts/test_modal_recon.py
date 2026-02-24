"""Quick recon: discover what's inside the filter modal."""
from playwright.sync_api import sync_playwright
import os

SCREENSHOTS_DIR = "/tmp/roomshare-tests"
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900})

    page.goto("http://localhost:3000/search", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(4000)

    # Open filter modal
    filters_btn = page.locator("button:has-text('Filters')").first
    filters_btn.click()
    page.wait_for_timeout(2000)

    page.screenshot(path=f"{SCREENSHOTS_DIR}/modal_recon_full.png", full_page=True)

    # Discover all elements inside the modal
    print("=== ALL INPUTS IN MODAL ===")
    inputs = page.locator("[role='dialog'] input, [class*='modal'] input, [class*='Modal'] input, [class*='filter'] input, [class*='Filter'] input, [class*='drawer'] input, [class*='Drawer'] input").all()
    for i, inp in enumerate(inputs[:20]):
        name = inp.get_attribute("name") or ""
        placeholder = inp.get_attribute("placeholder") or ""
        inp_type = inp.get_attribute("type") or ""
        visible = inp.is_visible()
        val = inp.input_value() if visible else "N/A"
        print(f"  [{i}] type='{inp_type}' name='{name}' placeholder='{placeholder}' visible={visible} value='{val}'")

    print("\n=== ALL BUTTONS IN MODAL ===")
    buttons = page.locator("[role='dialog'] button, aside button").all()
    for i, btn in enumerate(buttons[:30]):
        text = btn.text_content().strip()[:60] if btn.text_content() else ""
        testid = btn.get_attribute("data-testid") or ""
        visible = btn.is_visible()
        if visible:
            print(f"  [{i}] text='{text}' testid='{testid}'")

    print("\n=== ALL SELECTS / DROPDOWNS IN MODAL ===")
    selects = page.locator("[role='dialog'] select, aside select, [role='dialog'] [role='combobox'], aside [role='listbox']").all()
    for i, sel in enumerate(selects[:10]):
        name = sel.get_attribute("name") or ""
        text = sel.text_content().strip()[:60] if sel.text_content() else ""
        visible = sel.is_visible()
        print(f"  [{i}] name='{name}' text='{text}' visible={visible}")

    print("\n=== HEADINGS / SECTIONS IN MODAL ===")
    headings = page.locator("[role='dialog'] h2, [role='dialog'] h3, aside h2, aside h3, aside h4, [role='dialog'] h4, [role='dialog'] label, aside label").all()
    for i, h in enumerate(headings[:20]):
        text = h.text_content().strip()[:60] if h.text_content() else ""
        tag = h.evaluate("e => e.tagName")
        visible = h.is_visible()
        if visible:
            print(f"  [{i}] <{tag}> '{text}'")

    print("\n=== ALL data-testid IN MODAL ===")
    testids = page.locator("[role='dialog'] [data-testid], aside [data-testid]").all()
    for i, el in enumerate(testids[:20]):
        testid = el.get_attribute("data-testid") or ""
        tag = el.evaluate("e => e.tagName")
        visible = el.is_visible()
        print(f"  [{i}] testid='{testid}' tag='{tag}' visible={visible}")

    # Check for sliders
    print("\n=== SLIDERS / RANGE CONTROLS ===")
    sliders = page.locator("[role='slider'], input[type='range'], [class*='slider'], [class*='Slider']").all()
    for i, sl in enumerate(sliders[:10]):
        tag = sl.evaluate("e => e.tagName")
        role = sl.get_attribute("role") or ""
        aria_label = sl.get_attribute("aria-label") or ""
        visible = sl.is_visible()
        print(f"  [{i}] tag='{tag}' role='{role}' aria='{aria_label}' visible={visible}")

    # Scroll the modal to find more content
    print("\n=== SCROLLING MODAL TO FIND MORE CONTENT ===")
    modal_content = page.locator("[role='dialog'], aside").first
    if modal_content:
        # Scroll down in the modal
        modal_content.evaluate("e => e.scrollTop = e.scrollHeight")
        page.wait_for_timeout(500)
        page.screenshot(path=f"{SCREENSHOTS_DIR}/modal_recon_scrolled.png", full_page=True)

        # Check for date inputs after scrolling
        date_inputs = page.locator("input[type='date']").all()
        print(f"  Date inputs after scroll: {len(date_inputs)}")
        for di in date_inputs:
            visible = di.is_visible()
            print(f"    visible={visible}")

    # Check checkboxes (for amenities)
    print("\n=== CHECKBOXES IN MODAL ===")
    checks = page.locator("[role='dialog'] input[type='checkbox'], aside input[type='checkbox'], [role='dialog'] [role='checkbox'], aside [role='checkbox']").all()
    for i, ch in enumerate(checks[:20]):
        name = ch.get_attribute("name") or ch.get_attribute("id") or ""
        label_text = ""
        # Try to find associated label
        checked = ch.is_checked() if ch.is_visible() else False
        visible = ch.is_visible()
        print(f"  [{i}] name='{name}' checked={checked} visible={visible}")

    browser.close()
    print("\nModal recon complete!")
