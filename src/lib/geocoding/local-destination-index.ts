import type { GeocodingResult } from "@/lib/geocoding-cache";

type LocalDestinationType = "place" | "region" | "neighborhood";

interface LocalDestinationRecord {
  id: string;
  name: string;
  state?: string;
  stateName?: string;
  type: LocalDestinationType;
  center: [number, number];
  aliases?: string[];
}

const STATE_DESTINATIONS: LocalDestinationRecord[] = [
  ["AL", "Alabama", -86.9023, 32.3182],
  ["AK", "Alaska", -152.4044, 64.2008],
  ["AZ", "Arizona", -111.0937, 34.0489],
  ["AR", "Arkansas", -92.3731, 34.9697],
  ["CA", "California", -119.4179, 36.7783],
  ["CO", "Colorado", -105.7821, 39.5501],
  ["CT", "Connecticut", -72.7554, 41.6032],
  ["DE", "Delaware", -75.5277, 38.9108],
  ["FL", "Florida", -81.5158, 27.6648],
  ["GA", "Georgia", -82.9001, 32.1656],
  ["HI", "Hawaii", -155.5828, 19.8968],
  ["ID", "Idaho", -114.742, 44.0682],
  ["IL", "Illinois", -89.3985, 40.6331],
  ["IN", "Indiana", -86.1349, 40.2672],
  ["IA", "Iowa", -93.0977, 41.878],
  ["KS", "Kansas", -98.4842, 39.0119],
  ["KY", "Kentucky", -84.27, 37.8393],
  ["LA", "Louisiana", -91.9623, 30.9843],
  ["ME", "Maine", -69.4455, 45.2538],
  ["MD", "Maryland", -76.6413, 39.0458],
  ["MA", "Massachusetts", -71.3824, 42.4072],
  ["MI", "Michigan", -85.6024, 44.3148],
  ["MN", "Minnesota", -94.6859, 46.7296],
  ["MS", "Mississippi", -89.3985, 32.3547],
  ["MO", "Missouri", -91.8318, 37.9643],
  ["MT", "Montana", -110.3626, 46.8797],
  ["NE", "Nebraska", -99.9018, 41.4925],
  ["NV", "Nevada", -116.4194, 38.8026],
  ["NH", "New Hampshire", -71.5724, 43.1939],
  ["NJ", "New Jersey", -74.4057, 40.0583],
  ["NM", "New Mexico", -105.8701, 34.5199],
  ["NY", "New York", -74.2179, 43.2994],
  ["NC", "North Carolina", -79.0193, 35.7596],
  ["ND", "North Dakota", -101.002, 47.5515],
  ["OH", "Ohio", -82.9071, 40.4173],
  ["OK", "Oklahoma", -97.0929, 35.0078],
  ["OR", "Oregon", -120.5542, 43.8041],
  ["PA", "Pennsylvania", -77.1945, 41.2033],
  ["RI", "Rhode Island", -71.4774, 41.5801],
  ["SC", "South Carolina", -81.1637, 33.8361],
  ["SD", "South Dakota", -99.9018, 43.9695],
  ["TN", "Tennessee", -86.5804, 35.5175],
  ["TX", "Texas", -99.9018, 31.9686],
  ["UT", "Utah", -111.0937, 39.321],
  ["VT", "Vermont", -72.5778, 44.5588],
  ["VA", "Virginia", -78.6569, 37.4316],
  ["WA", "Washington", -120.7401, 47.7511],
  ["WV", "West Virginia", -80.4549, 38.5976],
  ["WI", "Wisconsin", -89.6165, 43.7844],
  ["WY", "Wyoming", -107.2903, 43.076],
  ["DC", "District of Columbia", -77.0369, 38.9072],
].map(([state, name, lng, lat]) => ({
  id: `region:${state.toString().toLowerCase()}`,
  name: name.toString(),
  state: state.toString(),
  type: "region" as const,
  center: [lng as number, lat as number],
  aliases: [state.toString()],
}));

const CITY_DESTINATIONS: LocalDestinationRecord[] = [
  ["irving-tx", "Irving", "TX", "Texas", -96.9489, 32.814],
  ["dallas-tx", "Dallas", "TX", "Texas", -96.797, 32.7767],
  ["fort-worth-tx", "Fort Worth", "TX", "Texas", -97.3308, 32.7555],
  ["arlington-tx", "Arlington", "TX", "Texas", -97.1081, 32.7357],
  ["plano-tx", "Plano", "TX", "Texas", -96.6989, 33.0198],
  ["frisco-tx", "Frisco", "TX", "Texas", -96.8236, 33.1507],
  ["garland-tx", "Garland", "TX", "Texas", -96.6389, 32.9126],
  ["mckinney-tx", "McKinney", "TX", "Texas", -96.6398, 33.1972],
  ["denton-tx", "Denton", "TX", "Texas", -97.1331, 33.2148],
  ["austin-tx", "Austin", "TX", "Texas", -97.7431, 30.2672],
  ["houston-tx", "Houston", "TX", "Texas", -95.3698, 29.7604],
  ["san-antonio-tx", "San Antonio", "TX", "Texas", -98.4936, 29.4241],
  ["el-paso-tx", "El Paso", "TX", "Texas", -106.485, 31.7619],
  ["waco-tx", "Waco", "TX", "Texas", -97.1467, 31.5493],
  ["college-station-tx", "College Station", "TX", "Texas", -96.3344, 30.6279],
  ["new-york-ny", "New York", "NY", "New York", -74.006, 40.7128],
  ["brooklyn-ny", "Brooklyn", "NY", "New York", -73.9442, 40.6782],
  ["queens-ny", "Queens", "NY", "New York", -73.7949, 40.7282],
  ["los-angeles-ca", "Los Angeles", "CA", "California", -118.2437, 34.0522],
  ["san-diego-ca", "San Diego", "CA", "California", -117.1611, 32.7157],
  ["san-jose-ca", "San Jose", "CA", "California", -121.8863, 37.3382],
  ["san-francisco-ca", "San Francisco", "CA", "California", -122.4194, 37.7749],
  ["sacramento-ca", "Sacramento", "CA", "California", -121.4944, 38.5816],
  ["oakland-ca", "Oakland", "CA", "California", -122.2711, 37.8044],
  ["fresno-ca", "Fresno", "CA", "California", -119.7871, 36.7378],
  ["chicago-il", "Chicago", "IL", "Illinois", -87.6298, 41.8781],
  ["phoenix-az", "Phoenix", "AZ", "Arizona", -112.074, 33.4484],
  ["tucson-az", "Tucson", "AZ", "Arizona", -110.9747, 32.2226],
  ["scottsdale-az", "Scottsdale", "AZ", "Arizona", -111.9261, 33.4942],
  ["philadelphia-pa", "Philadelphia", "PA", "Pennsylvania", -75.1652, 39.9526],
  ["pittsburgh-pa", "Pittsburgh", "PA", "Pennsylvania", -79.9959, 40.4406],
  [
    "washington-dc",
    "Washington",
    "DC",
    "District of Columbia",
    -77.0369,
    38.9072,
  ],
  ["boston-ma", "Boston", "MA", "Massachusetts", -71.0589, 42.3601],
  ["seattle-wa", "Seattle", "WA", "Washington", -122.3321, 47.6062],
  ["spokane-wa", "Spokane", "WA", "Washington", -117.426, 47.6588],
  ["denver-co", "Denver", "CO", "Colorado", -104.9903, 39.7392],
  ["boulder-co", "Boulder", "CO", "Colorado", -105.2705, 40.015],
  ["miami-fl", "Miami", "FL", "Florida", -80.1918, 25.7617],
  ["orlando-fl", "Orlando", "FL", "Florida", -81.3792, 28.5383],
  ["tampa-fl", "Tampa", "FL", "Florida", -82.4572, 27.9506],
  ["jacksonville-fl", "Jacksonville", "FL", "Florida", -81.6557, 30.3322],
  ["atlanta-ga", "Atlanta", "GA", "Georgia", -84.388, 33.749],
  ["savannah-ga", "Savannah", "GA", "Georgia", -81.0912, 32.0809],
  ["charlotte-nc", "Charlotte", "NC", "North Carolina", -80.8431, 35.2271],
  ["raleigh-nc", "Raleigh", "NC", "North Carolina", -78.6382, 35.7796],
  ["durham-nc", "Durham", "NC", "North Carolina", -78.8986, 35.994],
  ["nashville-tn", "Nashville", "TN", "Tennessee", -86.7816, 36.1627],
  ["memphis-tn", "Memphis", "TN", "Tennessee", -90.049, 35.1495],
  ["portland-or", "Portland", "OR", "Oregon", -122.6765, 45.5152],
  ["las-vegas-nv", "Las Vegas", "NV", "Nevada", -115.1398, 36.1699],
  ["reno-nv", "Reno", "NV", "Nevada", -119.8138, 39.5296],
  ["salt-lake-city-ut", "Salt Lake City", "UT", "Utah", -111.891, 40.7608],
  ["provo-ut", "Provo", "UT", "Utah", -111.6585, 40.2338],
  ["minneapolis-mn", "Minneapolis", "MN", "Minnesota", -93.265, 44.9778],
  ["saint-paul-mn", "Saint Paul", "MN", "Minnesota", -93.09, 44.9537],
  ["detroit-mi", "Detroit", "MI", "Michigan", -83.0458, 42.3314],
  ["ann-arbor-mi", "Ann Arbor", "MI", "Michigan", -83.743, 42.2808],
  ["columbus-oh", "Columbus", "OH", "Ohio", -82.9988, 39.9612],
  ["cleveland-oh", "Cleveland", "OH", "Ohio", -81.6944, 41.4993],
  ["cincinnati-oh", "Cincinnati", "OH", "Ohio", -84.512, 39.1031],
  ["indianapolis-in", "Indianapolis", "IN", "Indiana", -86.1581, 39.7684],
  ["milwaukee-wi", "Milwaukee", "WI", "Wisconsin", -87.9065, 43.0389],
  ["madison-wi", "Madison", "WI", "Wisconsin", -89.4012, 43.0731],
  ["saint-louis-mo", "Saint Louis", "MO", "Missouri", -90.1994, 38.627],
  ["kansas-city-mo", "Kansas City", "MO", "Missouri", -94.5786, 39.0997],
  ["omaha-ne", "Omaha", "NE", "Nebraska", -95.9345, 41.2565],
  ["boise-id", "Boise", "ID", "Idaho", -116.2023, 43.615],
  ["albuquerque-nm", "Albuquerque", "NM", "New Mexico", -106.6504, 35.0844],
  ["oklahoma-city-ok", "Oklahoma City", "OK", "Oklahoma", -97.5164, 35.4676],
  ["tulsa-ok", "Tulsa", "OK", "Oklahoma", -95.9928, 36.154],
  ["new-orleans-la", "New Orleans", "LA", "Louisiana", -90.0715, 29.9511],
  ["baltimore-md", "Baltimore", "MD", "Maryland", -76.6122, 39.2904],
  ["richmond-va", "Richmond", "VA", "Virginia", -77.436, 37.5407],
  ["virginia-beach-va", "Virginia Beach", "VA", "Virginia", -75.978, 36.8529],
  ["newark-nj", "Newark", "NJ", "New Jersey", -74.1724, 40.7357],
  ["jersey-city-nj", "Jersey City", "NJ", "New Jersey", -74.0431, 40.7178],
  ["hoboken-nj", "Hoboken", "NJ", "New Jersey", -74.0324, 40.7433],
  ["hartford-ct", "Hartford", "CT", "Connecticut", -72.6851, 41.7637],
  ["new-haven-ct", "New Haven", "CT", "Connecticut", -72.9279, 41.3083],
  ["providence-ri", "Providence", "RI", "Rhode Island", -71.4128, 41.824],
  ["honolulu-hi", "Honolulu", "HI", "Hawaii", -157.8583, 21.3069],
  ["anchorage-ak", "Anchorage", "AK", "Alaska", -149.9003, 61.2181],
].map(([id, name, state, stateName, lng, lat]) => ({
  id: `place:${id}`,
  name: name.toString(),
  state: state.toString(),
  stateName: stateName.toString(),
  type: "place" as const,
  center: [lng as number, lat as number],
}));

const NEIGHBORHOOD_DESTINATIONS: LocalDestinationRecord[] = [
  ["las-colinas-irving-tx", "Las Colinas", "TX", "Irving", -96.9508, 32.8959],
  ["valley-ranch-irving-tx", "Valley Ranch", "TX", "Irving", -96.9586, 32.9274],
  ["downtown-dallas-tx", "Downtown Dallas", "TX", "Dallas", -96.7992, 32.7767],
  ["uptown-dallas-tx", "Uptown Dallas", "TX", "Dallas", -96.8029, 32.8013],
  ["deep-ellum-dallas-tx", "Deep Ellum", "TX", "Dallas", -96.7845, 32.784],
  [
    "south-congress-austin-tx",
    "South Congress",
    "TX",
    "Austin",
    -97.7501,
    30.2502,
  ],
  [
    "williamsburg-brooklyn-ny",
    "Williamsburg",
    "NY",
    "Brooklyn",
    -73.9566,
    40.7081,
  ],
  [
    "capitol-hill-seattle-wa",
    "Capitol Hill",
    "WA",
    "Seattle",
    -122.3193,
    47.6233,
  ],
  [
    "silver-lake-los-angeles-ca",
    "Silver Lake",
    "CA",
    "Los Angeles",
    -118.2702,
    34.0867,
  ],
  [
    "mission-district-san-francisco-ca",
    "Mission District",
    "CA",
    "San Francisco",
    -122.4194,
    37.7599,
  ],
].map(([id, name, state, city, lng, lat]) => ({
  id: `neighborhood:${id}`,
  name: name.toString(),
  state: state.toString(),
  aliases: [`${name} ${city}`, `${name}, ${city}`],
  type: "neighborhood" as const,
  center: [lng as number, lat as number],
}));

const DESTINATIONS = [
  ...CITY_DESTINATIONS,
  ...NEIGHBORHOOD_DESTINATIONS,
  ...STATE_DESTINATIONS,
];

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function labelFor(record: LocalDestinationRecord): string {
  if (record.type === "region") {
    return record.name;
  }
  return record.state ? `${record.name}, ${record.state}` : record.name;
}

function secondaryFor(record: LocalDestinationRecord): string {
  if (record.type === "region") {
    return "United States";
  }
  return [record.stateName ?? record.state, "United States"]
    .filter(Boolean)
    .join(", ");
}

function bboxFor(
  record: LocalDestinationRecord
): [number, number, number, number] {
  const [lng, lat] = record.center;
  const delta =
    record.type === "region" ? 2 : record.type === "place" ? 0.18 : 0.04;
  return [
    Number((lng - delta).toFixed(4)),
    Number((lat - delta).toFixed(4)),
    Number((lng + delta).toFixed(4)),
    Number((lat + delta).toFixed(4)),
  ];
}

function scoreDestination(
  record: LocalDestinationRecord,
  query: string
): number {
  const label = normalize(labelFor(record));
  const name = normalize(record.name);
  const state = normalize(record.state ?? "");
  const aliases = (record.aliases ?? []).map(normalize);
  const haystacks = [label, name, state, ...aliases].filter(Boolean);
  const queryTokens = normalize(query).split(" ").filter(Boolean);

  if (queryTokens.length === 0) {
    return 0;
  }

  let score = 0;
  if (haystacks.some((value) => value === query)) score += 120;
  if (name === query) score += 100;
  if (haystacks.some((value) => value.startsWith(query))) score += 70;
  if (haystacks.some((value) => value.includes(query))) score += 35;
  if (
    queryTokens.every((token) =>
      haystacks.some((value) =>
        value.split(" ").some((part) => part.startsWith(token))
      )
    )
  ) {
    score += 45;
  }
  if (record.type === "place") score += 8;
  if (record.type === "neighborhood") score += 6;
  return score;
}

export function searchLocalDestinationIndex(
  query: string,
  options: { limit: number }
): GeocodingResult[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) {
    return [];
  }

  return DESTINATIONS.map((record, index) => ({
    record,
    index,
    score: scoreDestination(record, normalizedQuery),
  }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.index - right.index;
    })
    .slice(0, options.limit)
    .map(({ record }) => ({
      id: `local:${record.id}`,
      provider: "local",
      place_name: labelFor(record),
      center: record.center,
      bbox: bboxFor(record),
      place_type: [record.type],
      requires_resolution: false,
      primary_text: record.name,
      secondary_text: secondaryFor(record),
    }));
}
