// Fetchers for public, no-auth job board APIs.
// Each returns an array of normalized postings:
//   { id, title, url, locations: string[], countries: string[], remote: boolean, postedAt: string|null }

const TIMEOUT_MS = 20_000;

async function getJson(url) {
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'User-Agent': 'tech-internships-job-list (GitHub Actions)' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

// "San Francisco, CA • New York, NY" / "Austin; NYC" -> separate entries.
function splitLocations(list) {
  return list
    .flatMap((l) => String(l).split(/\s*[;•|]\s*/))
    .map((l) => l.trim())
    .filter(Boolean);
}

function toIsoOrNull(value) {
  if (value == null || value === '') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function greenhouse(slug) {
  const data = await getJson(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`);
  return (data.jobs ?? []).map((j) => ({
    id: String(j.id),
    title: j.title ?? '',
    url: j.absolute_url,
    locations: j.location?.name ? [j.location.name] : [],
    countries: [],
    remote: /remote/i.test(j.location?.name ?? ''),
    // first_published is stable; updated_at changes on every edit, so it is not used.
    postedAt: toIsoOrNull(j.first_published),
  }));
}

async function lever(slug) {
  const data = await getJson(`https://api.lever.co/v0/postings/${slug}?mode=json`);
  return (Array.isArray(data) ? data : []).map((j) => {
    const locs = j.categories?.allLocations?.length
      ? j.categories.allLocations
      : j.categories?.location
        ? [j.categories.location]
        : [];
    return {
      id: String(j.id),
      title: j.text ?? '',
      url: j.hostedUrl,
      locations: locs,
      countries: j.country ? [j.country] : [],
      remote: j.workplaceType === 'remote',
      postedAt: toIsoOrNull(j.createdAt),
    };
  });
}

async function ashby(slug) {
  const data = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${slug}`);
  return (data.jobs ?? [])
    .filter((j) => j.isListed !== false)
    .map((j) => {
      const secondary = (j.secondaryLocations ?? []).map((s) => s.location).filter(Boolean);
      const countries = [j.address?.postalAddress?.addressCountry]
        .concat((j.secondaryLocations ?? []).map((s) => s.address?.postalAddress?.addressCountry ?? s.address?.addressCountry))
        .filter(Boolean);
      return {
        id: String(j.id),
        title: j.title ?? '',
        url: j.jobUrl,
        locations: [j.location, ...secondary].filter(Boolean),
        countries,
        remote: Boolean(j.isRemote) || j.workplaceType === 'Remote',
        postedAt: toIsoOrNull(j.publishedAt),
      };
    });
}

export const SOURCES = { greenhouse, lever, ashby };

export async function fetchCompany(company) {
  const fn = SOURCES[company.ats];
  if (!fn) throw new Error(`Unknown ats "${company.ats}" (use greenhouse, lever or ashby)`);
  const postings = await fn(company.slug);
  return postings.map((p) => ({ ...p, locations: splitLocations(p.locations) }));
}
