#!/usr/bin/env npx ts-node
/**
 * Geocoding Accuracy Comparison: Mapbox vs HERE
 *
 * This script compares geocoding and POI search accuracy between:
 * - Mapbox Geocoding v6 / Search Box API
 * - HERE Geocoding / Discover API
 * - US Census Geocoder (reference baseline)
 *
 * Usage:
 *   npx ts-node scripts/geocode-accuracy-check.ts
 *
 * Required environment variables:
 *   NEXT_PUBLIC_MAPBOX_TOKEN - Mapbox access token
 *   HERE_API_KEY            - HERE API key
 *
 * @see https://docs.mapbox.com/api/search/geocoding/
 * @see https://developer.here.com/documentation/geocoding-search-api/
 * @see https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env') });

import {
  geocodeMapbox,
  geocodeMapboxV5,
  geocodeHere,
  geocodeCensus,
  searchMapboxPOIs,
  searchHereDiscover,
  compareGeocodeResults,
  comparePOIResults,
  type GeocodeComparison,
  type POIComparison,
} from './lib/geocoding-providers';
import { formatDistance } from './lib/haversine';

// ============================================================================
// Configuration
// ============================================================================

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_ACCESS_TOKEN;
const HERE_API_KEY = process.env.HERE_API_KEY;

// Test addresses - diverse US locations
const TEST_ADDRESSES = [
  // Texas (primary use case for Roomshare)
  '1121 Hidden Ridge, Irving, TX 75038',
  '2550 N Beltline Rd, Irving, TX 75062',
  '4200 W Airport Fwy, Irving, TX 75062',
  '1999 Bryan St, Dallas, TX 75201',

  // California
  '1 Infinite Loop, Cupertino, CA 95014',
  '1600 Amphitheatre Parkway, Mountain View, CA 94043',

  // New York
  '350 5th Ave, New York, NY 10118', // Empire State Building

  // Edge cases
  '123 Main St, Springfield, IL 62701', // Common street name
  '100 Universal City Plaza, Universal City, CA 91608', // Entertainment complex
];

// POI keywords to test (relevant for Roomshare listings)
const POI_KEYWORDS = [
  'indian grocery',
  'indian store',
  'asian grocery',
  'gas station',
  'gym',
  'grocery store',
  'coffee',
  'restaurant',
  'pharmacy',
  'park',
  'laundromat',
  'transit station',
];

// ============================================================================
// Report Generation
// ============================================================================

function printHeader(title: string) {
  console.log('\n' + '='.repeat(70));
  console.log(` ${title}`);
  console.log('='.repeat(70));
}

function printSubheader(title: string) {
  console.log('\n' + '-'.repeat(50));
  console.log(` ${title}`);
  console.log('-'.repeat(50));
}

function printGeocodeComparison(comparison: GeocodeComparison) {
  console.log(`\nAddress: ${comparison.address}`);

  if (comparison.mapbox) {
    console.log(`  Mapbox v6:   ${comparison.mapbox.lat.toFixed(6)}, ${comparison.mapbox.lon.toFixed(6)}`);
    console.log(`               "${comparison.mapbox.formatted}"`);
    if (comparison.mapbox.matchQuality) {
      console.log(`               Match quality: ${comparison.mapbox.matchQuality}`);
    }
  } else {
    console.log('  Mapbox v6:   NO RESULT');
  }

  if (comparison.mapboxV5) {
    console.log(`  Mapbox v5:   ${comparison.mapboxV5.lat.toFixed(6)}, ${comparison.mapboxV5.lon.toFixed(6)}`);
    console.log(`               "${comparison.mapboxV5.formatted}"`);
  }

  if (comparison.here) {
    console.log(`  HERE:        ${comparison.here.lat.toFixed(6)}, ${comparison.here.lon.toFixed(6)}`);
    console.log(`               "${comparison.here.formatted}"`);
    if (comparison.here.matchQuality) {
      console.log(`               Match quality: ${comparison.here.matchQuality}`);
    }
  } else {
    console.log('  HERE:        NO RESULT');
  }

  if (comparison.census) {
    console.log(`  Census:      ${comparison.census.lat.toFixed(6)}, ${comparison.census.lon.toFixed(6)}`);
    console.log(`               "${comparison.census.formatted}"`);
  } else {
    console.log('  Census:      NO RESULT');
  }

  console.log('\n  Distance Deltas (to Census baseline):');
  if (comparison.distances.mapbox_census !== null) {
    console.log(`    Mapbox v6 -> Census: ${formatDistance(comparison.distances.mapbox_census)} (${comparison.distances.mapbox_census.toFixed(2)}m)`);
  }
  if (comparison.distances.mapboxV5_census !== null) {
    console.log(`    Mapbox v5 -> Census: ${formatDistance(comparison.distances.mapboxV5_census)} (${comparison.distances.mapboxV5_census.toFixed(2)}m)`);
  }
  if (comparison.distances.here_census !== null) {
    console.log(`    HERE      -> Census: ${formatDistance(comparison.distances.here_census)} (${comparison.distances.here_census.toFixed(2)}m)`);
  }
  if (comparison.distances.mapbox_here !== null) {
    console.log(`    Mapbox v6 <-> HERE:  ${formatDistance(comparison.distances.mapbox_here)} (${comparison.distances.mapbox_here.toFixed(2)}m)`);
  }

  const winnerEmoji = {
    mapbox: '🟢 Mapbox',
    here: '🔵 HERE',
    tie: '🟡 Tie',
    unknown: '⚪ Unknown',
  };
  console.log(`\n  Winner (closer to Census): ${winnerEmoji[comparison.winner]}`);
}

function printPOIComparison(comparison: POIComparison) {
  console.log(`\nQuery: "${comparison.query}"`);
  console.log(`Center: ${comparison.centerLat.toFixed(6)}, ${comparison.centerLon.toFixed(6)}`);

  console.log('\n  Mapbox Search Box Results:');
  if (comparison.mapbox.length === 0) {
    console.log('    (no results)');
  } else {
    comparison.mapbox.slice(0, 5).forEach((r, i) => {
      console.log(
        `    ${i + 1}. ${r.name}`
      );
      console.log(
        `       ${formatDistance(r.distance_m)} | ${r.address || 'No address'}`
      );
    });
  }

  console.log('\n  HERE Discover Results:');
  if (comparison.here.length === 0) {
    console.log('    (no results)');
  } else {
    comparison.here.slice(0, 5).forEach((r, i) => {
      console.log(
        `    ${i + 1}. ${r.name}`
      );
      console.log(
        `       ${formatDistance(r.distance_m)} | ${r.address || 'No address'}`
      );
    });
  }

  console.log('\n  Analysis:');
  console.log(`    Mapbox result count: ${comparison.analysis.mapboxCount}`);
  console.log(`    HERE result count:   ${comparison.analysis.hereCount}`);
  console.log(`    Mapbox relevance score: ${comparison.analysis.relevanceScore.mapbox.toFixed(1)}/30`);
  console.log(`    HERE relevance score:   ${comparison.analysis.relevanceScore.here.toFixed(1)}/30`);

  const winner =
    comparison.analysis.relevanceScore.mapbox > comparison.analysis.relevanceScore.here
      ? '🟢 Mapbox'
      : comparison.analysis.relevanceScore.mapbox < comparison.analysis.relevanceScore.here
        ? '🔵 HERE'
        : '🟡 Tie';
  console.log(`    Winner: ${winner}`);
}

interface SummaryStats {
  geocode: {
    mapboxWins: number;
    hereWins: number;
    ties: number;
    unknown: number;
    avgMapboxDelta: number;
    avgHereDelta: number;
  };
  poi: {
    mapboxWins: number;
    hereWins: number;
    ties: number;
    avgMapboxScore: number;
    avgHereScore: number;
  };
}

function printSummary(
  geocodeResults: GeocodeComparison[],
  poiResults: POIComparison[]
): SummaryStats {
  const stats: SummaryStats = {
    geocode: {
      mapboxWins: 0,
      hereWins: 0,
      ties: 0,
      unknown: 0,
      avgMapboxDelta: 0,
      avgHereDelta: 0,
    },
    poi: {
      mapboxWins: 0,
      hereWins: 0,
      ties: 0,
      avgMapboxScore: 0,
      avgHereScore: 0,
    },
  };

  // Geocoding stats
  const mapboxDeltas: number[] = [];
  const hereDeltas: number[] = [];

  for (const result of geocodeResults) {
    switch (result.winner) {
      case 'mapbox':
        stats.geocode.mapboxWins++;
        break;
      case 'here':
        stats.geocode.hereWins++;
        break;
      case 'tie':
        stats.geocode.ties++;
        break;
      default:
        stats.geocode.unknown++;
    }

    if (result.distances.mapbox_census !== null) {
      mapboxDeltas.push(result.distances.mapbox_census);
    }
    if (result.distances.here_census !== null) {
      hereDeltas.push(result.distances.here_census);
    }
  }

  if (mapboxDeltas.length > 0) {
    stats.geocode.avgMapboxDelta =
      mapboxDeltas.reduce((a, b) => a + b, 0) / mapboxDeltas.length;
  }
  if (hereDeltas.length > 0) {
    stats.geocode.avgHereDelta =
      hereDeltas.reduce((a, b) => a + b, 0) / hereDeltas.length;
  }

  // POI stats
  let totalMapboxScore = 0;
  let totalHereScore = 0;

  for (const result of poiResults) {
    totalMapboxScore += result.analysis.relevanceScore.mapbox;
    totalHereScore += result.analysis.relevanceScore.here;

    if (result.analysis.relevanceScore.mapbox > result.analysis.relevanceScore.here) {
      stats.poi.mapboxWins++;
    } else if (result.analysis.relevanceScore.mapbox < result.analysis.relevanceScore.here) {
      stats.poi.hereWins++;
    } else {
      stats.poi.ties++;
    }
  }

  if (poiResults.length > 0) {
    stats.poi.avgMapboxScore = totalMapboxScore / poiResults.length;
    stats.poi.avgHereScore = totalHereScore / poiResults.length;
  }

  printHeader('SUMMARY');

  console.log('\n📍 GEOCODING ACCURACY (vs Census baseline)');
  console.log(`   Mapbox wins:  ${stats.geocode.mapboxWins}`);
  console.log(`   HERE wins:    ${stats.geocode.hereWins}`);
  console.log(`   Ties:         ${stats.geocode.ties}`);
  console.log(`   Unknown:      ${stats.geocode.unknown}`);
  console.log(`   Avg Mapbox delta from Census: ${formatDistance(stats.geocode.avgMapboxDelta)}`);
  console.log(`   Avg HERE delta from Census:   ${formatDistance(stats.geocode.avgHereDelta)}`);

  const geocodeWinner =
    stats.geocode.mapboxWins > stats.geocode.hereWins
      ? '🟢 MAPBOX'
      : stats.geocode.mapboxWins < stats.geocode.hereWins
        ? '🔵 HERE'
        : '🟡 TIE';
  console.log(`\n   GEOCODING WINNER: ${geocodeWinner}`);

  console.log('\n🏪 POI SEARCH QUALITY');
  console.log(`   Mapbox wins:  ${stats.poi.mapboxWins}`);
  console.log(`   HERE wins:    ${stats.poi.hereWins}`);
  console.log(`   Ties:         ${stats.poi.ties}`);
  console.log(`   Avg Mapbox relevance score: ${stats.poi.avgMapboxScore.toFixed(1)}/30`);
  console.log(`   Avg HERE relevance score:   ${stats.poi.avgHereScore.toFixed(1)}/30`);

  const poiWinner =
    stats.poi.mapboxWins > stats.poi.hereWins
      ? '🟢 MAPBOX'
      : stats.poi.mapboxWins < stats.poi.hereWins
        ? '🔵 HERE'
        : '🟡 TIE';
  console.log(`\n   POI SEARCH WINNER: ${poiWinner}`);

  // Overall recommendation
  console.log('\n' + '='.repeat(70));
  console.log(' RECOMMENDATION');
  console.log('='.repeat(70));

  const mapboxTotal = stats.geocode.mapboxWins + stats.poi.mapboxWins;
  const hereTotal = stats.geocode.hereWins + stats.poi.hereWins;

  if (mapboxTotal > hereTotal) {
    console.log(`
  🟢 MAPBOX is recommended for Roomshare

  Reasons:
  - Better geocoding accuracy in ${stats.geocode.mapboxWins}/${geocodeResults.length} address tests
  - Better POI search relevance in ${stats.poi.mapboxWins}/${poiResults.length} keyword tests
  - Average geocoding delta from Census: ${formatDistance(stats.geocode.avgMapboxDelta)}
  - Already integrated in codebase
`);
  } else if (hereTotal > mapboxTotal) {
    console.log(`
  🔵 HERE is recommended for Roomshare

  Reasons:
  - Better geocoding accuracy in ${stats.geocode.hereWins}/${geocodeResults.length} address tests
  - Better POI search relevance in ${stats.poi.hereWins}/${poiResults.length} keyword tests
  - Average geocoding delta from Census: ${formatDistance(stats.geocode.avgHereDelta)}

  Action: Consider migrating from Mapbox to HERE API
`);
  } else {
    console.log(`
  🟡 BOTH PROVIDERS ARE COMPARABLE

  Mapbox advantages:
  - Already integrated in codebase
  - Good Map rendering support

  HERE advantages:
  - May have better coverage for specific use cases

  Recommendation: Stay with Mapbox due to existing integration
`);
  }

  return stats;
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  console.log('\n🗺️  Geocoding Accuracy Comparison: Mapbox vs HERE');
  console.log('   Using US Census Geocoder as independent baseline\n');

  // Validate environment
  if (!MAPBOX_TOKEN) {
    console.error('❌ ERROR: Missing NEXT_PUBLIC_MAPBOX_TOKEN or MAPBOX_ACCESS_TOKEN');
    console.error('   Set this environment variable and try again.');
    process.exit(1);
  }

  if (!HERE_API_KEY) {
    console.error('❌ ERROR: Missing HERE_API_KEY');
    console.error('   Get a free API key from: https://developer.here.com/');
    console.error('   Add to .env: HERE_API_KEY=your-api-key');
    process.exit(1);
  }

  console.log('✓ Environment variables validated');
  console.log(`  Mapbox token: ${MAPBOX_TOKEN.slice(0, 10)}...`);
  console.log(`  HERE API key: ${HERE_API_KEY.slice(0, 10)}...`);

  // -------------------------------------------------------------------------
  // Part 1: Geocoding Accuracy
  // -------------------------------------------------------------------------

  printHeader('GEOCODING ACCURACY TEST');
  console.log(`Testing ${TEST_ADDRESSES.length} addresses...`);

  const geocodeResults: GeocodeComparison[] = [];

  for (const address of TEST_ADDRESSES) {
    try {
      const [mapbox, mapboxV5, here, census] = await Promise.all([
        geocodeMapbox(address, MAPBOX_TOKEN).catch((e) => {
          console.error(`  Mapbox v6 error for "${address}": ${e.message}`);
          return null;
        }),
        geocodeMapboxV5(address, MAPBOX_TOKEN).catch((e) => {
          console.error(`  Mapbox v5 error for "${address}": ${e.message}`);
          return null;
        }),
        geocodeHere(address, HERE_API_KEY).catch((e) => {
          console.error(`  HERE error for "${address}": ${e.message}`);
          return null;
        }),
        geocodeCensus(address).catch((e) => {
          console.error(`  Census error for "${address}": ${e.message}`);
          return null;
        }),
      ]);

      const comparison = compareGeocodeResults(address, mapbox, mapboxV5, here, census);
      geocodeResults.push(comparison);
      printGeocodeComparison(comparison);
    } catch (error) {
      console.error(`  Error processing "${address}": ${error}`);
    }
  }

  // -------------------------------------------------------------------------
  // Part 2: POI Search Quality
  // -------------------------------------------------------------------------

  printHeader('POI SEARCH QUALITY TEST');

  // Use the first address as the center point for POI searches
  const primaryAddress = TEST_ADDRESSES[0];
  const primaryGeocode = geocodeResults[0];

  if (!primaryGeocode?.census) {
    console.error('❌ Could not get center coordinates for POI search test');
    process.exit(1);
  }

  const centerLat = primaryGeocode.census.lat;
  const centerLon = primaryGeocode.census.lon;

  console.log(`\nSearching POIs around: ${primaryAddress}`);
  console.log(`Center coordinates (Census): ${centerLat.toFixed(6)}, ${centerLon.toFixed(6)}`);
  console.log(`Testing ${POI_KEYWORDS.length} keywords...`);

  const poiResults: POIComparison[] = [];

  for (const query of POI_KEYWORDS) {
    printSubheader(`Query: "${query}"`);

    try {
      const [mapboxPois, herePois] = await Promise.all([
        searchMapboxPOIs(query, centerLat, centerLon, MAPBOX_TOKEN, 10).catch(
          (e) => {
            console.error(`  Mapbox POI error: ${e.message}`);
            return [];
          }
        ),
        searchHereDiscover(query, centerLat, centerLon, HERE_API_KEY, 10).catch(
          (e) => {
            console.error(`  HERE POI error: ${e.message}`);
            return [];
          }
        ),
      ]);

      const comparison = comparePOIResults(
        query,
        centerLat,
        centerLon,
        mapboxPois,
        herePois
      );
      poiResults.push(comparison);
      printPOIComparison(comparison);
    } catch (error) {
      console.error(`  Error processing query "${query}": ${error}`);
    }

    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------

  const stats = printSummary(geocodeResults, poiResults);

  // Output JSON for programmatic analysis
  console.log('\n' + '='.repeat(70));
  console.log(' RAW DATA (JSON)');
  console.log('='.repeat(70));

  const jsonOutput = {
    timestamp: new Date().toISOString(),
    config: {
      testAddresses: TEST_ADDRESSES.length,
      poiKeywords: POI_KEYWORDS.length,
      centerAddress: primaryAddress,
    },
    summary: stats,
    geocodeResults: geocodeResults.map((r) => ({
      address: r.address,
      mapbox: r.mapbox
        ? { lat: r.mapbox.lat, lon: r.mapbox.lon, formatted: r.mapbox.formatted }
        : null,
      here: r.here
        ? { lat: r.here.lat, lon: r.here.lon, formatted: r.here.formatted }
        : null,
      census: r.census
        ? { lat: r.census.lat, lon: r.census.lon, formatted: r.census.formatted }
        : null,
      distances: r.distances,
      winner: r.winner,
    })),
    poiResults: poiResults.map((r) => ({
      query: r.query,
      mapboxCount: r.analysis.mapboxCount,
      hereCount: r.analysis.hereCount,
      mapboxScore: r.analysis.relevanceScore.mapbox,
      hereScore: r.analysis.relevanceScore.here,
      mapboxClosest: r.analysis.mapboxClosest
        ? {
            name: r.analysis.mapboxClosest.name,
            distance_m: r.analysis.mapboxClosest.distance_m,
          }
        : null,
      hereClosest: r.analysis.hereClosest
        ? {
            name: r.analysis.hereClosest.name,
            distance_m: r.analysis.hereClosest.distance_m,
          }
        : null,
    })),
  };

  console.log(JSON.stringify(jsonOutput, null, 2));

  console.log('\n✅ Accuracy check complete!');
}

main().catch((error) => {
  console.error('\n❌ FATAL ERROR:', error);
  process.exit(1);
});
