import { parseNaturalLanguageQuery, nlQueryToSearchParams } from '../natural-language-parser';

describe('parseNaturalLanguageQuery', () => {
  it('returns null for empty input', () => {
    expect(parseNaturalLanguageQuery('')).toBeNull();
    expect(parseNaturalLanguageQuery('  ')).toBeNull();
  });

  it('returns null for plain location query', () => {
    expect(parseNaturalLanguageQuery('Austin TX')).toBeNull();
    expect(parseNaturalLanguageQuery('San Francisco')).toBeNull();
  });

  // Price extraction
  it('parses "under $1000"', () => {
    const result = parseNaturalLanguageQuery('under $1000');
    expect(result?.maxPrice).toBe('1000');
  });

  it('parses "over $800"', () => {
    const result = parseNaturalLanguageQuery('over $800');
    expect(result?.minPrice).toBe('800');
  });

  it('parses "$800-$1200"', () => {
    const result = parseNaturalLanguageQuery('$800-$1200');
    expect(result?.minPrice).toBe('800');
    expect(result?.maxPrice).toBe('1200');
  });

  it('parses "between $800 and $1200"', () => {
    const result = parseNaturalLanguageQuery('between $800 and $1200');
    expect(result?.minPrice).toBe('800');
    expect(result?.maxPrice).toBe('1200');
  });

  // Room types
  it('parses "private room"', () => {
    const result = parseNaturalLanguageQuery('private room under $1000');
    expect(result?.roomType).toBe('Private Room');
  });

  it('parses "entire place"', () => {
    const result = parseNaturalLanguageQuery('entire place in Austin');
    expect(result?.roomType).toBe('Entire Place');
  });

  // Amenities
  it('parses amenities', () => {
    const result = parseNaturalLanguageQuery('furnished with wifi in Austin');
    expect(result?.amenities).toContain('Furnished');
    expect(result?.amenities).toContain('Wifi');
  });

  // House rules
  it('parses pet friendly', () => {
    const result = parseNaturalLanguageQuery('pet friendly room');
    expect(result?.houseRules).toContain('Pets allowed');
  });

  // Lease duration
  it('parses month-to-month', () => {
    const result = parseNaturalLanguageQuery('month to month in Austin');
    expect(result?.leaseDuration).toBe('Month-to-month');
  });

  it('parses short term', () => {
    const result = parseNaturalLanguageQuery('short term furnished');
    expect(result?.leaseDuration).toBe('Month-to-month');
  });

  // Location extraction
  it('extracts location from complex query', () => {
    const result = parseNaturalLanguageQuery('furnished room under $1000 in Austin');
    expect(result?.location).toBe('Austin');
    expect(result?.maxPrice).toBe('1000');
    expect(result?.amenities).toContain('Furnished');
  });

  it('extracts location from "pet friendly entire place in San Francisco"', () => {
    const result = parseNaturalLanguageQuery('pet friendly entire place in San Francisco');
    expect(result?.location).toBe('San Francisco');
    expect(result?.roomType).toBe('Entire Place');
    expect(result?.houseRules).toContain('Pets allowed');
  });

  // Comma-separated prices
  it('parses prices with commas', () => {
    const result = parseNaturalLanguageQuery('under $1,500');
    expect(result?.maxPrice).toBe('1500');
  });
});

describe('nlQueryToSearchParams', () => {
  it('converts parsed query to search params', () => {
    const params = nlQueryToSearchParams({
      location: 'Austin',
      minPrice: '800',
      maxPrice: '1200',
      roomType: 'Private Room',
      amenities: ['Wifi', 'Furnished'],
      houseRules: ['Pets allowed'],
      leaseDuration: 'Month-to-month',
    });

    expect(params.get('q')).toBe('Austin');
    expect(params.get('minPrice')).toBe('800');
    expect(params.get('maxPrice')).toBe('1200');
    expect(params.get('roomType')).toBe('Private Room');
    expect(params.get('amenities')).toBe('Wifi,Furnished');
    expect(params.get('houseRules')).toBe('Pets allowed');
    expect(params.get('leaseDuration')).toBe('Month-to-month');
  });

  it('omits empty fields', () => {
    const params = nlQueryToSearchParams({
      location: '',
      amenities: [],
      houseRules: [],
    });

    expect(params.has('q')).toBe(false);
    expect(params.has('amenities')).toBe(false);
    expect(params.has('houseRules')).toBe(false);
  });

  it('converts minAvailableSlots to minSlots param name', () => {
    const params = nlQueryToSearchParams({
      location: 'Austin',
      amenities: [],
      houseRules: [],
      minAvailableSlots: '3',
    });

    expect(params.get('minSlots')).toBe('3');
    expect(params.has('minAvailableSlots')).toBe(false);
  });
});

describe('Edge cases and boundaries', () => {
  it('"3 rooms" does NOT trigger minSlots (rooms reserved for room type)', () => {
    const result = parseNaturalLanguageQuery('3 rooms in Austin');
    // Should not set minAvailableSlots — "rooms" is excluded from slots pattern
    expect(result?.minAvailableSlots).toBeUndefined();
  });

  it('"1 spot" does NOT trigger minSlots (pattern excludes single)', () => {
    const result = parseNaturalLanguageQuery('1 spot in Austin');
    expect(result?.minAvailableSlots).toBeUndefined();
  });

  it('"21 spots" does NOT trigger minSlots (caps at 20)', () => {
    const result = parseNaturalLanguageQuery('21 spots in Austin');
    expect(result?.minAvailableSlots).toBeUndefined();
  });

  it('"2 spots" triggers minAvailableSlots=2', () => {
    const result = parseNaturalLanguageQuery('2 spots in Austin');
    expect(result).not.toBeNull();
    expect(result?.minAvailableSlots).toBe('2');
  });

  it('conflicting prices — first match wins', () => {
    const result = parseNaturalLanguageQuery('under $600 over $500 in Austin');
    // "under $600" matches first → maxPrice=600
    expect(result).not.toBeNull();
    expect(result?.maxPrice).toBe('600');
  });

  it('all filters, no location → empty location string', () => {
    const result = parseNaturalLanguageQuery('under $1000 with WiFi private room');
    expect(result).not.toBeNull();
    expect(result?.location).toBe('');
  });

  it('case insensitivity: "PRIVATE ROOM" matches', () => {
    const result = parseNaturalLanguageQuery('PRIVATE ROOM in Austin');
    expect(result).not.toBeNull();
    expect(result?.roomType).toBeDefined();
  });

  it('"smoking ok" extracts house rule', () => {
    const result = parseNaturalLanguageQuery('smoking ok in Austin');
    expect(result).not.toBeNull();
    expect(result?.houseRules.length).toBeGreaterThan(0);
  });

  it('"guests allowed" extracts house rule', () => {
    const result = parseNaturalLanguageQuery('guests allowed in Austin');
    expect(result).not.toBeNull();
    expect(result?.houseRules.length).toBeGreaterThan(0);
  });
});
