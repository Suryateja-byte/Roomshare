/**
 * US Locations Dataset - Local-first Location Search
 *
 * This dataset reduces Mapbox Geocoding API calls by providing
 * instant local search for common US locations.
 *
 * Data sources (public domain):
 * - US Census Bureau (cities, populations)
 * - Wikipedia (coordinates, neighborhoods)
 *
 * Note: This is OUR data, NOT from Mapbox API, so it's safe to cache indefinitely.
 * Mapbox ToS prohibits caching their geocoding results.
 */

export interface LocalLocation {
  id: string;
  name: string;
  searchTerms: string[]; // All searchable variations
  displayName: string; // "San Francisco, CA"
  type: "city" | "neighborhood" | "region" | "metro" | "state";
  center: [number, number]; // [lng, lat]
  bbox?: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  population?: number; // For ranking
  state: string;
}

// Top US cities by population + college towns + key neighborhoods
export const US_LOCATIONS: LocalLocation[] = [
  // Top 50 cities by population
  {
    id: "nyc",
    name: "New York City",
    searchTerms: ["new york", "nyc", "new york city", "manhattan", "ny"],
    displayName: "New York City, NY",
    type: "city",
    center: [-74.006, 40.7128],
    bbox: [-74.259, 40.4774, -73.7004, 40.9176],
    population: 8336817,
    state: "NY",
  },
  {
    id: "la",
    name: "Los Angeles",
    searchTerms: ["los angeles", "la", "l.a.", "los angeles ca"],
    displayName: "Los Angeles, CA",
    type: "city",
    center: [-118.2437, 34.0522],
    bbox: [-118.6682, 33.7037, -118.1553, 34.3373],
    population: 3979576,
    state: "CA",
  },
  {
    id: "chicago",
    name: "Chicago",
    searchTerms: ["chicago", "chi", "chicago il", "windy city"],
    displayName: "Chicago, IL",
    type: "city",
    center: [-87.6298, 41.8781],
    bbox: [-87.9401, 41.6445, -87.5241, 42.0231],
    population: 2693976,
    state: "IL",
  },
  {
    id: "houston",
    name: "Houston",
    searchTerms: ["houston", "houston tx", "houston texas"],
    displayName: "Houston, TX",
    type: "city",
    center: [-95.3698, 29.7604],
    bbox: [-95.7869, 29.5232, -95.0143, 30.1108],
    population: 2320268,
    state: "TX",
  },
  {
    id: "phoenix",
    name: "Phoenix",
    searchTerms: ["phoenix", "phoenix az", "phoenix arizona"],
    displayName: "Phoenix, AZ",
    type: "city",
    center: [-112.074, 33.4484],
    bbox: [-112.3241, 33.2902, -111.9259, 33.6881],
    population: 1680992,
    state: "AZ",
  },
  {
    id: "philadelphia",
    name: "Philadelphia",
    searchTerms: ["philadelphia", "philly", "philadelphia pa", "phila"],
    displayName: "Philadelphia, PA",
    type: "city",
    center: [-75.1652, 39.9526],
    bbox: [-75.2803, 39.8671, -74.9558, 40.1379],
    population: 1584064,
    state: "PA",
  },
  {
    id: "san-antonio",
    name: "San Antonio",
    searchTerms: ["san antonio", "san antonio tx", "san antonio texas"],
    displayName: "San Antonio, TX",
    type: "city",
    center: [-98.4936, 29.4241],
    bbox: [-98.7591, 29.2037, -98.2098, 29.7164],
    population: 1547253,
    state: "TX",
  },
  {
    id: "san-diego",
    name: "San Diego",
    searchTerms: ["san diego", "san diego ca", "san diego california", "sd"],
    displayName: "San Diego, CA",
    type: "city",
    center: [-117.1611, 32.7157],
    bbox: [-117.2821, 32.5345, -116.9053, 33.1141],
    population: 1423851,
    state: "CA",
  },
  {
    id: "dallas",
    name: "Dallas",
    searchTerms: ["dallas", "dallas tx", "dallas texas", "dfw"],
    displayName: "Dallas, TX",
    type: "city",
    center: [-96.797, 32.7767],
    bbox: [-96.9989, 32.6178, -96.5556, 33.0237],
    population: 1343573,
    state: "TX",
  },
  {
    id: "san-jose",
    name: "San Jose",
    searchTerms: ["san jose", "san jose ca", "san jose california"],
    displayName: "San Jose, CA",
    type: "city",
    center: [-121.8863, 37.3382],
    bbox: [-122.0468, 37.1248, -121.7328, 37.4691],
    population: 1021795,
    state: "CA",
  },
  {
    id: "austin",
    name: "Austin",
    searchTerms: ["austin", "austin tx", "austin texas", "atx"],
    displayName: "Austin, TX",
    type: "city",
    center: [-97.7431, 30.2672],
    bbox: [-97.9384, 30.0986, -97.5614, 30.5167],
    population: 978908,
    state: "TX",
  },
  {
    id: "jacksonville",
    name: "Jacksonville",
    searchTerms: [
      "jacksonville",
      "jacksonville fl",
      "jacksonville florida",
      "jax",
    ],
    displayName: "Jacksonville, FL",
    type: "city",
    center: [-81.6557, 30.3322],
    bbox: [-81.9164, 30.1034, -81.3917, 30.5869],
    population: 911507,
    state: "FL",
  },
  {
    id: "fort-worth",
    name: "Fort Worth",
    searchTerms: ["fort worth", "fort worth tx", "ft worth"],
    displayName: "Fort Worth, TX",
    type: "city",
    center: [-97.3308, 32.7555],
    bbox: [-97.5628, 32.5513, -97.0336, 32.9905],
    population: 909585,
    state: "TX",
  },
  {
    id: "columbus",
    name: "Columbus",
    searchTerms: ["columbus", "columbus oh", "columbus ohio"],
    displayName: "Columbus, OH",
    type: "city",
    center: [-82.9988, 39.9612],
    bbox: [-83.2092, 39.8086, -82.7713, 40.1572],
    population: 905748,
    state: "OH",
  },
  {
    id: "sf",
    name: "San Francisco",
    searchTerms: [
      "san francisco",
      "sf",
      "san fran",
      "san francisco ca",
      "frisco",
    ],
    displayName: "San Francisco, CA",
    type: "city",
    center: [-122.4194, 37.7749],
    bbox: [-122.5155, 37.7082, -122.357, 37.8324],
    population: 873965,
    state: "CA",
  },
  {
    id: "charlotte",
    name: "Charlotte",
    searchTerms: [
      "charlotte",
      "charlotte nc",
      "charlotte north carolina",
      "clt",
    ],
    displayName: "Charlotte, NC",
    type: "city",
    center: [-80.8431, 35.2271],
    bbox: [-81.0095, 35.0027, -80.6509, 35.4202],
    population: 872498,
    state: "NC",
  },
  {
    id: "indianapolis",
    name: "Indianapolis",
    searchTerms: ["indianapolis", "indianapolis in", "indy"],
    displayName: "Indianapolis, IN",
    type: "city",
    center: [-86.1581, 39.7684],
    bbox: [-86.3279, 39.6321, -85.9376, 39.9276],
    population: 867125,
    state: "IN",
  },
  {
    id: "seattle",
    name: "Seattle",
    searchTerms: ["seattle", "seattle wa", "seattle washington", "sea"],
    displayName: "Seattle, WA",
    type: "city",
    center: [-122.3321, 47.6062],
    bbox: [-122.436, 47.4951, -122.236, 47.7341],
    population: 753675,
    state: "WA",
  },
  {
    id: "denver",
    name: "Denver",
    searchTerms: ["denver", "denver co", "denver colorado", "mile high"],
    displayName: "Denver, CO",
    type: "city",
    center: [-104.9903, 39.7392],
    bbox: [-105.1098, 39.6144, -104.5996, 39.9143],
    population: 727211,
    state: "CO",
  },
  {
    id: "washington-dc",
    name: "Washington",
    searchTerms: [
      "washington dc",
      "dc",
      "d.c.",
      "washington d.c.",
      "washington",
    ],
    displayName: "Washington, DC",
    type: "city",
    center: [-77.0369, 38.9072],
    bbox: [-77.1198, 38.7916, -76.9094, 38.9958],
    population: 689545,
    state: "DC",
  },
  {
    id: "boston",
    name: "Boston",
    searchTerms: ["boston", "boston ma", "boston massachusetts", "bos"],
    displayName: "Boston, MA",
    type: "city",
    center: [-71.0589, 42.3601],
    bbox: [-71.1912, 42.2279, -70.9235, 42.3969],
    population: 675647,
    state: "MA",
  },
  {
    id: "nashville",
    name: "Nashville",
    searchTerms: [
      "nashville",
      "nashville tn",
      "nashville tennessee",
      "music city",
    ],
    displayName: "Nashville, TN",
    type: "city",
    center: [-86.7816, 36.1627],
    bbox: [-87.0549, 35.9678, -86.5156, 36.4054],
    population: 670820,
    state: "TN",
  },
  {
    id: "detroit",
    name: "Detroit",
    searchTerms: ["detroit", "detroit mi", "detroit michigan", "motor city"],
    displayName: "Detroit, MI",
    type: "city",
    center: [-83.0458, 42.3314],
    bbox: [-83.2875, 42.255, -82.9104, 42.4502],
    population: 639111,
    state: "MI",
  },
  {
    id: "portland",
    name: "Portland",
    searchTerms: ["portland", "portland or", "portland oregon", "pdx"],
    displayName: "Portland, OR",
    type: "city",
    center: [-122.6765, 45.5152],
    bbox: [-122.836, 45.4323, -122.4715, 45.6534],
    population: 652503,
    state: "OR",
  },
  {
    id: "memphis",
    name: "Memphis",
    searchTerms: ["memphis", "memphis tn", "memphis tennessee"],
    displayName: "Memphis, TN",
    type: "city",
    center: [-90.049, 35.1495],
    bbox: [-90.1999, 34.9943, -89.7086, 35.3168],
    population: 633104,
    state: "TN",
  },
  {
    id: "louisville",
    name: "Louisville",
    searchTerms: ["louisville", "louisville ky", "louisville kentucky"],
    displayName: "Louisville, KY",
    type: "city",
    center: [-85.7585, 38.2527],
    bbox: [-85.9481, 38.0548, -85.4206, 38.3801],
    population: 617638,
    state: "KY",
  },
  {
    id: "baltimore",
    name: "Baltimore",
    searchTerms: ["baltimore", "baltimore md", "baltimore maryland", "bmore"],
    displayName: "Baltimore, MD",
    type: "city",
    center: [-76.6122, 39.2904],
    bbox: [-76.7112, 39.1974, -76.5295, 39.3721],
    population: 585708,
    state: "MD",
  },
  {
    id: "milwaukee",
    name: "Milwaukee",
    searchTerms: ["milwaukee", "milwaukee wi", "milwaukee wisconsin", "mke"],
    displayName: "Milwaukee, WI",
    type: "city",
    center: [-87.9065, 43.0389],
    bbox: [-88.0695, 42.9211, -87.8635, 43.1947],
    population: 577222,
    state: "WI",
  },
  {
    id: "albuquerque",
    name: "Albuquerque",
    searchTerms: ["albuquerque", "albuquerque nm", "abq"],
    displayName: "Albuquerque, NM",
    type: "city",
    center: [-106.6504, 35.0844],
    bbox: [-106.8816, 34.9474, -106.4724, 35.2184],
    population: 560513,
    state: "NM",
  },
  {
    id: "tucson",
    name: "Tucson",
    searchTerms: ["tucson", "tucson az", "tucson arizona"],
    displayName: "Tucson, AZ",
    type: "city",
    center: [-110.9747, 32.2226],
    bbox: [-111.0832, 32.0576, -110.7412, 32.3233],
    population: 548073,
    state: "AZ",
  },
  {
    id: "fresno",
    name: "Fresno",
    searchTerms: ["fresno", "fresno ca", "fresno california"],
    displayName: "Fresno, CA",
    type: "city",
    center: [-119.7871, 36.7378],
    bbox: [-119.9323, 36.6357, -119.6513, 36.9133],
    population: 542107,
    state: "CA",
  },
  {
    id: "sacramento",
    name: "Sacramento",
    searchTerms: ["sacramento", "sacramento ca", "sac"],
    displayName: "Sacramento, CA",
    type: "city",
    center: [-121.4944, 38.5816],
    bbox: [-121.56, 38.4375, -121.3628, 38.6852],
    population: 524943,
    state: "CA",
  },
  {
    id: "mesa",
    name: "Mesa",
    searchTerms: ["mesa", "mesa az", "mesa arizona"],
    displayName: "Mesa, AZ",
    type: "city",
    center: [-111.8315, 33.4152],
    bbox: [-111.9646, 33.2895, -111.5869, 33.5087],
    population: 518012,
    state: "AZ",
  },
  {
    id: "atlanta",
    name: "Atlanta",
    searchTerms: ["atlanta", "atlanta ga", "atlanta georgia", "atl"],
    displayName: "Atlanta, GA",
    type: "city",
    center: [-84.388, 33.749],
    bbox: [-84.5516, 33.6479, -84.2893, 33.887],
    population: 498715,
    state: "GA",
  },
  {
    id: "kansas-city",
    name: "Kansas City",
    searchTerms: ["kansas city", "kansas city mo", "kc"],
    displayName: "Kansas City, MO",
    type: "city",
    center: [-94.5786, 39.0997],
    bbox: [-94.7646, 38.8589, -94.3876, 39.3329],
    population: 508090,
    state: "MO",
  },
  {
    id: "omaha",
    name: "Omaha",
    searchTerms: ["omaha", "omaha ne", "omaha nebraska"],
    displayName: "Omaha, NE",
    type: "city",
    center: [-95.9345, 41.2565],
    bbox: [-96.194, 41.1755, -95.8597, 41.3771],
    population: 486051,
    state: "NE",
  },
  {
    id: "miami",
    name: "Miami",
    searchTerms: ["miami", "miami fl", "miami florida", "mia"],
    displayName: "Miami, FL",
    type: "city",
    center: [-80.1918, 25.7617],
    bbox: [-80.3193, 25.7091, -80.1395, 25.8556],
    population: 467963,
    state: "FL",
  },
  {
    id: "oakland",
    name: "Oakland",
    searchTerms: ["oakland", "oakland ca", "oakland california"],
    displayName: "Oakland, CA",
    type: "city",
    center: [-122.2711, 37.8044],
    bbox: [-122.3551, 37.6323, -122.1144, 37.8855],
    population: 433031,
    state: "CA",
  },
  {
    id: "minneapolis",
    name: "Minneapolis",
    searchTerms: ["minneapolis", "minneapolis mn", "mpls", "twin cities"],
    displayName: "Minneapolis, MN",
    type: "city",
    center: [-93.265, 44.9778],
    bbox: [-93.3291, 44.8902, -93.1937, 45.0512],
    population: 429954,
    state: "MN",
  },
  {
    id: "raleigh",
    name: "Raleigh",
    searchTerms: [
      "raleigh",
      "raleigh nc",
      "raleigh durham",
      "research triangle",
    ],
    displayName: "Raleigh, NC",
    type: "city",
    center: [-78.6382, 35.7796],
    bbox: [-78.8192, 35.6595, -78.4653, 35.9728],
    population: 474069,
    state: "NC",
  },
  {
    id: "tampa",
    name: "Tampa",
    searchTerms: ["tampa", "tampa fl", "tampa bay", "tampa florida"],
    displayName: "Tampa, FL",
    type: "city",
    center: [-82.4572, 27.9506],
    bbox: [-82.56, 27.8218, -82.2571, 28.1712],
    population: 399700,
    state: "FL",
  },
  {
    id: "orlando",
    name: "Orlando",
    searchTerms: ["orlando", "orlando fl", "orlando florida"],
    displayName: "Orlando, FL",
    type: "city",
    center: [-81.3792, 28.5383],
    bbox: [-81.5075, 28.3522, -81.225, 28.6153],
    population: 307573,
    state: "FL",
  },
  {
    id: "las-vegas",
    name: "Las Vegas",
    searchTerms: ["las vegas", "vegas", "las vegas nv", "sin city"],
    displayName: "Las Vegas, NV",
    type: "city",
    center: [-115.1398, 36.1699],
    bbox: [-115.3844, 36.0019, -115.0627, 36.3854],
    population: 651319,
    state: "NV",
  },
  {
    id: "salt-lake-city",
    name: "Salt Lake City",
    searchTerms: ["salt lake city", "slc", "salt lake", "salt lake city ut"],
    displayName: "Salt Lake City, UT",
    type: "city",
    center: [-111.891, 40.7608],
    bbox: [-112.1019, 40.6997, -111.7397, 40.8523],
    population: 200478,
    state: "UT",
  },
  {
    id: "pittsburgh",
    name: "Pittsburgh",
    searchTerms: ["pittsburgh", "pittsburgh pa", "pgh", "steel city"],
    displayName: "Pittsburgh, PA",
    type: "city",
    center: [-79.9959, 40.4406],
    bbox: [-80.0953, 40.3616, -79.8654, 40.5012],
    population: 302971,
    state: "PA",
  },
  {
    id: "cincinnati",
    name: "Cincinnati",
    searchTerms: ["cincinnati", "cincinnati oh", "cincy"],
    displayName: "Cincinnati, OH",
    type: "city",
    center: [-84.512, 39.1031],
    bbox: [-84.7103, 39.0518, -84.3619, 39.2139],
    population: 309317,
    state: "OH",
  },
  {
    id: "st-louis",
    name: "St. Louis",
    searchTerms: ["st louis", "saint louis", "st. louis mo", "stl"],
    displayName: "St. Louis, MO",
    type: "city",
    center: [-90.1994, 38.627],
    bbox: [-90.3207, 38.5326, -90.1664, 38.7742],
    population: 301578,
    state: "MO",
  },
  {
    id: "new-orleans",
    name: "New Orleans",
    searchTerms: ["new orleans", "nola", "new orleans la"],
    displayName: "New Orleans, LA",
    type: "city",
    center: [-90.0715, 29.9511],
    bbox: [-90.1403, 29.8658, -89.8656, 30.0592],
    population: 383997,
    state: "LA",
  },

  // Major college towns
  {
    id: "ann-arbor",
    name: "Ann Arbor",
    searchTerms: [
      "ann arbor",
      "ann arbor mi",
      "u of m",
      "university of michigan",
    ],
    displayName: "Ann Arbor, MI",
    type: "city",
    center: [-83.743, 42.2808],
    population: 121890,
    state: "MI",
  },
  {
    id: "boulder",
    name: "Boulder",
    searchTerms: ["boulder", "boulder co", "cu boulder"],
    displayName: "Boulder, CO",
    type: "city",
    center: [-105.2705, 40.015],
    population: 105485,
    state: "CO",
  },
  {
    id: "chapel-hill",
    name: "Chapel Hill",
    searchTerms: ["chapel hill", "chapel hill nc", "unc"],
    displayName: "Chapel Hill, NC",
    type: "city",
    center: [-79.0558, 35.9132],
    population: 61960,
    state: "NC",
  },
  {
    id: "berkeley",
    name: "Berkeley",
    searchTerms: ["berkeley", "berkeley ca", "uc berkeley", "cal"],
    displayName: "Berkeley, CA",
    type: "city",
    center: [-122.2727, 37.8716],
    population: 124321,
    state: "CA",
  },
  {
    id: "cambridge",
    name: "Cambridge",
    searchTerms: ["cambridge", "cambridge ma", "harvard", "mit"],
    displayName: "Cambridge, MA",
    type: "city",
    center: [-71.1097, 42.3736],
    population: 118403,
    state: "MA",
  },
  {
    id: "madison",
    name: "Madison",
    searchTerms: ["madison", "madison wi", "uw madison"],
    displayName: "Madison, WI",
    type: "city",
    center: [-89.4012, 43.0731],
    population: 269840,
    state: "WI",
  },
  {
    id: "bloomington-in",
    name: "Bloomington",
    searchTerms: [
      "bloomington in",
      "bloomington indiana",
      "iu",
      "indiana university",
    ],
    displayName: "Bloomington, IN",
    type: "city",
    center: [-86.5264, 39.1653],
    population: 79168,
    state: "IN",
  },
  {
    id: "state-college",
    name: "State College",
    searchTerms: ["state college", "state college pa", "penn state", "psu"],
    displayName: "State College, PA",
    type: "city",
    center: [-77.8599, 40.7934],
    population: 42034,
    state: "PA",
  },
  {
    id: "athens",
    name: "Athens",
    searchTerms: [
      "athens ga",
      "athens georgia",
      "uga",
      "university of georgia",
    ],
    displayName: "Athens, GA",
    type: "city",
    center: [-83.3576, 33.951],
    population: 127315,
    state: "GA",
  },
  {
    id: "eugene",
    name: "Eugene",
    searchTerms: ["eugene", "eugene or", "u of o", "university of oregon"],
    displayName: "Eugene, OR",
    type: "city",
    center: [-123.0868, 44.0521],
    population: 176654,
    state: "OR",
  },
  {
    id: "ithaca",
    name: "Ithaca",
    searchTerms: ["ithaca", "ithaca ny", "cornell"],
    displayName: "Ithaca, NY",
    type: "city",
    center: [-76.4966, 42.4406],
    population: 32027,
    state: "NY",
  },
  {
    id: "gainesville",
    name: "Gainesville",
    searchTerms: [
      "gainesville",
      "gainesville fl",
      "uf",
      "university of florida",
    ],
    displayName: "Gainesville, FL",
    type: "city",
    center: [-82.3248, 29.6516],
    population: 141085,
    state: "FL",
  },
  {
    id: "college-station",
    name: "College Station",
    searchTerms: ["college station", "college station tx", "texas a&m", "tamu"],
    displayName: "College Station, TX",
    type: "city",
    center: [-96.3344, 30.6253],
    population: 120511,
    state: "TX",
  },

  // Major NYC neighborhoods
  {
    id: "brooklyn",
    name: "Brooklyn",
    searchTerms: ["brooklyn", "brooklyn ny", "bk"],
    displayName: "Brooklyn, NY",
    type: "neighborhood",
    center: [-73.9442, 40.6782],
    population: 2736074,
    state: "NY",
  },
  {
    id: "manhattan",
    name: "Manhattan",
    searchTerms: ["manhattan", "manhattan ny"],
    displayName: "Manhattan, NY",
    type: "neighborhood",
    center: [-73.9712, 40.7831],
    population: 1694251,
    state: "NY",
  },
  {
    id: "queens",
    name: "Queens",
    searchTerms: ["queens", "queens ny"],
    displayName: "Queens, NY",
    type: "neighborhood",
    center: [-73.7949, 40.7282],
    population: 2405464,
    state: "NY",
  },
  {
    id: "bronx",
    name: "The Bronx",
    searchTerms: ["bronx", "the bronx", "bronx ny"],
    displayName: "Bronx, NY",
    type: "neighborhood",
    center: [-73.8648, 40.8448],
    population: 1472654,
    state: "NY",
  },
  {
    id: "williamsburg",
    name: "Williamsburg",
    searchTerms: ["williamsburg", "williamsburg brooklyn"],
    displayName: "Williamsburg, Brooklyn, NY",
    type: "neighborhood",
    center: [-73.9572, 40.7081],
    state: "NY",
  },

  // Major LA neighborhoods
  {
    id: "hollywood",
    name: "Hollywood",
    searchTerms: ["hollywood", "hollywood ca", "hollywood los angeles"],
    displayName: "Hollywood, Los Angeles, CA",
    type: "neighborhood",
    center: [-118.3287, 34.0928],
    state: "CA",
  },
  {
    id: "santa-monica",
    name: "Santa Monica",
    searchTerms: ["santa monica", "santa monica ca"],
    displayName: "Santa Monica, CA",
    type: "city",
    center: [-118.4912, 34.0195],
    population: 93076,
    state: "CA",
  },
  {
    id: "venice-beach",
    name: "Venice",
    searchTerms: ["venice", "venice beach", "venice ca"],
    displayName: "Venice, Los Angeles, CA",
    type: "neighborhood",
    center: [-118.4695, 33.9875],
    state: "CA",
  },
  {
    id: "pasadena",
    name: "Pasadena",
    searchTerms: ["pasadena", "pasadena ca"],
    displayName: "Pasadena, CA",
    type: "city",
    center: [-118.1445, 34.1478],
    population: 138699,
    state: "CA",
  },
  {
    id: "long-beach",
    name: "Long Beach",
    searchTerms: ["long beach", "long beach ca"],
    displayName: "Long Beach, CA",
    type: "city",
    center: [-118.1937, 33.77],
    population: 466742,
    state: "CA",
  },

  // Major SF Bay Area neighborhoods
  {
    id: "palo-alto",
    name: "Palo Alto",
    searchTerms: ["palo alto", "palo alto ca", "stanford"],
    displayName: "Palo Alto, CA",
    type: "city",
    center: [-122.143, 37.4419],
    population: 68572,
    state: "CA",
  },
  {
    id: "mountain-view",
    name: "Mountain View",
    searchTerms: ["mountain view", "mountain view ca", "mtv"],
    displayName: "Mountain View, CA",
    type: "city",
    center: [-122.0838, 37.3861],
    population: 82376,
    state: "CA",
  },
  {
    id: "sunnyvale",
    name: "Sunnyvale",
    searchTerms: ["sunnyvale", "sunnyvale ca"],
    displayName: "Sunnyvale, CA",
    type: "city",
    center: [-122.0363, 37.3688],
    population: 155805,
    state: "CA",
  },
  {
    id: "cupertino",
    name: "Cupertino",
    searchTerms: ["cupertino", "cupertino ca", "apple"],
    displayName: "Cupertino, CA",
    type: "city",
    center: [-122.0322, 37.323],
    population: 60170,
    state: "CA",
  },
  {
    id: "fremont",
    name: "Fremont",
    searchTerms: ["fremont", "fremont ca"],
    displayName: "Fremont, CA",
    type: "city",
    center: [-121.9886, 37.5485],
    population: 230504,
    state: "CA",
  },

  // Chicago neighborhoods
  {
    id: "wicker-park",
    name: "Wicker Park",
    searchTerms: ["wicker park", "wicker park chicago"],
    displayName: "Wicker Park, Chicago, IL",
    type: "neighborhood",
    center: [-87.6775, 41.9088],
    state: "IL",
  },
  {
    id: "lincoln-park-chi",
    name: "Lincoln Park",
    searchTerms: ["lincoln park chicago", "lincoln park"],
    displayName: "Lincoln Park, Chicago, IL",
    type: "neighborhood",
    center: [-87.6468, 41.9214],
    state: "IL",
  },
  {
    id: "logan-square",
    name: "Logan Square",
    searchTerms: ["logan square", "logan square chicago"],
    displayName: "Logan Square, Chicago, IL",
    type: "neighborhood",
    center: [-87.7086, 41.9234],
    state: "IL",
  },

  // Additional major cities
  {
    id: "san-bernardino",
    name: "San Bernardino",
    searchTerms: ["san bernardino", "san bernardino ca"],
    displayName: "San Bernardino, CA",
    type: "city",
    center: [-117.2898, 34.1083],
    population: 222101,
    state: "CA",
  },
  {
    id: "irvine",
    name: "Irvine",
    searchTerms: ["irvine", "irvine ca", "uci"],
    displayName: "Irvine, CA",
    type: "city",
    center: [-117.8265, 33.6846],
    population: 307670,
    state: "CA",
  },
  {
    id: "honolulu",
    name: "Honolulu",
    searchTerms: ["honolulu", "honolulu hi", "hawaii", "oahu"],
    displayName: "Honolulu, HI",
    type: "city",
    center: [-157.8583, 21.3069],
    population: 350964,
    state: "HI",
  },
  {
    id: "anchorage",
    name: "Anchorage",
    searchTerms: ["anchorage", "anchorage ak", "alaska"],
    displayName: "Anchorage, AK",
    type: "city",
    center: [-149.9003, 61.2181],
    population: 291247,
    state: "AK",
  },
  {
    id: "boise",
    name: "Boise",
    searchTerms: ["boise", "boise id", "boise idaho"],
    displayName: "Boise, ID",
    type: "city",
    center: [-116.2023, 43.615],
    population: 235684,
    state: "ID",
  },
  {
    id: "providence",
    name: "Providence",
    searchTerms: ["providence", "providence ri", "rhode island"],
    displayName: "Providence, RI",
    type: "city",
    center: [-71.4128, 41.824],
    population: 190934,
    state: "RI",
  },
  {
    id: "richmond",
    name: "Richmond",
    searchTerms: ["richmond", "richmond va", "rva"],
    displayName: "Richmond, VA",
    type: "city",
    center: [-77.436, 37.5407],
    population: 226610,
    state: "VA",
  },
  {
    id: "rochester",
    name: "Rochester",
    searchTerms: ["rochester", "rochester ny"],
    displayName: "Rochester, NY",
    type: "city",
    center: [-77.6109, 43.1566],
    population: 211328,
    state: "NY",
  },
  {
    id: "buffalo",
    name: "Buffalo",
    searchTerms: ["buffalo", "buffalo ny"],
    displayName: "Buffalo, NY",
    type: "city",
    center: [-78.8784, 42.8864],
    population: 278349,
    state: "NY",
  },
  {
    id: "hartford",
    name: "Hartford",
    searchTerms: ["hartford", "hartford ct"],
    displayName: "Hartford, CT",
    type: "city",
    center: [-72.6851, 41.7658],
    population: 121054,
    state: "CT",
  },
  {
    id: "new-haven",
    name: "New Haven",
    searchTerms: ["new haven", "new haven ct", "yale"],
    displayName: "New Haven, CT",
    type: "city",
    center: [-72.9279, 41.3083],
    population: 134023,
    state: "CT",
  },

  // US States (as regions)
  {
    id: "california",
    name: "California",
    searchTerms: ["california", "ca", "cali"],
    displayName: "California",
    type: "state",
    center: [-119.4179, 36.7783],
    bbox: [-124.4096, 32.5343, -114.1312, 42.0095],
    state: "CA",
  },
  {
    id: "texas",
    name: "Texas",
    searchTerms: ["texas", "tx"],
    displayName: "Texas",
    type: "state",
    center: [-99.9018, 31.9686],
    bbox: [-106.6456, 25.8371, -93.5083, 36.5007],
    state: "TX",
  },
  {
    id: "florida",
    name: "Florida",
    searchTerms: ["florida", "fl"],
    displayName: "Florida",
    type: "state",
    center: [-81.5158, 27.6648],
    bbox: [-87.6349, 24.3963, -79.9743, 31.0009],
    state: "FL",
  },
  {
    id: "new-york-state",
    name: "New York",
    searchTerms: ["new york state", "ny state"],
    displayName: "New York",
    type: "state",
    center: [-75.4999, 43.0004],
    bbox: [-79.7624, 40.4961, -71.8562, 45.0159],
    state: "NY",
  },
  {
    id: "illinois",
    name: "Illinois",
    searchTerms: ["illinois", "il"],
    displayName: "Illinois",
    type: "state",
    center: [-89.3985, 40.6331],
    bbox: [-91.513, 36.9703, -87.019, 42.5083],
    state: "IL",
  },
  {
    id: "pennsylvania",
    name: "Pennsylvania",
    searchTerms: ["pennsylvania", "pa"],
    displayName: "Pennsylvania",
    type: "state",
    center: [-77.1945, 41.2033],
    bbox: [-80.5199, 39.7198, -74.6895, 42.2699],
    state: "PA",
  },
  {
    id: "ohio",
    name: "Ohio",
    searchTerms: ["ohio", "oh"],
    displayName: "Ohio",
    type: "state",
    center: [-82.9071, 40.4173],
    bbox: [-84.8203, 38.4032, -80.519, 42.3271],
    state: "OH",
  },
  {
    id: "georgia-state",
    name: "Georgia",
    searchTerms: ["georgia", "ga"],
    displayName: "Georgia",
    type: "state",
    center: [-83.5005, 32.1656],
    bbox: [-85.6052, 30.3557, -80.8396, 35.0007],
    state: "GA",
  },
  {
    id: "north-carolina",
    name: "North Carolina",
    searchTerms: ["north carolina", "nc"],
    displayName: "North Carolina",
    type: "state",
    center: [-79.0193, 35.7596],
    bbox: [-84.3219, 33.8424, -75.4006, 36.5881],
    state: "NC",
  },
  {
    id: "michigan",
    name: "Michigan",
    searchTerms: ["michigan", "mi"],
    displayName: "Michigan",
    type: "state",
    center: [-85.6024, 44.3148],
    bbox: [-90.4186, 41.6961, -82.122, 48.3062],
    state: "MI",
  },
];

// Pre-built search index for fast prefix lookups
const searchIndex: Map<string, LocalLocation[]> = new Map();

/**
 * Build search index for O(1) prefix lookups
 */
function buildSearchIndex() {
  if (searchIndex.size > 0) return; // Already built

  for (const location of US_LOCATIONS) {
    for (const term of location.searchTerms) {
      const normalized = term.toLowerCase();
      // Index by first 1, 2, and 3 character prefixes for fast lookup
      for (let len = 1; len <= Math.min(normalized.length, 3); len++) {
        const prefix = normalized.slice(0, len);
        if (!searchIndex.has(prefix)) {
          searchIndex.set(prefix, []);
        }
        searchIndex.get(prefix)!.push(location);
      }
    }
  }
}

// Build index on module load
buildSearchIndex();

/**
 * Score a location match (higher = better)
 */
function scoreMatch(
  location: LocalLocation,
  query: string,
  matchType: "exact" | "prefix" | "contains",
): number {
  let score = 0;

  // Match type scoring
  switch (matchType) {
    case "exact":
      score += 100;
      break;
    case "prefix":
      score += 50;
      break;
    case "contains":
      score += 25;
      break;
  }

  // Population boost (normalized to 0-30 range)
  if (location.population) {
    score += Math.min(30, Math.log10(location.population) * 3);
  }

  // Type preference (cities preferred for general search)
  if (location.type === "city") score += 10;
  if (location.type === "neighborhood") score += 5;

  // Query length bonus - longer matches are better
  score += Math.min(10, query.length);

  return score;
}

export interface LocalSearchResult {
  location: LocalLocation;
  score: number;
  matchType: "exact" | "prefix" | "contains";
}

/**
 * Search local locations dataset
 *
 * @param query - Search query
 * @param limit - Maximum results to return (default 5)
 * @returns Array of matching locations with scores
 */
export function searchLocalLocations(
  query: string,
  limit: number = 5,
): LocalSearchResult[] {
  if (!query || query.length < 2) return [];

  const normalized = query.toLowerCase().trim();
  const results: LocalSearchResult[] = [];
  const seen = new Set<string>();

  // Get candidate locations from index
  const prefix = normalized.slice(0, Math.min(normalized.length, 3));
  const candidates = searchIndex.get(prefix) || [];

  // Also search all locations for contains matches if needed
  const allCandidates = candidates.length >= limit ? candidates : US_LOCATIONS;

  for (const location of allCandidates) {
    if (seen.has(location.id)) continue;

    for (const term of location.searchTerms) {
      const termLower = term.toLowerCase();

      let matchType: "exact" | "prefix" | "contains" | null = null;

      if (termLower === normalized) {
        matchType = "exact";
      } else if (termLower.startsWith(normalized)) {
        matchType = "prefix";
      } else if (termLower.includes(normalized)) {
        matchType = "contains";
      }

      if (matchType) {
        seen.add(location.id);
        results.push({
          location,
          score: scoreMatch(location, normalized, matchType),
          matchType,
        });
        break; // Only count each location once
      }
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return results.slice(0, limit);
}

/**
 * Check if a query looks like a street address
 * Street addresses typically contain numbers
 */
export function looksLikeStreetAddress(query: string): boolean {
  // Check for common street address patterns
  return /\d+\s+\w/.test(query);
}
