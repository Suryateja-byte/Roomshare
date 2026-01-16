/**
 * Comprehensive Edge Case Tests for Search & Filter Functionality
 *
 * 100+ edge cases covering:
 * - Date validation (past, future, invalid formats, leap years)
 * - Price validation (negative, zero, overflow, non-numeric)
 * - Location handling (special chars, injection, unicode)
 * - Filter combinations (conflicting, empty, all selected)
 * - Amenities & House Rules (invalid, duplicates, case sensitivity)
 * - Languages (all 28, invalid codes, duplicates)
 * - Pagination (negative, overflow, non-numeric)
 * - Security (SQL injection, XSS, path traversal)
 * - URL encoding edge cases
 */

interface EdgeCaseTest {
  id: number;
  category: string;
  description: string;
  url: string;
  expectedBehavior: string;
  checkType: "no-error" | "filter-count" | "results" | "validation";
  expectedFilterCount?: number;
  expectedMinResults?: number;
  expectedMaxResults?: number;
}

// ============================================================================
// DATE EDGE CASES (1-25)
// ============================================================================
const dateEdgeCases: EdgeCaseTest[] = [
  // Past dates
  {
    id: 1,
    category: "Date",
    description: "Yesterday",
    url: "/search?moveInDate=2025-12-27",
    expectedBehavior: "Valid - show badge",
    checkType: "filter-count",
    expectedFilterCount: 1,
  },
  {
    id: 2,
    category: "Date",
    description: "Past date - 2020",
    url: "/search?moveInDate=2020-01-01",
    expectedBehavior: "Invalid - no badge",
    checkType: "filter-count",
    expectedFilterCount: 0,
  },
  {
    id: 3,
    category: "Date",
    description: "Past date - 1999",
    url: "/search?moveInDate=1999-12-31",
    expectedBehavior: "Invalid - no badge",
    checkType: "filter-count",
    expectedFilterCount: 0,
  },
  {
    id: 4,
    category: "Date",
    description: "Epoch date",
    url: "/search?moveInDate=1970-01-01",
    expectedBehavior: "Invalid - no badge",
    checkType: "filter-count",
    expectedFilterCount: 0,
  },

  // Today and tomorrow
  {
    id: 5,
    category: "Date",
    description: "Today",
    url: "/search?moveInDate=2025-12-28",
    expectedBehavior: "Valid - show badge",
    checkType: "filter-count",
    expectedFilterCount: 1,
  },
  {
    id: 6,
    category: "Date",
    description: "Tomorrow",
    url: "/search?moveInDate=2025-12-29",
    expectedBehavior: "Valid - show badge",
    checkType: "filter-count",
    expectedFilterCount: 1,
  },

  // Future dates
  {
    id: 7,
    category: "Date",
    description: "Next month",
    url: "/search?moveInDate=2026-01-15",
    expectedBehavior: "Valid - show badge",
    checkType: "filter-count",
    expectedFilterCount: 1,
  },
  {
    id: 8,
    category: "Date",
    description: "Next year",
    url: "/search?moveInDate=2026-06-01",
    expectedBehavior: "Valid - show badge",
    checkType: "filter-count",
    expectedFilterCount: 1,
  },
  {
    id: 9,
    category: "Date",
    description: "2 years from now",
    url: "/search?moveInDate=2027-12-28",
    expectedBehavior: "Valid - show badge",
    checkType: "filter-count",
    expectedFilterCount: 1,
  },
  {
    id: 10,
    category: "Date",
    description: "Far future (3+ years)",
    url: "/search?moveInDate=2030-01-01",
    expectedBehavior: "Invalid - beyond 2 year limit",
    checkType: "filter-count",
    expectedFilterCount: 0,
  },

  // Invalid date formats
  {
    id: 11,
    category: "Date",
    description: "Wrong format MM-DD-YYYY",
    url: "/search?moveInDate=12-28-2025",
    expectedBehavior: "Invalid format - no badge",
    checkType: "filter-count",
    expectedFilterCount: 0,
  },
  {
    id: 12,
    category: "Date",
    description: "Wrong format DD/MM/YYYY",
    url: "/search?moveInDate=28/12/2025",
    expectedBehavior: "Invalid format - no badge",
    checkType: "filter-count",
    expectedFilterCount: 0,
  },
  {
    id: 13,
    category: "Date",
    description: "No separators",
    url: "/search?moveInDate=20251228",
    expectedBehavior: "Invalid format - no badge",
    checkType: "filter-count",
    expectedFilterCount: 0,
  },
  {
    id: 14,
    category: "Date",
    description: "Text date",
    url: "/search?moveInDate=January-1-2026",
    expectedBehavior: "Invalid format - no badge",
    checkType: "filter-count",
    expectedFilterCount: 0,
  },

  // Invalid date values
  {
    id: 15,
    category: "Date",
    description: "Month 13",
    url: "/search?moveInDate=2026-13-01",
    expectedBehavior: "Invalid month - no badge",
    checkType: "filter-count",
    expectedFilterCount: 0,
  },
  {
    id: 16,
    category: "Date",
    description: "Month 00",
    url: "/search?moveInDate=2026-00-15",
    expectedBehavior: "Invalid month - no badge",
    checkType: "filter-count",
    expectedFilterCount: 0,
  },
  {
    id: 17,
    category: "Date",
    description: "Day 32",
    url: "/search?moveInDate=2026-01-32",
    expectedBehavior: "Invalid day - no badge",
    checkType: "filter-count",
    expectedFilterCount: 0,
  },
  {
    id: 18,
    category: "Date",
    description: "Day 00",
    url: "/search?moveInDate=2026-01-00",
    expectedBehavior: "Invalid day - no badge",
    checkType: "filter-count",
    expectedFilterCount: 0,
  },
  {
    id: 19,
    category: "Date",
    description: "Feb 30",
    url: "/search?moveInDate=2026-02-30",
    expectedBehavior: "Invalid day for Feb - no badge",
    checkType: "filter-count",
    expectedFilterCount: 0,
  },
  {
    id: 20,
    category: "Date",
    description: "Feb 29 non-leap year",
    url: "/search?moveInDate=2025-02-29",
    expectedBehavior: "Invalid - 2025 not leap year",
    checkType: "filter-count",
    expectedFilterCount: 0,
  },
  {
    id: 21,
    category: "Date",
    description: "Feb 29 leap year (2028)",
    url: "/search?moveInDate=2028-02-29",
    expectedBehavior: "Too far in future",
    checkType: "filter-count",
    expectedFilterCount: 0,
  },
  {
    id: 22,
    category: "Date",
    description: "April 31",
    url: "/search?moveInDate=2026-04-31",
    expectedBehavior: "Invalid - April has 30 days",
    checkType: "filter-count",
    expectedFilterCount: 0,
  },

  // Edge cases
  {
    id: 23,
    category: "Date",
    description: "Empty date",
    url: "/search?moveInDate=",
    expectedBehavior: "No badge",
    checkType: "filter-count",
    expectedFilterCount: 0,
  },
  {
    id: 24,
    category: "Date",
    description: "Whitespace date",
    url: "/search?moveInDate=%20%20",
    expectedBehavior: "No badge",
    checkType: "filter-count",
    expectedFilterCount: 0,
  },
  {
    id: 25,
    category: "Date",
    description: "Negative year",
    url: "/search?moveInDate=-2026-01-01",
    expectedBehavior: "Invalid - no badge",
    checkType: "filter-count",
    expectedFilterCount: 0,
  },
];

// ============================================================================
// PRICE EDGE CASES (26-45)
// ============================================================================
const priceEdgeCases: EdgeCaseTest[] = [
  // Valid prices
  {
    id: 26,
    category: "Price",
    description: "Normal range $500-$1500",
    url: "/search?minPrice=500&maxPrice=1500",
    expectedBehavior: "Valid - should filter",
    checkType: "no-error",
  },
  {
    id: 27,
    category: "Price",
    description: "Min only $1000",
    url: "/search?minPrice=1000",
    expectedBehavior: "Valid - should filter",
    checkType: "no-error",
  },
  {
    id: 28,
    category: "Price",
    description: "Max only $2000",
    url: "/search?maxPrice=2000",
    expectedBehavior: "Valid - should filter",
    checkType: "no-error",
  },
  {
    id: 29,
    category: "Price",
    description: "Equal min and max",
    url: "/search?minPrice=1000&maxPrice=1000",
    expectedBehavior: "Valid - exact price",
    checkType: "no-error",
  },

  // Invalid prices
  {
    id: 30,
    category: "Price",
    description: "Negative min",
    url: "/search?minPrice=-100",
    expectedBehavior: "Should ignore or handle gracefully",
    checkType: "no-error",
  },
  {
    id: 31,
    category: "Price",
    description: "Negative max",
    url: "/search?maxPrice=-500",
    expectedBehavior: "Should ignore or handle gracefully",
    checkType: "no-error",
  },
  {
    id: 32,
    category: "Price",
    description: "Zero min",
    url: "/search?minPrice=0",
    expectedBehavior: "Valid edge case",
    checkType: "no-error",
  },
  {
    id: 33,
    category: "Price",
    description: "Zero max",
    url: "/search?maxPrice=0",
    expectedBehavior: "Should handle gracefully",
    checkType: "no-error",
  },
  {
    id: 34,
    category: "Price",
    description: "Min > Max",
    url: "/search?minPrice=2000&maxPrice=500",
    expectedBehavior: "Should handle gracefully",
    checkType: "no-error",
  },
  {
    id: 35,
    category: "Price",
    description: "Very large numbers",
    url: "/search?minPrice=999999999&maxPrice=9999999999",
    expectedBehavior: "Should handle gracefully",
    checkType: "no-error",
  },

  // Non-numeric
  {
    id: 36,
    category: "Price",
    description: "Text min price",
    url: "/search?minPrice=abc",
    expectedBehavior: "Should ignore",
    checkType: "no-error",
  },
  {
    id: 37,
    category: "Price",
    description: "Text max price",
    url: "/search?maxPrice=xyz",
    expectedBehavior: "Should ignore",
    checkType: "no-error",
  },
  {
    id: 38,
    category: "Price",
    description: "Decimal price",
    url: "/search?minPrice=100.50&maxPrice=200.75",
    expectedBehavior: "Should handle",
    checkType: "no-error",
  },
  {
    id: 39,
    category: "Price",
    description: "Scientific notation",
    url: "/search?minPrice=1e3&maxPrice=2e3",
    expectedBehavior: "Should handle",
    checkType: "no-error",
  },
  {
    id: 40,
    category: "Price",
    description: "Currency symbol",
    url: "/search?minPrice=$100&maxPrice=$200",
    expectedBehavior: "Should handle gracefully",
    checkType: "no-error",
  },
  {
    id: 41,
    category: "Price",
    description: "Commas in number",
    url: "/search?minPrice=1,000&maxPrice=2,000",
    expectedBehavior: "Should handle gracefully",
    checkType: "no-error",
  },
  {
    id: 42,
    category: "Price",
    description: "Empty min",
    url: "/search?minPrice=&maxPrice=1000",
    expectedBehavior: "Should ignore empty",
    checkType: "no-error",
  },
  {
    id: 43,
    category: "Price",
    description: "Empty max",
    url: "/search?minPrice=500&maxPrice=",
    expectedBehavior: "Should ignore empty",
    checkType: "no-error",
  },
  {
    id: 44,
    category: "Price",
    description: "NaN value",
    url: "/search?minPrice=NaN&maxPrice=Infinity",
    expectedBehavior: "Should handle gracefully",
    checkType: "no-error",
  },
  {
    id: 45,
    category: "Price",
    description: "Special chars",
    url: "/search?minPrice=100!@#&maxPrice=200$%^",
    expectedBehavior: "Should handle gracefully",
    checkType: "no-error",
  },
];

// ============================================================================
// LOCATION EDGE CASES (46-60)
// ============================================================================
const locationEdgeCases: EdgeCaseTest[] = [
  {
    id: 46,
    category: "Location",
    description: "Normal city",
    url: "/search?q=Austin",
    expectedBehavior: "Should search",
    checkType: "no-error",
  },
  {
    id: 47,
    category: "Location",
    description: "City with state",
    url: "/search?q=Austin%2C%20TX",
    expectedBehavior: "Should search",
    checkType: "no-error",
  },
  {
    id: 48,
    category: "Location",
    description: "Empty location",
    url: "/search?q=",
    expectedBehavior: "Should show all",
    checkType: "no-error",
  },
  {
    id: 49,
    category: "Location",
    description: "Whitespace only",
    url: "/search?q=%20%20%20",
    expectedBehavior: "Should handle",
    checkType: "no-error",
  },
  {
    id: 50,
    category: "Location",
    description: "Very long string",
    url: "/search?q=" + "a".repeat(1000),
    expectedBehavior: "Should handle gracefully",
    checkType: "no-error",
  },
  {
    id: 51,
    category: "Location",
    description: "Special characters",
    url: "/search?q=New%20York%21%40%23",
    expectedBehavior: "Should handle",
    checkType: "no-error",
  },
  {
    id: 52,
    category: "Location",
    description: "Unicode city",
    url: "/search?q=%C3%9Csk%C3%BCdar",
    expectedBehavior: "Should handle unicode",
    checkType: "no-error",
  },
  {
    id: 53,
    category: "Location",
    description: "Emoji in location",
    url: "/search?q=%F0%9F%8F%A0%20Home",
    expectedBehavior: "Should handle emoji",
    checkType: "no-error",
  },
  {
    id: 54,
    category: "Location",
    description: "Numbers only",
    url: "/search?q=12345",
    expectedBehavior: "Should handle",
    checkType: "no-error",
  },
  {
    id: 55,
    category: "Location",
    description: "SQL injection attempt",
    url: "/search?q=Austin%27%3B%20DROP%20TABLE%20listings%3B--",
    expectedBehavior: "Should sanitize",
    checkType: "no-error",
  },
  {
    id: 56,
    category: "Location",
    description: "XSS attempt",
    url: "/search?q=%3Cscript%3Ealert(1)%3C/script%3E",
    expectedBehavior: "Should sanitize",
    checkType: "no-error",
  },
  {
    id: 57,
    category: "Location",
    description: "Null byte",
    url: "/search?q=Austin%00malicious",
    expectedBehavior: "Should handle",
    checkType: "no-error",
  },
  {
    id: 58,
    category: "Location",
    description: "Path traversal",
    url: "/search?q=../../../etc/passwd",
    expectedBehavior: "Should handle",
    checkType: "no-error",
  },
  {
    id: 59,
    category: "Location",
    description: "With coordinates",
    url: "/search?q=Austin&lat=30.2672&lng=-97.7431",
    expectedBehavior: "Should use coords",
    checkType: "no-error",
  },
  {
    id: 60,
    category: "Location",
    description: "Invalid coordinates",
    url: "/search?q=Austin&lat=999&lng=-999",
    expectedBehavior: "Should handle invalid coords",
    checkType: "no-error",
  },
];

// ============================================================================
// FILTER COMBINATION EDGE CASES (61-80)
// ============================================================================
const filterCombinationEdgeCases: EdgeCaseTest[] = [
  {
    id: 61,
    category: "Combination",
    description: "All filters empty",
    url: "/search",
    expectedBehavior: "Show all listings",
    checkType: "filter-count",
    expectedFilterCount: 0,
  },
  {
    id: 62,
    category: "Combination",
    description: "Date + Price",
    url: "/search?moveInDate=2026-01-15&minPrice=500&maxPrice=1500",
    expectedBehavior: "Combined filter",
    checkType: "filter-count",
    expectedFilterCount: 1,
  },
  {
    id: 63,
    category: "Combination",
    description: "All amenities",
    url: "/search?amenities=WiFi,Air%20Conditioning,Heating,Washer/Dryer,Parking,Furnished,Utilities%20Included,Kitchen%20Access,Private%20Bathroom,Balcony",
    expectedBehavior: "Multiple amenities",
    checkType: "filter-count",
    expectedFilterCount: 10,
  },
  {
    id: 64,
    category: "Combination",
    description: "All house rules",
    url: "/search?houseRules=Pets%20allowed,Smoking%20allowed,Couples%20allowed",
    expectedBehavior: "Multiple rules",
    checkType: "filter-count",
    expectedFilterCount: 3,
  },
  {
    id: 65,
    category: "Combination",
    description: "Multiple languages",
    url: "/search?languages=en,es,zh,hi,ar",
    expectedBehavior: "Multiple languages",
    checkType: "filter-count",
    expectedFilterCount: 5,
  },
  {
    id: 66,
    category: "Combination",
    description: "Room type private",
    url: "/search?roomType=PRIVATE",
    expectedBehavior: "Room type filter",
    checkType: "filter-count",
    expectedFilterCount: 1,
  },
  {
    id: 67,
    category: "Combination",
    description: "Room type shared",
    url: "/search?roomType=SHARED",
    expectedBehavior: "Room type filter",
    checkType: "filter-count",
    expectedFilterCount: 1,
  },
  {
    id: 68,
    category: "Combination",
    description: "Lease 1 month",
    url: "/search?leaseDuration=1_MONTH",
    expectedBehavior: "Lease filter",
    checkType: "filter-count",
    expectedFilterCount: 1,
  },
  {
    id: 69,
    category: "Combination",
    description: "Lease 12 months",
    url: "/search?leaseDuration=12_MONTHS",
    expectedBehavior: "Lease filter",
    checkType: "filter-count",
    expectedFilterCount: 1,
  },
  {
    id: 70,
    category: "Combination",
    description: "Maximum filters",
    url: "/search?q=Austin&minPrice=500&maxPrice=2000&moveInDate=2026-01-15&leaseDuration=6_MONTHS&roomType=PRIVATE&amenities=WiFi,Parking&houseRules=Pets%20allowed&languages=en,es",
    expectedBehavior: "All filters active",
    checkType: "no-error",
  },
  {
    id: 71,
    category: "Combination",
    description: "Invalid + valid filters",
    url: "/search?moveInDate=2020-01-01&roomType=PRIVATE",
    expectedBehavior: "Only valid filter counted",
    checkType: "filter-count",
    expectedFilterCount: 1,
  },
  {
    id: 72,
    category: "Combination",
    description: "Any values ignored",
    url: "/search?roomType=any&leaseDuration=any",
    expectedBehavior: "Any = no filter",
    checkType: "filter-count",
    expectedFilterCount: 0,
  },
  {
    id: 78,
    category: "Combination",
    description: "Duplicate amenities",
    url: "/search?amenities=WiFi,WiFi,WiFi,Parking,Parking",
    expectedBehavior: "Should deduplicate",
    checkType: "no-error",
  },
  {
    id: 79,
    category: "Combination",
    description: "Case variations",
    url: "/search?amenities=wifi,WIFI,WiFi",
    expectedBehavior: "Should normalize",
    checkType: "no-error",
  },
  {
    id: 80,
    category: "Combination",
    description: "Empty array params",
    url: "/search?amenities=&houseRules=&languages=",
    expectedBehavior: "Should handle empty",
    checkType: "filter-count",
    expectedFilterCount: 0,
  },
];

// ============================================================================
// LANGUAGE EDGE CASES (81-95)
// ============================================================================
const languageEdgeCases: EdgeCaseTest[] = [
  {
    id: 81,
    category: "Language",
    description: "English only",
    url: "/search?languages=en",
    expectedBehavior: "Single language",
    checkType: "filter-count",
    expectedFilterCount: 1,
  },
  {
    id: 82,
    category: "Language",
    description: "Spanish only",
    url: "/search?languages=es",
    expectedBehavior: "Single language",
    checkType: "filter-count",
    expectedFilterCount: 1,
  },
  {
    id: 83,
    category: "Language",
    description: "Hindi only",
    url: "/search?languages=hi",
    expectedBehavior: "Single language",
    checkType: "filter-count",
    expectedFilterCount: 1,
  },
  {
    id: 84,
    category: "Language",
    description: "Telugu only",
    url: "/search?languages=te",
    expectedBehavior: "Single language",
    checkType: "filter-count",
    expectedFilterCount: 1,
  },
  {
    id: 85,
    category: "Language",
    description: "Chinese only",
    url: "/search?languages=zh",
    expectedBehavior: "Single language",
    checkType: "filter-count",
    expectedFilterCount: 1,
  },
  {
    id: 86,
    category: "Language",
    description: "All 28 languages",
    url: "/search?languages=en,es,zh,hi,ar,pt,bn,ru,ja,pa,de,ko,fr,te,mr,ta,vi,ur,it,th,gu,kn,ml,pl,uk,nl,si,ne",
    expectedBehavior: "All languages",
    checkType: "filter-count",
    expectedFilterCount: 28,
  },
  {
    id: 87,
    category: "Language",
    description: "Invalid code",
    url: "/search?languages=xx",
    expectedBehavior: "Should ignore invalid",
    checkType: "filter-count",
    expectedFilterCount: 0,
  },
  {
    id: 88,
    category: "Language",
    description: "Mixed valid/invalid",
    url: "/search?languages=en,xx,es,yy",
    expectedBehavior: "Only valid counted",
    checkType: "filter-count",
    expectedFilterCount: 2,
  },
  {
    id: 89,
    category: "Language",
    description: "Uppercase codes",
    url: "/search?languages=EN,ES,HI",
    expectedBehavior: "Should normalize",
    checkType: "no-error",
  },
  {
    id: 90,
    category: "Language",
    description: "Full language names",
    url: "/search?languages=English,Spanish",
    expectedBehavior: "Should handle names",
    checkType: "no-error",
  },
  {
    id: 91,
    category: "Language",
    description: "Duplicate languages",
    url: "/search?languages=en,en,en,es,es",
    expectedBehavior: "Should deduplicate",
    checkType: "no-error",
  },
  {
    id: 92,
    category: "Language",
    description: "Empty language",
    url: "/search?languages=",
    expectedBehavior: "No filter",
    checkType: "filter-count",
    expectedFilterCount: 0,
  },
  {
    id: 93,
    category: "Language",
    description: "Whitespace language",
    url: "/search?languages=%20%20",
    expectedBehavior: "Should handle",
    checkType: "no-error",
  },
  {
    id: 94,
    category: "Language",
    description: "Special chars in lang",
    url: "/search?languages=en%3Cscript%3E",
    expectedBehavior: "Should sanitize",
    checkType: "no-error",
  },
  {
    id: 95,
    category: "Language",
    description: "Three-letter codes",
    url: "/search?languages=eng,spa,hin",
    expectedBehavior: "Should handle ISO-639-3",
    checkType: "no-error",
  },
];

// ============================================================================
// SECURITY EDGE CASES (96-110)
// ============================================================================
const securityEdgeCases: EdgeCaseTest[] = [
  {
    id: 96,
    category: "Security",
    description: "SQL injection in q",
    url: "/search?q=1%27%20OR%20%271%27=%271",
    expectedBehavior: "Should sanitize",
    checkType: "no-error",
  },
  {
    id: 97,
    category: "Security",
    description: "SQL union attack",
    url: "/search?q=1%20UNION%20SELECT%20*%20FROM%20users",
    expectedBehavior: "Should sanitize",
    checkType: "no-error",
  },
  {
    id: 98,
    category: "Security",
    description: "XSS in amenities",
    url: "/search?amenities=%3Cimg%20src=x%20onerror=alert(1)%3E",
    expectedBehavior: "Should sanitize",
    checkType: "no-error",
  },
  {
    id: 99,
    category: "Security",
    description: "XSS in location",
    url: "/search?q=%3Csvg%20onload=alert(1)%3E",
    expectedBehavior: "Should sanitize",
    checkType: "no-error",
  },
  {
    id: 100,
    category: "Security",
    description: "JavaScript URL",
    url: "/search?q=javascript:alert(1)",
    expectedBehavior: "Should sanitize",
    checkType: "no-error",
  },
  {
    id: 101,
    category: "Security",
    description: "Data URL",
    url: "/search?q=data:text/html,<script>alert(1)</script>",
    expectedBehavior: "Should sanitize",
    checkType: "no-error",
  },
  {
    id: 102,
    category: "Security",
    description: "CRLF injection",
    url: "/search?q=test%0d%0aSet-Cookie:%20evil=1",
    expectedBehavior: "Should sanitize",
    checkType: "no-error",
  },
  {
    id: 103,
    category: "Security",
    description: "Path traversal deep",
    url: "/search?q=....//....//....//etc/passwd",
    expectedBehavior: "Should handle",
    checkType: "no-error",
  },
  {
    id: 104,
    category: "Security",
    description: "Command injection",
    url: "/search?q=%3B%20cat%20/etc/passwd",
    expectedBehavior: "Should handle",
    checkType: "no-error",
  },
  {
    id: 105,
    category: "Security",
    description: "Template injection",
    url: "/search?q={{7*7}}",
    expectedBehavior: "Should not evaluate",
    checkType: "no-error",
  },
  {
    id: 106,
    category: "Security",
    description: "LDAP injection",
    url: "/search?q=*)(uid=*))(|(uid=*",
    expectedBehavior: "Should handle",
    checkType: "no-error",
  },
  {
    id: 107,
    category: "Security",
    description: "XML injection",
    url: "/search?q=%3C!DOCTYPE%20foo%20%5B%3C!ENTITY%20xxe%20SYSTEM%20%22file:///etc/passwd%22%3E%5D%3E",
    expectedBehavior: "Should handle",
    checkType: "no-error",
  },
  {
    id: 108,
    category: "Security",
    description: "Prototype pollution",
    url: "/search?__proto__[admin]=1",
    expectedBehavior: "Should handle",
    checkType: "no-error",
  },
  {
    id: 109,
    category: "Security",
    description: "NoSQL injection",
    url: "/search?q[$gt]=",
    expectedBehavior: "Should handle",
    checkType: "no-error",
  },
  {
    id: 110,
    category: "Security",
    description: "Buffer overflow attempt",
    url: "/search?q=" + "A".repeat(10000),
    expectedBehavior: "Should handle long input",
    checkType: "no-error",
  },
];

// ============================================================================
// PAGINATION AND SORTING EDGE CASES (111-120)
// ============================================================================
const paginationEdgeCases: EdgeCaseTest[] = [
  {
    id: 111,
    category: "Pagination",
    description: "Page 1",
    url: "/search?page=1",
    expectedBehavior: "First page",
    checkType: "no-error",
  },
  {
    id: 112,
    category: "Pagination",
    description: "Page 0",
    url: "/search?page=0",
    expectedBehavior: "Should default to 1",
    checkType: "no-error",
  },
  {
    id: 113,
    category: "Pagination",
    description: "Negative page",
    url: "/search?page=-1",
    expectedBehavior: "Should handle",
    checkType: "no-error",
  },
  {
    id: 114,
    category: "Pagination",
    description: "Very large page",
    url: "/search?page=999999",
    expectedBehavior: "Should handle gracefully",
    checkType: "no-error",
  },
  {
    id: 115,
    category: "Pagination",
    description: "Decimal page",
    url: "/search?page=1.5",
    expectedBehavior: "Should handle",
    checkType: "no-error",
  },
  {
    id: 116,
    category: "Pagination",
    description: "Text page",
    url: "/search?page=abc",
    expectedBehavior: "Should default",
    checkType: "no-error",
  },
  {
    id: 117,
    category: "Sort",
    description: "Sort by price_asc",
    url: "/search?sortBy=price_asc",
    expectedBehavior: "Sort ascending",
    checkType: "no-error",
  },
  {
    id: 118,
    category: "Sort",
    description: "Sort by price_desc",
    url: "/search?sortBy=price_desc",
    expectedBehavior: "Sort descending",
    checkType: "no-error",
  },
  {
    id: 119,
    category: "Sort",
    description: "Invalid sort",
    url: "/search?sortBy=invalid",
    expectedBehavior: "Should default",
    checkType: "no-error",
  },
  {
    id: 120,
    category: "Sort",
    description: "SQL in sort",
    url: "/search?sortBy=price;DROP%20TABLE",
    expectedBehavior: "Should sanitize",
    checkType: "no-error",
  },
];

// Combine all edge cases
export const allEdgeCases: EdgeCaseTest[] = [
  ...dateEdgeCases,
  ...priceEdgeCases,
  ...locationEdgeCases,
  ...filterCombinationEdgeCases,
  ...languageEdgeCases,
  ...securityEdgeCases,
  ...paginationEdgeCases,
];

// Export for test runner
export {
  dateEdgeCases,
  priceEdgeCases,
  locationEdgeCases,
  filterCombinationEdgeCases,
  languageEdgeCases,
  securityEdgeCases,
  paginationEdgeCases,
};

// Placeholder test - actual tests run via Playwright E2E
describe("Edge Case Test Data", () => {
  it("exports all edge case categories", () => {
    expect(allEdgeCases.length).toBeGreaterThan(100);
    expect(dateEdgeCases.length).toBeGreaterThan(0);
    expect(priceEdgeCases.length).toBeGreaterThan(0);
    expect(locationEdgeCases.length).toBeGreaterThan(0);
    expect(filterCombinationEdgeCases.length).toBeGreaterThan(0);
    expect(languageEdgeCases.length).toBeGreaterThan(0);
    expect(securityEdgeCases.length).toBeGreaterThan(0);
    expect(paginationEdgeCases.length).toBeGreaterThan(0);
  });
});
