"""Verify Flow 8 fix: listing card click navigates correctly."""
from playwright.sync_api import sync_playwright
import os, sys

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

    # Test 1: Click on listing link (image area) navigates
    print("\n=== Test 1: Click listing link (default click position) ===")
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    page.goto("http://localhost:3000/search", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(5000)

    link = page.locator("a[href*='/listings/']").first
    href = link.get_attribute("href")
    print(f"  Link href: {href}")
    link.click()
    page.wait_for_timeout(5000)
    if "/listings/" in page.url:
        log_pass(f"Default click navigated to: {page.url}")
    else:
        log_issue(f"Default click stayed at: {page.url}")
    page.close()

    # Test 2: Click on title area specifically
    print("\n=== Test 2: Click title text ===")
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    page.goto("http://localhost:3000/search", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(5000)

    title = page.locator("[data-testid='listing-card'] a[href*='/listings/'] h3").first
    title_text = title.text_content().strip()
    print(f"  Title: '{title_text}'")
    title.click()
    page.wait_for_timeout(5000)
    if "/listings/" in page.url:
        log_pass(f"Title click navigated to: {page.url}")
    else:
        log_issue(f"Title click stayed at: {page.url}")
    page.close()

    # Test 3: Back button after navigation
    print("\n=== Test 3: Back button returns to search ===")
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    page.goto("http://localhost:3000/search", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(5000)
    link = page.locator("a[href*='/listings/']").first
    link.click()
    page.wait_for_timeout(5000)
    if "/listings/" in page.url:
        page.go_back()
        page.wait_for_timeout(4000)
        if "/search" in page.url:
            log_pass("Back button returns to search")
        else:
            log_issue(f"Back went to: {page.url}")
    else:
        log_issue("Could not navigate to test back button")
    page.close()

    # Test 4: Listing detail page has title
    print("\n=== Test 4: Detail page elements ===")
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    page.goto("http://localhost:3000/search", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(5000)
    links = page.locator("a[href*='/listings/']").all()
    if len(links) > 1:
        href = links[1].get_attribute("href")
        links[1].click()
        page.wait_for_timeout(5000)
        h1 = page.locator("h1").first
        if h1.is_visible():
            log_pass(f"Detail has title: '{h1.text_content().strip()[:50]}'")
        else:
            log_issue("No h1 on detail page")

        # Check for price ($XXX pattern)
        dollar = page.locator("text=/\\$\\d+/").first
        if dollar.is_visible():
            log_pass(f"Price visible: '{dollar.text_content().strip()[:30]}'")
        else:
            log_issue("No price visible on detail page")
    page.close()

    # Test 5: Mobile listing click
    print("\n=== Test 5: Mobile listing click ===")
    page = browser.new_page(viewport={"width": 375, "height": 812})
    page.goto("http://localhost:3000/search", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(5000)
    link = page.locator("a[href*='/listings/']").first
    if link.is_visible():
        href = link.get_attribute("href")
        link.click()
        page.wait_for_timeout(5000)
        if "/listings/" in page.url:
            log_pass(f"Mobile click navigated to: {page.url}")
        else:
            log_issue(f"Mobile click stayed at: {page.url}")
    else:
        log_issue("No listing link visible on mobile")
    page.close()

    # Summary
    print("\n" + "=" * 50)
    print("FLOW 8 FIX VERIFICATION")
    print("=" * 50)
    print(f"PASSES: {len(passes)}")
    for msg in passes:
        print(f"  ✅ {msg}")
    print(f"ISSUES: {len(issues)}")
    for msg in issues:
        print(f"  ❌ {msg}")

    browser.close()
    sys.exit(1 if issues else 0)
