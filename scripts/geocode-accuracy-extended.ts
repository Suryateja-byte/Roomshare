#!/usr/bin/env npx ts-node
/**
 * Extended Geocoding Accuracy Test Suite
 *
 * Comprehensive testing across multiple address types and regions.
 * Generates detailed reports for provider comparison.
 *
 * Usage:
 *   npx ts-node scripts/geocode-accuracy-extended.ts [--json] [--category=<name>]
 *
 * Options:
 *   --json          Output only JSON (for piping to file)
 *   --category=all  Test specific category (residential|commercial|apartments|rural|all)
 *
 * Examples:
 *   npx ts-node scripts/geocode-accuracy-extended.ts
 *   npx ts-node scripts/geocode-accuracy-extended.ts --json > results.json
 *   npx ts-node scripts/geocode-accuracy-extended.ts --category=apartments
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '../.env') });

import {
  geocodeMapbox,
  geocodeMapboxV5,
  geocodeHere,
  geocodeCensus,
  compareGeocodeResults,
  type GeocodeComparison,
} from './lib/geocoding-providers';
import { formatDistance, metersToMiles } from './lib/haversine';

// ============================================================================
// Test Address Categories
// ============================================================================

interface TestAddress {
  address: string;
  category: string;
  expectedCity?: string;
  expectedState?: string;
  notes?: string;
}

const TEST_ADDRESSES: TestAddress[] = [
  // ---------------------------------------------
  // RESIDENTIAL - Standard homes
  // ---------------------------------------------
  {
    address: '1121 Hidden Ridge, Irving, TX 75038',
    category: 'residential',
    expectedCity: 'Irving',
    expectedState: 'TX',
    notes: 'Primary Roomshare test address',
  },
  {
    address: '2550 N Beltline Rd, Irving, TX 75062',
    category: 'residential',
    expectedCity: 'Irving',
    expectedState: 'TX',
  },
  {
    address: '123 Main St, Springfield, IL 62701',
    category: 'residential',
    expectedCity: 'Springfield',
    expectedState: 'IL',
    notes: 'Common street name - tests disambiguation',
  },
  {
    address: '456 Oak Ave, Pasadena, CA 91101',
    category: 'residential',
    expectedCity: 'Pasadena',
    expectedState: 'CA',
  },
  {
    address: '789 Maple Dr, Denver, CO 80202',
    category: 'residential',
    expectedCity: 'Denver',
    expectedState: 'CO',
  },

  // ---------------------------------------------
  // APARTMENTS - Multi-unit buildings
  // ---------------------------------------------
  {
    address: '350 5th Ave, New York, NY 10118',
    category: 'apartments',
    expectedCity: 'New York',
    expectedState: 'NY',
    notes: 'Empire State Building - famous landmark',
  },
  {
    address: '4200 W Airport Fwy, Irving, TX 75062',
    category: 'apartments',
    expectedCity: 'Irving',
    expectedState: 'TX',
  },
  {
    address: '1999 Bryan St, Dallas, TX 75201',
    category: 'apartments',
    expectedCity: 'Dallas',
    expectedState: 'TX',
  },
  {
    address: '100 S Wacker Dr, Chicago, IL 60606',
    category: 'apartments',
    expectedCity: 'Chicago',
    expectedState: 'IL',
  },
  {
    address: '1 Canal St, New Orleans, LA 70130',
    category: 'apartments',
    expectedCity: 'New Orleans',
    expectedState: 'LA',
  },

  // ---------------------------------------------
  // COMMERCIAL - Office buildings, tech campuses
  // ---------------------------------------------
  {
    address: '1 Infinite Loop, Cupertino, CA 95014',
    category: 'commercial',
    expectedCity: 'Cupertino',
    expectedState: 'CA',
    notes: 'Apple HQ',
  },
  {
    address: '1600 Amphitheatre Parkway, Mountain View, CA 94043',
    category: 'commercial',
    expectedCity: 'Mountain View',
    expectedState: 'CA',
    notes: 'Google HQ',
  },
  {
    address: '1 Microsoft Way, Redmond, WA 98052',
    category: 'commercial',
    expectedCity: 'Redmond',
    expectedState: 'WA',
    notes: 'Microsoft HQ',
  },
  {
    address: '100 Universal City Plaza, Universal City, CA 91608',
    category: 'commercial',
    expectedCity: 'Universal City',
    expectedState: 'CA',
    notes: 'Entertainment complex',
  },
  {
    address: '1 Facebook Way, Menlo Park, CA 94025',
    category: 'commercial',
    expectedCity: 'Menlo Park',
    expectedState: 'CA',
    notes: 'Meta HQ',
  },

  // ---------------------------------------------
  // RURAL - Less common addresses
  // ---------------------------------------------
  {
    address: '1234 County Road 500, Liberal, KS 67901',
    category: 'rural',
    expectedCity: 'Liberal',
    expectedState: 'KS',
    notes: 'Rural address format',
  },
  {
    address: '5678 State Highway 29, Bertram, TX 78605',
    category: 'rural',
    expectedCity: 'Bertram',
    expectedState: 'TX',
    notes: 'Texas rural highway',
  },
  {
    address: '100 Farm to Market Rd 1960, Houston, TX 77090',
    category: 'rural',
    expectedCity: 'Houston',
    expectedState: 'TX',
    notes: 'FM Road - Texas specific',
  },
  {
    address: 'HC 60 Box 200, Magdalena, NM 87825',
    category: 'rural',
    expectedCity: 'Magdalena',
    expectedState: 'NM',
    notes: 'Highway Contract route',
  },
  {
    address: 'RR 2 Box 100, Montpelier, VT 05602',
    category: 'rural',
    expectedCity: 'Montpelier',
    expectedState: 'VT',
    notes: 'Rural Route address',
  },

  // ---------------------------------------------
  // EDGE CASES - Unusual or tricky addresses
  // ---------------------------------------------
  {
    address: '1 World Trade Center, New York, NY 10007',
    category: 'edge',
    expectedCity: 'New York',
    expectedState: 'NY',
    notes: 'Rebuilt landmark',
  },
  {
    address: '1060 W Addison St, Chicago, IL 60613',
    category: 'edge',
    expectedCity: 'Chicago',
    expectedState: 'IL',
    notes: 'Wrigley Field',
  },
  {
    address: '4 Pennsylvania Plaza, New York, NY 10001',
    category: 'edge',
    expectedCity: 'New York',
    expectedState: 'NY',
    notes: 'MSG',
  },
  {
    address: '1600 Pennsylvania Ave NW, Washington, DC 20500',
    category: 'edge',
    expectedCity: 'Washington',
    expectedState: 'DC',
    notes: 'White House',
  },
];

// ============================================================================
// Configuration
// ============================================================================

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_ACCESS_TOKEN;
const HERE_API_KEY = process.env.HERE_API_KEY;

// Parse command line arguments
const args = process.argv.slice(2);
const jsonOnly = args.includes('--json');
const categoryArg = args.find((a) => a.startsWith('--category='));
const selectedCategory = categoryArg?.split('=')[1] || 'all';

function log(message: string) {
  if (!jsonOnly) {
    console.log(message);
  }
}

function logError(message: string) {
  console.error(message);
}

// ============================================================================
// Analysis Functions
// ============================================================================

interface CategoryStats {
  category: string;
  total: number;
  mapboxWins: number;
  hereWins: number;
  ties: number;
  failures: number;
  avgMapboxDelta: number;
  avgHereDelta: number;
}

interface ExtendedResults {
  timestamp: string;
  config: {
    selectedCategory: string;
    totalAddresses: number;
    mapboxToken: string;
    hereKey: string;
  };
  categoryStats: CategoryStats[];
  overallStats: {
    mapboxWins: number;
    hereWins: number;
    ties: number;
    failures: number;
    avgMapboxDelta: number;
    avgHereDelta: number;
    recommendation: string;
  };
  details: Array<{
    address: string;
    category: string;
    notes?: string;
    mapbox: { lat: number; lon: number; formatted: string | null } | null;
    here: { lat: number; lon: number; formatted: string | null } | null;
    census: { lat: number; lon: number; formatted: string | null } | null;
    distances: {
      mapbox_census: number | null;
      here_census: number | null;
      mapbox_here: number | null;
    };
    winner: string;
    error?: string;
  }>;
}

function calculateCategoryStats(
  comparisons: GeocodeComparison[],
  category: string
): CategoryStats {
  const categoryComparisons = comparisons.filter((c) => {
    const testAddr = TEST_ADDRESSES.find((t) => t.address === c.address);
    return testAddr?.category === category;
  });

  const stats: CategoryStats = {
    category,
    total: categoryComparisons.length,
    mapboxWins: 0,
    hereWins: 0,
    ties: 0,
    failures: 0,
    avgMapboxDelta: 0,
    avgHereDelta: 0,
  };

  const mapboxDeltas: number[] = [];
  const hereDeltas: number[] = [];

  for (const comp of categoryComparisons) {
    switch (comp.winner) {
      case 'mapbox':
        stats.mapboxWins++;
        break;
      case 'here':
        stats.hereWins++;
        break;
      case 'tie':
        stats.ties++;
        break;
      default:
        stats.failures++;
    }

    if (comp.distances.mapbox_census !== null) {
      mapboxDeltas.push(comp.distances.mapbox_census);
    }
    if (comp.distances.here_census !== null) {
      hereDeltas.push(comp.distances.here_census);
    }
  }

  if (mapboxDeltas.length > 0) {
    stats.avgMapboxDelta = mapboxDeltas.reduce((a, b) => a + b, 0) / mapboxDeltas.length;
  }
  if (hereDeltas.length > 0) {
    stats.avgHereDelta = hereDeltas.reduce((a, b) => a + b, 0) / hereDeltas.length;
  }

  return stats;
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  log('\n🗺️  Extended Geocoding Accuracy Test Suite');
  log('   Mapbox vs HERE vs US Census Baseline\n');

  // Validate environment
  if (!MAPBOX_TOKEN) {
    logError('❌ ERROR: Missing NEXT_PUBLIC_MAPBOX_TOKEN or MAPBOX_ACCESS_TOKEN');
    process.exit(1);
  }

  if (!HERE_API_KEY) {
    logError('❌ ERROR: Missing HERE_API_KEY');
    logError('   Get a free API key from: https://developer.here.com/');
    process.exit(1);
  }

  // Filter addresses by category
  const addressesToTest =
    selectedCategory === 'all'
      ? TEST_ADDRESSES
      : TEST_ADDRESSES.filter((a) => a.category === selectedCategory);

  if (addressesToTest.length === 0) {
    logError(`❌ No addresses found for category: ${selectedCategory}`);
    logError(`   Available categories: residential, apartments, commercial, rural, edge, all`);
    process.exit(1);
  }

  log(`Testing ${addressesToTest.length} addresses (category: ${selectedCategory})...`);
  log('');

  const comparisons: GeocodeComparison[] = [];
  const details: ExtendedResults['details'] = [];

  // Process each address
  for (let i = 0; i < addressesToTest.length; i++) {
    const testAddr = addressesToTest[i];
    const progress = `[${i + 1}/${addressesToTest.length}]`;

    log(`${progress} Testing: ${testAddr.address}`);

    try {
      const [mapbox, mapboxV5, here, census] = await Promise.all([
        geocodeMapbox(testAddr.address, MAPBOX_TOKEN).catch(() => null),
        geocodeMapboxV5(testAddr.address, MAPBOX_TOKEN).catch(() => null),
        geocodeHere(testAddr.address, HERE_API_KEY).catch(() => null),
        geocodeCensus(testAddr.address).catch(() => null),
      ]);

      const comparison = compareGeocodeResults(
        testAddr.address,
        mapbox,
        mapboxV5,
        here,
        census
      );

      comparisons.push(comparison);

      // Print inline result
      const distMb = comparison.distances.mapbox_census;
      const distHere = comparison.distances.here_census;

      log(
        `         Mapbox: ${distMb !== null ? formatDistance(distMb) : 'N/A'} | ` +
          `HERE: ${distHere !== null ? formatDistance(distHere) : 'N/A'} | ` +
          `Winner: ${comparison.winner}`
      );

      details.push({
        address: testAddr.address,
        category: testAddr.category,
        notes: testAddr.notes,
        mapbox: mapbox
          ? { lat: mapbox.lat, lon: mapbox.lon, formatted: mapbox.formatted }
          : null,
        here: here
          ? { lat: here.lat, lon: here.lon, formatted: here.formatted }
          : null,
        census: census
          ? { lat: census.lat, lon: census.lon, formatted: census.formatted }
          : null,
        distances: {
          mapbox_census: comparison.distances.mapbox_census,
          here_census: comparison.distances.here_census,
          mapbox_here: comparison.distances.mapbox_here,
        },
        winner: comparison.winner,
      });
    } catch (error) {
      log(`         ERROR: ${error}`);
      details.push({
        address: testAddr.address,
        category: testAddr.category,
        notes: testAddr.notes,
        mapbox: null,
        here: null,
        census: null,
        distances: { mapbox_census: null, here_census: null, mapbox_here: null },
        winner: 'unknown',
        error: String(error),
      });
    }

    // Rate limiting delay
    await new Promise((r) => setTimeout(r, 150));
  }

  // Calculate category statistics
  const categories = [...new Set(addressesToTest.map((a) => a.category))];
  const categoryStats = categories.map((cat) => calculateCategoryStats(comparisons, cat));

  // Calculate overall statistics
  let totalMapboxWins = 0;
  let totalHereWins = 0;
  let totalTies = 0;
  let totalFailures = 0;
  const allMapboxDeltas: number[] = [];
  const allHereDeltas: number[] = [];

  for (const comp of comparisons) {
    switch (comp.winner) {
      case 'mapbox':
        totalMapboxWins++;
        break;
      case 'here':
        totalHereWins++;
        break;
      case 'tie':
        totalTies++;
        break;
      default:
        totalFailures++;
    }

    if (comp.distances.mapbox_census !== null) {
      allMapboxDeltas.push(comp.distances.mapbox_census);
    }
    if (comp.distances.here_census !== null) {
      allHereDeltas.push(comp.distances.here_census);
    }
  }

  const avgMapboxDelta =
    allMapboxDeltas.length > 0
      ? allMapboxDeltas.reduce((a, b) => a + b, 0) / allMapboxDeltas.length
      : 0;

  const avgHereDelta =
    allHereDeltas.length > 0
      ? allHereDeltas.reduce((a, b) => a + b, 0) / allHereDeltas.length
      : 0;

  // Determine recommendation
  let recommendation: string;
  if (totalMapboxWins > totalHereWins && avgMapboxDelta < avgHereDelta) {
    recommendation = 'MAPBOX - Better accuracy and win rate';
  } else if (totalHereWins > totalMapboxWins && avgHereDelta < avgMapboxDelta) {
    recommendation = 'HERE - Better accuracy and win rate';
  } else if (totalMapboxWins > totalHereWins) {
    recommendation = 'MAPBOX - Higher win rate';
  } else if (totalHereWins > totalMapboxWins) {
    recommendation = 'HERE - Higher win rate';
  } else if (avgMapboxDelta < avgHereDelta) {
    recommendation = 'MAPBOX - Lower average delta';
  } else if (avgHereDelta < avgMapboxDelta) {
    recommendation = 'HERE - Lower average delta';
  } else {
    recommendation = 'TIE - Consider other factors (pricing, existing integration)';
  }

  // Build results object
  const results: ExtendedResults = {
    timestamp: new Date().toISOString(),
    config: {
      selectedCategory,
      totalAddresses: addressesToTest.length,
      mapboxToken: MAPBOX_TOKEN.slice(0, 10) + '...',
      hereKey: HERE_API_KEY.slice(0, 10) + '...',
    },
    categoryStats,
    overallStats: {
      mapboxWins: totalMapboxWins,
      hereWins: totalHereWins,
      ties: totalTies,
      failures: totalFailures,
      avgMapboxDelta,
      avgHereDelta,
      recommendation,
    },
    details,
  };

  // Output
  if (jsonOnly) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    log('\n' + '='.repeat(70));
    log(' RESULTS SUMMARY');
    log('='.repeat(70));

    log('\n📊 BY CATEGORY:');
    for (const stat of categoryStats) {
      log(`\n  ${stat.category.toUpperCase()} (${stat.total} addresses)`);
      log(`    Mapbox wins: ${stat.mapboxWins} | HERE wins: ${stat.hereWins} | Ties: ${stat.ties}`);
      log(`    Avg Mapbox delta: ${formatDistance(stat.avgMapboxDelta)}`);
      log(`    Avg HERE delta:   ${formatDistance(stat.avgHereDelta)}`);
    }

    log('\n📈 OVERALL:');
    log(`  Total tested: ${addressesToTest.length}`);
    log(`  Mapbox wins:  ${totalMapboxWins} (${((totalMapboxWins / comparisons.length) * 100).toFixed(1)}%)`);
    log(`  HERE wins:    ${totalHereWins} (${((totalHereWins / comparisons.length) * 100).toFixed(1)}%)`);
    log(`  Ties:         ${totalTies}`);
    log(`  Failures:     ${totalFailures}`);
    log(`  Avg Mapbox delta from Census: ${formatDistance(avgMapboxDelta)}`);
    log(`  Avg HERE delta from Census:   ${formatDistance(avgHereDelta)}`);

    log('\n' + '='.repeat(70));
    log(` RECOMMENDATION: ${recommendation}`);
    log('='.repeat(70));

    log('\nTip: Run with --json flag to get machine-readable output');
    log('Example: npx ts-node scripts/geocode-accuracy-extended.ts --json > results.json\n');
  }
}

main().catch((error) => {
  logError(`\n❌ FATAL ERROR: ${error}`);
  process.exit(1);
});
