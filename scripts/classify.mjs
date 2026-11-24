// Decide whether a posting belongs on the list: its level (intern / new grad),
// its category (SWE, Data/ML/AI, Product/Design) and whether its location fits.

// ---------- Level ----------

const INTERN = /\b(intern|interns|internship|internships|co-?op|summer analyst|summer associate)\b/i;

const NEW_GRAD = new RegExp(
  [
    'new[ -]?grad(uate)?s?',
    'university grad(uate)?s?',
    'recent grad(uate)?s?',
    'college grad(uate)?s?',
    'early[ -]career',
    'entry[ -]level',
    'graduate (software|engineer|program|developer|analyst)',
    'campus',
    'rotational',
    'residency',
    'associate product manager',
    'apm',
    'junior',
    'jr\\.?',
    'class of 20\\d\\d',
    '20\\d\\d (grad|graduate)s?',
  ]
    .map((p) => `\\b${p}\\b`)
    .join('|'),
  'i',
);

// "Software Engineer I" / "Data Scientist I" (case-sensitive roman numeral one).
const LEVEL_ONE = /\b(Engineer|Developer|Scientist|Analyst|Designer)(,)? I\b(?![IVX])/;

const TOO_SENIOR =
  /\b(senior|sr\.?|staff|principal|lead|director|head of|vp|vice president|architect|distinguished|fellow|II|III|IV|2|3)\b|\bmanager\b/i;

export function classifyLevel(title) {
  // "Product Manager" is allowed through so APM / PM intern titles survive;
  // the level checks below still require an intern or early-career keyword.
  const withoutPM = title.replace(/product manager/gi, '');
  if (TOO_SENIOR.test(withoutPM)) return null;
  if (INTERN.test(title)) return 'intern';
  if (NEW_GRAD.test(title) || LEVEL_ONE.test(title)) return 'newgrad';
  return null;
}

// ---------- Category ----------

const DATA_ML =
  /\b(data scien\w*|data engineer\w*|data analy\w*|machine learning|ml|ai|artificial intelligence|deep learning|research scientist|research engineer|applied scien\w*|computer vision|nlp|llm\w*|analytics|quantitative research\w*|quant research\w*|quantitative analyst)\b/i;

const PRODUCT_DESIGN =
  /\b(product manag\w*|apm|associate product|product design\w*|ux|ui|user experience|user research\w*|designer|design intern\w*|product analyst)\b/i;

const SWE_STRONG =
  /\b(software|swe|developer|backend|back[- ]end|frontend|front[- ]end|full[- ]?stack|mobile|ios|android|web|devops|site reliability|sre|infrastructure|platform engineer\w*|security engineer\w*|cloud|distributed systems|compiler|quantitative developer|quant developer|production engineer\w*)\b/i;

const NOT_SOFTWARE =
  /\b(mechanical|electrical|hardware|civil|chemical|manufacturing|propulsion|structures|structural|materials|industrial|aerospace|avionics|rf|test|quality|supply|process|facilities|construction|sales|solutions|customer|support|field|technician|mechatronics|thermal|optical|optics|launch|vehicle|integration|environmental|nuclear|power|packaging|design engineer|systems|operations|sourcing|reliability|gnc|guidance|navigation|low observables|warhead|sensor|radar|safety|components|mission|audit|finance|people)\b/i;

// Business-side roles that mention analytics / AI but aren't data-science jobs.
const NOT_DATA =
  /\b(sales|finance|financial|audit|people|hr|human resources|marketing|accounting|legal|policy|transformation|recruiting|operations)\b/i;
const NOT_PRODUCT = /\b(mechanical|industrial|hardware|interior|graphic|brand|marketing|service designer)\b/i;

export function classifyCategory(title) {
  if (DATA_ML.test(title) && !NOT_DATA.test(title)) return 'data';
  if (PRODUCT_DESIGN.test(title) && !NOT_PRODUCT.test(title) && !/\b(engineer|developer)\b/i.test(title)) return 'product';
  if (SWE_STRONG.test(title)) return 'swe';
  if (/\bengineer(ing)?\b/i.test(title) && !NOT_SOFTWARE.test(title)) return 'swe';
  return null;
}

// ---------- Location ----------

const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware',
  'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky',
  'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi',
  'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico',
  'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania',
  'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont',
  'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming', 'District of Columbia',
];
const STATE_CODES =
  'AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC';
const US_CITIES = [
  'San Francisco', 'SF', 'Bay Area', 'Silicon Valley', 'Palo Alto', 'Mountain View', 'Menlo Park',
  'Sunnyvale', 'San Jose', 'Santa Clara', 'Redwood City', 'San Mateo', 'Foster City', 'Oakland',
  'Berkeley', 'Los Angeles', 'LA', 'Santa Monica', 'Irvine', 'Costa Mesa', 'San Diego', 'Hawthorne',
  'El Segundo', 'Seattle', 'Bellevue', 'Redmond', 'Kirkland', 'Portland', 'NYC', 'Manhattan',
  'Brooklyn', 'Boston', 'Cambridge, MA', 'Somerville', 'Chicago', 'Austin', 'Dallas', 'Houston',
  'Plano', 'Richardson', 'Irving', 'Fort Worth', 'San Antonio', 'Starbase', 'McGregor', 'Denver',
  'Boulder', 'Atlanta', 'Miami', 'Raleigh', 'Durham', 'Pittsburgh', 'Philadelphia', 'Phoenix',
  'Salt Lake City', 'Lehi', 'Washington DC', 'Washington, D.C.', 'Arlington', 'Reston', 'McLean',
  'Detroit', 'Ann Arbor', 'Minneapolis', 'Nashville', 'Columbus', 'Madison', 'Cape Canaveral',
];
const US_PATTERN = new RegExp(
  [
    '\\b(united states|usa|u\\.s\\.a?\\.?)(?![A-Za-z])',
    '(^|[^A-Za-z])US([^A-Za-z]|$)',
    `,\\s*(${STATE_CODES})\\b`,
    `\\b(${US_STATES.join('|')})\\b`,
    `\\b(${US_CITIES.map((c) => c.replace(/[.]/g, '\\.')).join('|')})\\b`,
  ].join('|'),
);
const US_PATTERN_I = new RegExp(
  [`\\b(united states|usa|${US_STATES.join('|')})\\b`].join('|'),
  'i',
);

const NON_US = new RegExp(
  '\\b(' +
    [
      'canada', 'toronto', 'vancouver, bc', 'vancouver, british columbia', 'montreal', 'ontario',
      'quebec', 'british columbia', 'waterloo, on', 'ottawa', 'calgary', 'uk', 'united kingdom',
      'england', 'scotland', 'london', 'dublin', 'ireland', 'germany', 'berlin', 'munich', 'france',
      'paris', 'amsterdam', 'netherlands', 'spain', 'madrid', 'barcelona', 'poland', 'warsaw',
      'krakow', 'india', 'bangalore', 'bengaluru', 'hyderabad', 'pune', 'mumbai', 'delhi',
      'gurgaon', 'gurugram', 'chennai', 'noida', 'singapore', 'japan', 'tokyo', 'australia',
      'sydney', 'melbourne', 'brazil', 'são paulo', 'sao paulo', 'mexico city', 'méxico',
      'guadalajara', 'israel', 'tel aviv', 'china', 'beijing', 'shanghai', 'shenzhen', 'hong kong',
      'korea', 'seoul', 'taiwan', 'taipei', 'emea', 'apac', 'latam', 'europe', 'switzerland',
      'zurich', 'zürich', 'geneva', 'sweden', 'stockholm', 'denmark', 'copenhagen', 'portugal',
      'lisbon', 'italy', 'milan', 'romania', 'bucharest', 'czech', 'prague', 'argentina',
      'buenos aires', 'colombia', 'bogota', 'bogotá', 'chile', 'santiago', 'philippines', 'manila',
      'vietnam', 'indonesia', 'jakarta', 'uae', 'dubai', 'abu dhabi', 'saudi', 'riyadh',
      'south africa', 'cape town', 'nigeria', 'lagos', 'kenya', 'nairobi', 'new zealand',
      'auckland', 'belgium', 'brussels', 'austria', 'vienna', 'finland', 'helsinki', 'norway',
      'oslo', 'estonia', 'tallinn', 'ukraine', 'kyiv', 'turkey', 'istanbul', 'greece', 'athens',
      'luxembourg', 'costa rica', 'serbia', 'belgrade', 'hungary', 'budapest', 'malaysia',
      'kuala lumpur', 'thailand', 'bangkok', 'pakistan', 'egypt', 'cairo',
    ].join('|') +
    ')\\b',
  'i',
);

function locationKind(text) {
  if (!text) return 'unknown';
  if (NON_US.test(text)) return 'non-us';
  if (US_PATTERN.test(text) || US_PATTERN_I.test(text)) return 'us';
  if (/\b(remote|anywhere|worldwide|global|distributed)\b/i.test(text)) return 'remote';
  return 'unknown';
}

const US_COUNTRY = /^(us|usa|united states( of america)?)$/i;

// Returns true when the posting has at least one US or location-unrestricted remote option.
export function fitsLocation(posting, mode = 'us-remote') {
  if (mode === 'anywhere') return true;
  if (posting.countries?.some((c) => US_COUNTRY.test(c.trim()))) return true;
  const kinds = posting.locations.map(locationKind);
  if (kinds.includes('us')) return true;
  const hasForeignCountry = posting.countries?.length > 0;
  if (kinds.includes('remote') && !hasForeignCountry) return true;
  if (kinds.length === 0 && posting.remote && !hasForeignCountry) return true;
  return false;
}

// Keep only the US / remote entries for display.
export function displayLocations(locations) {
  const keep = locations.filter((l) => locationKind(l) !== 'non-us');
  return keep.length ? keep : locations;
}
