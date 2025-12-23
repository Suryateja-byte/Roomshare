/**
 * Comprehensive Test Listings Seed Script
 * Creates 120+ listings to test all filter edge cases
 *
 * Run with: node scripts/seed-test-listings.js
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ============================================================
// LANGUAGE CODES (ISO 639-1) - matching src/lib/languages.ts
// ============================================================
const LANGUAGES = {
  MAJOR: ['en', 'es', 'zh', 'hi', 'ar', 'pt', 'ru', 'ja', 'de', 'fr', 'ko', 'vi', 'it', 'nl', 'pl', 'tr', 'th'],
  SOUTH_ASIAN: ['te', 'ta', 'bn', 'pa', 'gu', 'mr', 'kn', 'ml', 'ur', 'ne', 'si'],
  EAST_ASIAN: ['yue', 'tl', 'id', 'ms', 'my', 'km'],
  MIDDLE_EASTERN: ['fa', 'he'], // RTL languages
  AFRICAN: ['sw', 'am', 'yo', 'ha', 'ig'],
  EUROPEAN: ['uk', 'cs', 'ro', 'el', 'hu', 'sv', 'da', 'no', 'fi', 'sk', 'bg', 'sr', 'hr']
};

// ============================================================
// AMENITIES - all possible amenities
// ============================================================
const ALL_AMENITIES = [
  'WiFi', 'Air Conditioning', 'Heating', 'Washer/Dryer',
  'Kitchen Access', 'Parking', 'Gym Access', 'Pool Access',
  'Furnished', 'Utilities Included', 'Pet Friendly', 'Balcony',
  'Workspace', 'TV', 'Dishwasher', 'Elevator', 'Security System',
  'Storage', 'Backyard', 'Fireplace', 'Central AC', 'Window Unit'
];

// ============================================================
// HOUSE RULES
// ============================================================
const HOUSE_RULES = {
  SMOKING: ['No Smoking', 'Smoking Allowed', 'Outside Smoking Only'],
  PETS: ['No Pets', 'Pets Allowed', 'Cats Only', 'Small Pets Only'],
  GUESTS: ['No Guests', 'Guests Allowed', 'Day Guests Only', 'No Overnight Guests'],
  COUPLES: ['Couples Allowed', 'Singles Only'],
  OTHER: ['No Parties', 'Quiet Hours 10pm-8am', 'Clean Common Areas', 'Respect Shared Spaces']
};

// ============================================================
// ROOM TYPES
// ============================================================
const ROOM_TYPES = ['Private Room', 'Shared Room', 'Entire Place'];

// ============================================================
// LEASE DURATIONS
// ============================================================
const LEASE_DURATIONS = ['Month-to-month', '3 months', '6 months', '12 months', 'Flexible'];

// ============================================================
// GENDER OPTIONS
// ============================================================
const GENDER_PREFERENCES = ['Any', 'Male Only', 'Female Only'];
const HOUSEHOLD_GENDERS = ['All Male', 'All Female', 'Mixed', 'Any'];

// ============================================================
// LOCATIONS - diverse US locations
// ============================================================
const LOCATIONS = [
  { city: 'Austin', state: 'TX', zip: '78701', lat: 30.2672, lng: -97.7431 },
  { city: 'Brooklyn', state: 'NY', zip: '11201', lat: 40.6892, lng: -73.9857 },
  { city: 'San Francisco', state: 'CA', zip: '94102', lat: 37.7749, lng: -122.4194 },
  { city: 'Miami Beach', state: 'FL', zip: '33139', lat: 25.7617, lng: -80.1918 },
  { city: 'Seattle', state: 'WA', zip: '98102', lat: 47.6062, lng: -122.3321 },
  { city: 'Chicago', state: 'IL', zip: '60622', lat: 41.8781, lng: -87.6298 },
  { city: 'Los Angeles', state: 'CA', zip: '90028', lat: 34.0522, lng: -118.2437 },
  { city: 'Denver', state: 'CO', zip: '80202', lat: 39.7392, lng: -104.9903 },
  { city: 'Portland', state: 'OR', zip: '97209', lat: 45.5152, lng: -122.6784 },
  { city: 'Atlanta', state: 'GA', zip: '30305', lat: 33.7490, lng: -84.3880 },
];

// ============================================================
// DATE HELPERS
// ============================================================
function getDate(daysFromNow) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date;
}

function getLeapYearDate() {
  // Feb 29, 2028 (next leap year)
  return new Date('2028-02-29T12:00:00Z');
}

function getYearEnd() {
  const year = new Date().getFullYear();
  return new Date(`${year}-12-31T12:00:00Z`);
}

function getYearStart() {
  const year = new Date().getFullYear() + 1;
  return new Date(`${year}-01-01T12:00:00Z`);
}

function getFarFuture() {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 5);
  return date;
}

function getYesterday() {
  return getDate(-1);
}

// ============================================================
// TEST LISTINGS DEFINITIONS
// ============================================================
const testListings = [
  // ========== MOVE-IN DATE EDGE CASES (1-9) ==========
  {
    title: '[TEST 1] Past Date - Yesterday Move-in',
    description: 'Testing past date handling - move-in date is yesterday',
    moveInDate: getYesterday(),
    householdLanguages: ['en'],
    category: 'DATE_EDGE'
  },
  {
    title: '[TEST 2] Far Future - 5 Years Away',
    description: 'Testing far future date - move-in 5 years from now',
    moveInDate: getFarFuture(),
    householdLanguages: ['en'],
    category: 'DATE_EDGE'
  },
  {
    title: '[TEST 3] Leap Year - Feb 29 2028',
    description: 'Testing leap year date handling',
    moveInDate: getLeapYearDate(),
    householdLanguages: ['en'],
    category: 'DATE_EDGE'
  },
  {
    title: '[TEST 4] Year End - Dec 31',
    description: 'Testing year rollover - Dec 31st',
    moveInDate: getYearEnd(),
    householdLanguages: ['en'],
    category: 'DATE_EDGE'
  },
  {
    title: '[TEST 5] Year Start - Jan 1',
    description: 'Testing year rollover - Jan 1st',
    moveInDate: getYearStart(),
    householdLanguages: ['en'],
    category: 'DATE_EDGE'
  },
  {
    title: '[TEST 6] Today - Immediate Move-in',
    description: 'Testing immediate move-in today',
    moveInDate: new Date(),
    householdLanguages: ['en'],
    category: 'DATE_EDGE'
  },
  {
    title: '[TEST 7] Tomorrow Move-in',
    description: 'Testing immediate - move-in tomorrow',
    moveInDate: getDate(1),
    leaseDuration: 'Month-to-month',
    householdLanguages: ['en'],
    category: 'DATE_EDGE'
  },
  {
    title: '[TEST 8] End of Month - 31st',
    description: 'Testing month-end date handling',
    moveInDate: new Date('2025-01-31T12:00:00Z'),
    householdLanguages: ['en'],
    category: 'DATE_EDGE'
  },
  {
    title: '[TEST 9] No Move-in Date Set',
    description: 'Testing null/undefined move-in date',
    moveInDate: null,
    householdLanguages: ['en'],
    category: 'DATE_EDGE'
  },

  // ========== LEASE DURATION EDGE CASES (10-14) ==========
  {
    title: '[TEST 10] Short Term - Month to Month',
    description: 'Testing short term lease filtering',
    leaseDuration: 'Month-to-month',
    householdLanguages: ['en'],
    category: 'LEASE'
  },
  {
    title: '[TEST 11] Mid Term - 3 Months',
    description: 'Testing 3 month lease filtering',
    leaseDuration: '3 months',
    householdLanguages: ['en'],
    category: 'LEASE'
  },
  {
    title: '[TEST 12] Mid Term - 6 Months',
    description: 'Testing 6 month lease filtering',
    leaseDuration: '6 months',
    householdLanguages: ['en'],
    category: 'LEASE'
  },
  {
    title: '[TEST 13] Long Term - 12 Months Strict',
    description: 'Testing strict 12 month lease - should not appear in short term filters',
    leaseDuration: '12 months',
    householdLanguages: ['en'],
    category: 'LEASE'
  },
  {
    title: '[TEST 14] Flexible Duration',
    description: 'Testing flexible lease duration',
    leaseDuration: 'Flexible',
    householdLanguages: ['en'],
    category: 'LEASE'
  },

  // ========== AMENITIES EDGE CASES (15-20) ==========
  {
    title: '[TEST 15] All Amenities Selected',
    description: 'Testing listing with ALL amenities - unicorn listing',
    amenities: ALL_AMENITIES,
    householdLanguages: ['en'],
    category: 'AMENITY'
  },
  {
    title: '[TEST 16] No Amenities',
    description: 'Testing listing with zero amenities',
    amenities: [],
    householdLanguages: ['en'],
    category: 'AMENITY'
  },
  {
    title: '[TEST 17] WiFi Only',
    description: 'Testing single amenity - WiFi only',
    amenities: ['WiFi'],
    householdLanguages: ['en'],
    category: 'AMENITY'
  },
  {
    title: '[TEST 18] WiFi + Pool Combo',
    description: 'Testing amenity combination - WiFi AND Pool',
    amenities: ['WiFi', 'Pool Access'],
    householdLanguages: ['en'],
    category: 'AMENITY'
  },
  {
    title: '[TEST 19] Conflicting AC Types - Central + Window',
    description: 'Testing mutually exclusive amenities - Central AC AND Window Unit',
    amenities: ['Central AC', 'Window Unit'],
    householdLanguages: ['en'],
    category: 'AMENITY'
  },
  {
    title: '[TEST 20] Kitchen + Gym + Parking',
    description: 'Testing three amenity combo',
    amenities: ['Kitchen Access', 'Gym Access', 'Parking'],
    householdLanguages: ['en'],
    category: 'AMENITY'
  },

  // ========== HOUSE RULES EDGE CASES (21-28) ==========
  {
    title: '[TEST 21] Pets Allowed + No Couples',
    description: 'Testing conflicting rules: Pets OK but Singles Only',
    houseRules: ['Pets Allowed', 'Singles Only', 'No Smoking'],
    householdLanguages: ['en'],
    category: 'RULES'
  },
  {
    title: '[TEST 22] No Smoking Strict',
    description: 'Testing smoking filter - should hide from Smoking Allowed filter',
    houseRules: ['No Smoking', 'Quiet Hours 10pm-8am'],
    householdLanguages: ['en'],
    category: 'RULES'
  },
  {
    title: '[TEST 23] Smoking Allowed',
    description: 'Testing smoking filter - should show for Smoking Allowed',
    houseRules: ['Smoking Allowed', 'Pets Allowed'],
    householdLanguages: ['en'],
    category: 'RULES'
  },
  {
    title: '[TEST 24] Cats Only (Partial Pets)',
    description: 'Testing partial pet policy - Cats only, no dogs',
    houseRules: ['Cats Only', 'No Smoking'],
    householdLanguages: ['en'],
    category: 'RULES'
  },
  {
    title: '[TEST 25] Day Guests Only',
    description: 'Testing guest policy - Day guests only, no overnight',
    houseRules: ['Day Guests Only', 'No Parties'],
    householdLanguages: ['en'],
    category: 'RULES'
  },
  {
    title: '[TEST 26] No Guests At All',
    description: 'Testing strict no guests policy',
    houseRules: ['No Guests', 'Quiet Hours 10pm-8am', 'No Parties'],
    householdLanguages: ['en'],
    category: 'RULES'
  },
  {
    title: '[TEST 27] Couples Allowed + Guests Allowed',
    description: 'Testing permissive rules',
    houseRules: ['Couples Allowed', 'Guests Allowed', 'Pets Allowed'],
    householdLanguages: ['en'],
    category: 'RULES'
  },
  {
    title: '[TEST 28] No Rules Set',
    description: 'Testing empty house rules',
    houseRules: [],
    householdLanguages: ['en'],
    category: 'RULES'
  },

  // ========== LANGUAGE EDGE CASES (29-45) ==========
  // RTL Languages
  {
    title: '[TEST 29] Arabic Only (RTL)',
    description: 'Testing Right-to-Left language - Arabic only',
    householdLanguages: ['ar'],
    category: 'LANGUAGE_RTL'
  },
  {
    title: '[TEST 30] Hebrew Only (RTL)',
    description: 'Testing Right-to-Left language - Hebrew only',
    householdLanguages: ['he'],
    category: 'LANGUAGE_RTL'
  },
  {
    title: '[TEST 31] Persian Only (RTL)',
    description: 'Testing Right-to-Left language - Persian/Farsi',
    householdLanguages: ['fa'],
    category: 'LANGUAGE_RTL'
  },
  {
    title: '[TEST 32] Urdu Only (RTL)',
    description: 'Testing Right-to-Left language - Urdu',
    householdLanguages: ['ur'],
    category: 'LANGUAGE_RTL'
  },
  {
    title: '[TEST 33] All RTL Languages',
    description: 'Testing all RTL languages together',
    householdLanguages: ['ar', 'he', 'fa', 'ur'],
    category: 'LANGUAGE_RTL'
  },

  // Rare Languages
  {
    title: '[TEST 34] Igbo Only (Rare African)',
    description: 'Testing rare language - Igbo only',
    householdLanguages: ['ig'],
    category: 'LANGUAGE_RARE'
  },
  {
    title: '[TEST 35] Finnish Only (Rare European)',
    description: 'Testing rare language - Finnish only',
    householdLanguages: ['fi'],
    category: 'LANGUAGE_RARE'
  },
  {
    title: '[TEST 36] Amharic Only (Rare African)',
    description: 'Testing rare language - Amharic only',
    householdLanguages: ['am'],
    category: 'LANGUAGE_RARE'
  },

  // Polyglot (Many Languages)
  {
    title: '[TEST 37] Polyglot - 10+ Languages',
    description: 'Testing many languages - household speaks 10+ languages',
    householdLanguages: ['en', 'es', 'zh', 'hi', 'ar', 'pt', 'ru', 'ja', 'de', 'fr', 'ko', 'vi'],
    category: 'LANGUAGE_MULTI'
  },
  {
    title: '[TEST 38] All Languages',
    description: 'Testing maximum languages - all supported languages',
    householdLanguages: [...LANGUAGES.MAJOR, ...LANGUAGES.SOUTH_ASIAN, ...LANGUAGES.EAST_ASIAN],
    category: 'LANGUAGE_MULTI'
  },

  // No Common Language scenarios
  {
    title: '[TEST 39] Mandarin + Telugu Only',
    description: 'Testing no English - Mandarin and Telugu only',
    householdLanguages: ['zh', 'te'],
    category: 'LANGUAGE_NO_ENGLISH'
  },
  {
    title: '[TEST 40] Japanese Only - No English',
    description: 'Testing non-English household',
    householdLanguages: ['ja'],
    category: 'LANGUAGE_NO_ENGLISH'
  },

  // South Asian Languages
  {
    title: '[TEST 41] Telugu + Tamil + Kannada',
    description: 'Testing South Indian languages',
    householdLanguages: ['te', 'ta', 'kn'],
    category: 'LANGUAGE_SOUTH_ASIAN'
  },
  {
    title: '[TEST 42] Hindi + Punjabi + Bengali',
    description: 'Testing North Indian languages',
    householdLanguages: ['hi', 'pa', 'bn'],
    category: 'LANGUAGE_SOUTH_ASIAN'
  },
  {
    title: '[TEST 43] All South Asian Languages',
    description: 'Testing all South Asian languages',
    householdLanguages: LANGUAGES.SOUTH_ASIAN,
    category: 'LANGUAGE_SOUTH_ASIAN'
  },

  // Special Character Languages
  {
    title: '[TEST 44] Spanish (Español) + French (Français)',
    description: 'Testing special characters in language display',
    householdLanguages: ['es', 'fr'],
    category: 'LANGUAGE_SPECIAL'
  },
  {
    title: '[TEST 45] No Languages Set',
    description: 'Testing empty language array',
    householdLanguages: [],
    category: 'LANGUAGE_EMPTY'
  },

  // ========== GENDER PREFERENCE EDGE CASES (46-55) ==========
  {
    title: '[TEST 46] Household All Male + Preference Any',
    description: 'Male household accepting anyone',
    householdGender: 'All Male',
    genderPreference: 'Any',
    householdLanguages: ['en'],
    category: 'GENDER'
  },
  {
    title: '[TEST 47] Household All Female + Preference Female Only',
    description: 'Female-only household seeking females',
    householdGender: 'All Female',
    genderPreference: 'Female Only',
    householdLanguages: ['en'],
    category: 'GENDER'
  },
  {
    title: '[TEST 48] Household All Male + Preference Female Only',
    description: 'Male household seeking females (edge case)',
    householdGender: 'All Male',
    genderPreference: 'Female Only',
    householdLanguages: ['en'],
    category: 'GENDER'
  },
  {
    title: '[TEST 49] Household Mixed + Preference Any',
    description: 'Mixed household accepting anyone',
    householdGender: 'Mixed',
    genderPreference: 'Any',
    householdLanguages: ['en'],
    category: 'GENDER'
  },
  {
    title: '[TEST 50] Household All Female + Preference Male Only',
    description: 'Female household seeking males (edge case)',
    householdGender: 'All Female',
    genderPreference: 'Male Only',
    householdLanguages: ['en'],
    category: 'GENDER'
  },
  {
    title: '[TEST 51] No Gender Specified',
    description: 'No gender preference or household gender set',
    householdGender: null,
    genderPreference: null,
    householdLanguages: ['en'],
    category: 'GENDER'
  },
  {
    title: '[TEST 52] Household Any + Preference Any',
    description: 'Maximum flexibility on gender',
    householdGender: 'Any',
    genderPreference: 'Any',
    householdLanguages: ['en'],
    category: 'GENDER'
  },
  {
    title: '[TEST 53] Male Only Strict',
    description: 'Strict male-only household and preference',
    householdGender: 'All Male',
    genderPreference: 'Male Only',
    householdLanguages: ['en'],
    category: 'GENDER'
  },
  {
    title: '[TEST 54] Female Household Accepting Males',
    description: 'Female household open to male roommates',
    householdGender: 'All Female',
    genderPreference: 'Any',
    householdLanguages: ['en'],
    category: 'GENDER'
  },
  {
    title: '[TEST 55] Mixed Seeking Females Only',
    description: 'Mixed household preferring female roommates',
    householdGender: 'Mixed',
    genderPreference: 'Female Only',
    householdLanguages: ['en'],
    category: 'GENDER'
  },

  // ========== ROOM TYPE EDGE CASES (56-59) ==========
  {
    title: '[TEST 56] Private Room',
    description: 'Testing private room filter',
    roomType: 'Private Room',
    householdLanguages: ['en'],
    category: 'ROOM'
  },
  {
    title: '[TEST 57] Shared Room',
    description: 'Testing shared room filter',
    roomType: 'Shared Room',
    householdLanguages: ['en'],
    category: 'ROOM'
  },
  {
    title: '[TEST 58] Entire Place',
    description: 'Testing entire place filter',
    roomType: 'Entire Place',
    householdLanguages: ['en'],
    category: 'ROOM'
  },
  {
    title: '[TEST 59] No Room Type Set',
    description: 'Testing null room type',
    roomType: null,
    householdLanguages: ['en'],
    category: 'ROOM'
  },

  // ========== CROSS-FILTER COMBINATIONS (60-75) ==========
  // Amenity + Language combos (Test cases 64-121 from the list)
  {
    title: '[TEST 60] WiFi + Pets Allowed',
    description: 'Testing amenity + rule combo',
    amenities: ['WiFi'],
    houseRules: ['Pets Allowed'],
    householdLanguages: ['en'],
    category: 'COMBO'
  },
  {
    title: '[TEST 61] AC + Smoking Allowed',
    description: 'Testing amenity + rule combo',
    amenities: ['Air Conditioning'],
    houseRules: ['Smoking Allowed'],
    householdLanguages: ['en'],
    category: 'COMBO'
  },
  {
    title: '[TEST 62] Parking + Couples Allowed',
    description: 'Testing amenity + rule combo',
    amenities: ['Parking'],
    houseRules: ['Couples Allowed'],
    householdLanguages: ['en'],
    category: 'COMBO'
  },
  {
    title: '[TEST 63] Washer/Dryer + Guests Allowed',
    description: 'Testing amenity + rule combo',
    amenities: ['Washer/Dryer'],
    houseRules: ['Guests Allowed'],
    householdLanguages: ['en'],
    category: 'COMBO'
  },
  {
    title: '[TEST 64] Kitchen + English',
    description: 'Testing amenity + language combo',
    amenities: ['Kitchen Access'],
    householdLanguages: ['en'],
    category: 'COMBO'
  },
  {
    title: '[TEST 65] Gym + Spanish',
    description: 'Testing amenity + language combo',
    amenities: ['Gym Access'],
    householdLanguages: ['es'],
    category: 'COMBO'
  },
  {
    title: '[TEST 66] Pool + Mandarin',
    description: 'Testing amenity + language combo',
    amenities: ['Pool Access'],
    householdLanguages: ['zh'],
    category: 'COMBO'
  },
  {
    title: '[TEST 67] WiFi + Hindi',
    description: 'Testing amenity + language combo',
    amenities: ['WiFi'],
    householdLanguages: ['hi'],
    category: 'COMBO'
  },
  {
    title: '[TEST 68] AC + Arabic',
    description: 'Testing amenity + RTL language combo',
    amenities: ['Air Conditioning'],
    householdLanguages: ['ar'],
    category: 'COMBO'
  },
  {
    title: '[TEST 69] Parking + Portuguese',
    description: 'Testing amenity + language combo',
    amenities: ['Parking'],
    householdLanguages: ['pt'],
    category: 'COMBO'
  },
  {
    title: '[TEST 70] Kitchen + Telugu',
    description: 'Testing amenity + South Asian language',
    amenities: ['Kitchen Access'],
    householdLanguages: ['te'],
    category: 'COMBO'
  },
  {
    title: '[TEST 71] Gym + Tamil',
    description: 'Testing amenity + South Asian language',
    amenities: ['Gym Access'],
    householdLanguages: ['ta'],
    category: 'COMBO'
  },
  {
    title: '[TEST 72] Pool + Bengali',
    description: 'Testing amenity + South Asian language',
    amenities: ['Pool Access'],
    householdLanguages: ['bn'],
    category: 'COMBO'
  },
  {
    title: '[TEST 73] WiFi + Malayalam',
    description: 'Testing amenity + South Asian language',
    amenities: ['WiFi'],
    householdLanguages: ['ml'],
    category: 'COMBO'
  },
  {
    title: '[TEST 74] AC + Urdu',
    description: 'Testing amenity + RTL South Asian language',
    amenities: ['Air Conditioning'],
    householdLanguages: ['ur'],
    category: 'COMBO'
  },
  {
    title: '[TEST 75] Kitchen + Hebrew',
    description: 'Testing amenity + RTL language',
    amenities: ['Kitchen Access'],
    householdLanguages: ['he'],
    category: 'COMBO'
  },

  // ========== UNICORN / IMPOSSIBLE LISTINGS (76-80) ==========
  {
    title: '[TEST 76] The Unicorn - Everything Selected',
    description: 'Maximum filters: All amenities, all rules, all languages, immediate move-in',
    amenities: ALL_AMENITIES,
    houseRules: ['Pets Allowed', 'Couples Allowed', 'Guests Allowed', 'Smoking Allowed'],
    householdLanguages: [...LANGUAGES.MAJOR, ...LANGUAGES.SOUTH_ASIAN],
    moveInDate: new Date(),
    leaseDuration: 'Flexible',
    roomType: 'Private Room',
    genderPreference: 'Any',
    householdGender: 'Mixed',
    category: 'UNICORN'
  },
  {
    title: '[TEST 77] Impossible - Tomorrow + Finnish + Female Only',
    description: 'Rare combination that should return 0 normally',
    householdLanguages: ['fi'],
    moveInDate: getDate(1),
    householdGender: 'All Female',
    genderPreference: 'Female Only',
    houseRules: ['No Smoking', 'No Pets'],
    category: 'IMPOSSIBLE'
  },
  {
    title: '[TEST 78] Date + Duration Conflict',
    description: 'Move-in Dec 25 + 1 month lease',
    moveInDate: new Date('2025-12-25T12:00:00Z'),
    leaseDuration: 'Month-to-month',
    householdLanguages: ['en'],
    category: 'CONFLICT'
  },
  {
    title: '[TEST 79] Amenity + Rule Conflict',
    description: 'Gym access but no guests allowed',
    amenities: ['Gym Access'],
    houseRules: ['No Guests'],
    householdLanguages: ['en'],
    category: 'CONFLICT'
  },
  {
    title: '[TEST 80] Language + Gender Specific',
    description: 'Hindi speaking + Female only household',
    householdLanguages: ['hi'],
    householdGender: 'All Female',
    genderPreference: 'Female Only',
    category: 'SPECIFIC'
  },

  // ========== EUROPEAN LANGUAGE COMBOS (81-95) ==========
  {
    title: '[TEST 81] WiFi + Ukrainian',
    description: 'Amenity + Eastern European language',
    amenities: ['WiFi'],
    householdLanguages: ['uk'],
    category: 'EURO_LANG'
  },
  {
    title: '[TEST 82] AC + Swedish',
    description: 'Amenity + Nordic language',
    amenities: ['Air Conditioning'],
    householdLanguages: ['sv'],
    category: 'EURO_LANG'
  },
  {
    title: '[TEST 83] Parking + Danish',
    description: 'Amenity + Nordic language',
    amenities: ['Parking'],
    householdLanguages: ['da'],
    category: 'EURO_LANG'
  },
  {
    title: '[TEST 84] Kitchen + Norwegian',
    description: 'Amenity + Nordic language',
    amenities: ['Kitchen Access'],
    householdLanguages: ['no'],
    category: 'EURO_LANG'
  },
  {
    title: '[TEST 85] Gym + Finnish',
    description: 'Amenity + Nordic language',
    amenities: ['Gym Access'],
    householdLanguages: ['fi'],
    category: 'EURO_LANG'
  },
  {
    title: '[TEST 86] Pool + Greek',
    description: 'Amenity + Greek language',
    amenities: ['Pool Access'],
    householdLanguages: ['el'],
    category: 'EURO_LANG'
  },
  {
    title: '[TEST 87] WiFi + Hungarian',
    description: 'Amenity + Hungarian language',
    amenities: ['WiFi'],
    householdLanguages: ['hu'],
    category: 'EURO_LANG'
  },
  {
    title: '[TEST 88] AC + Romanian',
    description: 'Amenity + Romanian language',
    amenities: ['Air Conditioning'],
    householdLanguages: ['ro'],
    category: 'EURO_LANG'
  },
  {
    title: '[TEST 89] Parking + Czech',
    description: 'Amenity + Czech language',
    amenities: ['Parking'],
    householdLanguages: ['cs'],
    category: 'EURO_LANG'
  },
  {
    title: '[TEST 90] Kitchen + Polish',
    description: 'Amenity + Polish language',
    amenities: ['Kitchen Access'],
    householdLanguages: ['pl'],
    category: 'EURO_LANG'
  },
  {
    title: '[TEST 91] Gym + Turkish',
    description: 'Amenity + Turkish language',
    amenities: ['Gym Access'],
    householdLanguages: ['tr'],
    category: 'EURO_LANG'
  },
  {
    title: '[TEST 92] Pool + Bulgarian',
    description: 'Amenity + Bulgarian language',
    amenities: ['Pool Access'],
    householdLanguages: ['bg'],
    category: 'EURO_LANG'
  },
  {
    title: '[TEST 93] WiFi + Serbian',
    description: 'Amenity + Serbian language',
    amenities: ['WiFi'],
    householdLanguages: ['sr'],
    category: 'EURO_LANG'
  },
  {
    title: '[TEST 94] AC + Croatian',
    description: 'Amenity + Croatian language',
    amenities: ['Air Conditioning'],
    householdLanguages: ['hr'],
    category: 'EURO_LANG'
  },
  {
    title: '[TEST 95] Parking + Slovak',
    description: 'Amenity + Slovak language',
    amenities: ['Parking'],
    householdLanguages: ['sk'],
    category: 'EURO_LANG'
  },

  // ========== AFRICAN LANGUAGE COMBOS (96-100) ==========
  {
    title: '[TEST 96] Gym + Swahili',
    description: 'Amenity + East African language',
    amenities: ['Gym Access'],
    householdLanguages: ['sw'],
    category: 'AFRICAN_LANG'
  },
  {
    title: '[TEST 97] Pool + Amharic',
    description: 'Amenity + Ethiopian language',
    amenities: ['Pool Access'],
    householdLanguages: ['am'],
    category: 'AFRICAN_LANG'
  },
  {
    title: '[TEST 98] WiFi + Yoruba',
    description: 'Amenity + Nigerian language',
    amenities: ['WiFi'],
    householdLanguages: ['yo'],
    category: 'AFRICAN_LANG'
  },
  {
    title: '[TEST 99] AC + Hausa',
    description: 'Amenity + Nigerian language',
    amenities: ['Air Conditioning'],
    householdLanguages: ['ha'],
    category: 'AFRICAN_LANG'
  },
  {
    title: '[TEST 100] Parking + Igbo',
    description: 'Amenity + Nigerian language',
    amenities: ['Parking'],
    householdLanguages: ['ig'],
    category: 'AFRICAN_LANG'
  },

  // ========== EAST/SOUTHEAST ASIAN LANGUAGE COMBOS (101-110) ==========
  {
    title: '[TEST 101] Kitchen + Cantonese',
    description: 'Amenity + Cantonese (different from Mandarin)',
    amenities: ['Kitchen Access'],
    householdLanguages: ['yue'],
    category: 'ASIAN_LANG'
  },
  {
    title: '[TEST 102] Gym + Tagalog',
    description: 'Amenity + Filipino language',
    amenities: ['Gym Access'],
    householdLanguages: ['tl'],
    category: 'ASIAN_LANG'
  },
  {
    title: '[TEST 103] Pool + Indonesian',
    description: 'Amenity + Indonesian language',
    amenities: ['Pool Access'],
    householdLanguages: ['id'],
    category: 'ASIAN_LANG'
  },
  {
    title: '[TEST 104] WiFi + Malay',
    description: 'Amenity + Malaysian language',
    amenities: ['WiFi'],
    householdLanguages: ['ms'],
    category: 'ASIAN_LANG'
  },
  {
    title: '[TEST 105] AC + Burmese',
    description: 'Amenity + Myanmar language',
    amenities: ['Air Conditioning'],
    householdLanguages: ['my'],
    category: 'ASIAN_LANG'
  },
  {
    title: '[TEST 106] Parking + Khmer',
    description: 'Amenity + Cambodian language',
    amenities: ['Parking'],
    householdLanguages: ['km'],
    category: 'ASIAN_LANG'
  },
  {
    title: '[TEST 107] Kitchen + Thai',
    description: 'Amenity + Thai language',
    amenities: ['Kitchen Access'],
    householdLanguages: ['th'],
    category: 'ASIAN_LANG'
  },
  {
    title: '[TEST 108] Gym + Vietnamese',
    description: 'Amenity + Vietnamese language',
    amenities: ['Gym Access'],
    householdLanguages: ['vi'],
    category: 'ASIAN_LANG'
  },
  {
    title: '[TEST 109] Pool + Korean',
    description: 'Amenity + Korean language',
    amenities: ['Pool Access'],
    householdLanguages: ['ko'],
    category: 'ASIAN_LANG'
  },
  {
    title: '[TEST 110] WiFi + Japanese',
    description: 'Amenity + Japanese language',
    amenities: ['WiFi'],
    householdLanguages: ['ja'],
    category: 'ASIAN_LANG'
  },

  // ========== SOUTH ASIAN LANGUAGE COMBOS (111-120) ==========
  {
    title: '[TEST 111] AC + Punjabi',
    description: 'Amenity + Punjabi language',
    amenities: ['Air Conditioning'],
    householdLanguages: ['pa'],
    category: 'SOUTH_ASIAN'
  },
  {
    title: '[TEST 112] Parking + Gujarati',
    description: 'Amenity + Gujarati language',
    amenities: ['Parking'],
    householdLanguages: ['gu'],
    category: 'SOUTH_ASIAN'
  },
  {
    title: '[TEST 113] Kitchen + Marathi',
    description: 'Amenity + Marathi language',
    amenities: ['Kitchen Access'],
    householdLanguages: ['mr'],
    category: 'SOUTH_ASIAN'
  },
  {
    title: '[TEST 114] Gym + Kannada',
    description: 'Amenity + Kannada language',
    amenities: ['Gym Access'],
    householdLanguages: ['kn'],
    category: 'SOUTH_ASIAN'
  },
  {
    title: '[TEST 115] Pool + Nepali',
    description: 'Amenity + Nepali language',
    amenities: ['Pool Access'],
    householdLanguages: ['ne'],
    category: 'SOUTH_ASIAN'
  },
  {
    title: '[TEST 116] WiFi + Sinhala',
    description: 'Amenity + Sri Lankan language',
    amenities: ['WiFi'],
    householdLanguages: ['si'],
    category: 'SOUTH_ASIAN'
  },
  {
    title: '[TEST 117] All South Asian + Private Room',
    description: 'All South Asian languages + Private Room',
    householdLanguages: LANGUAGES.SOUTH_ASIAN,
    roomType: 'Private Room',
    category: 'SOUTH_ASIAN'
  },
  {
    title: '[TEST 118] Hindi + Telugu + Tamil',
    description: 'Multi South Asian language household',
    householdLanguages: ['hi', 'te', 'ta'],
    amenities: ['WiFi', 'Kitchen Access'],
    category: 'SOUTH_ASIAN'
  },
  {
    title: '[TEST 119] Malayalam + Kannada Female Only',
    description: 'South Indian languages + Female household',
    householdLanguages: ['ml', 'kn'],
    householdGender: 'All Female',
    genderPreference: 'Female Only',
    category: 'SOUTH_ASIAN'
  },
  {
    title: '[TEST 120] Bengali + Nepali Mixed',
    description: 'Eastern South Asian languages + Mixed household',
    householdLanguages: ['bn', 'ne'],
    householdGender: 'Mixed',
    genderPreference: 'Any',
    category: 'SOUTH_ASIAN'
  },
];

// ============================================================
// MAIN SEED FUNCTION
// ============================================================
async function main() {
  console.log('🚀 Starting comprehensive test listings seed...\n');

  // Find the user
  const user = await prisma.user.findFirst({
    where: { email: 'suryaram564@gmail.com' }
  });

  if (!user) {
    console.error('❌ User suryaram564@gmail.com not found! Please log in first.');
    process.exit(1);
  }

  console.log(`✅ Found user: ${user.name} (${user.email})\n`);

  // Delete existing test listings for this user
  console.log('🧹 Cleaning up existing test listings...');
  const deleted = await prisma.listing.deleteMany({
    where: {
      ownerId: user.id,
      title: { startsWith: '[TEST' }
    }
  });
  console.log(`   Deleted ${deleted.count} existing test listings\n`);

  // Create test listings
  let created = 0;
  let failed = 0;
  const categories = {};

  for (let i = 0; i < testListings.length; i++) {
    const test = testListings[i];
    const location = LOCATIONS[i % LOCATIONS.length];

    try {
      // Set defaults
      const amenities = test.amenities || ['WiFi'];
      const houseRules = test.houseRules || ['No Smoking'];
      const price = 1000 + Math.floor(Math.random() * 1500);

      const listing = await prisma.listing.create({
        data: {
          title: test.title,
          description: test.description,
          price: price,
          images: [
            `https://picsum.photos/seed/${i + 1000}/800/600`,
            `https://picsum.photos/seed/${i + 2000}/800/600`,
          ],
          amenities: amenities,
          houseRules: houseRules,
          householdLanguages: test.householdLanguages || ['en'],
          genderPreference: test.genderPreference || 'Any',
          householdGender: test.householdGender || 'Mixed',
          leaseDuration: test.leaseDuration || 'Flexible',
          roomType: test.roomType || 'Private Room',
          totalSlots: 2,
          availableSlots: 1,
          status: 'ACTIVE',
          moveInDate: test.moveInDate !== undefined ? test.moveInDate : getDate(7 + i),
          ownerId: user.id,
          location: {
            create: {
              address: `${100 + i} Test Street`,
              city: location.city,
              state: location.state,
              zip: location.zip,
            }
          }
        }
      });

      // Update location with PostGIS coordinates
      const point = `POINT(${location.lng} ${location.lat})`;
      await prisma.$executeRaw`
        UPDATE "Location"
        SET coords = ST_SetSRID(ST_GeomFromText(${point}), 4326)
        WHERE "listingId" = ${listing.id}
      `;

      // Track categories
      const category = test.category || 'OTHER';
      categories[category] = (categories[category] || 0) + 1;

      created++;
      console.log(`   ✅ ${test.title}`);
    } catch (error) {
      failed++;
      console.error(`   ❌ Failed: ${test.title}`, error.message);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Created: ${created} listings`);
  console.log(`❌ Failed: ${failed} listings`);
  console.log('\n📁 Listings by Category:');
  Object.entries(categories).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
    console.log(`   ${cat}: ${count}`);
  });
  console.log('\n🎉 Test listings seed complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
