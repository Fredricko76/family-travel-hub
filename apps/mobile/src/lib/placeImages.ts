/**
 * A photo for a place name, from Wikipedia's freely licensed article images.
 * Results are cached in memory (and in the browser's storage on the web) so a
 * place is looked up once per device.
 */
export type PlacePhoto = { big: string; small: string };

const memory = new Map<string, PlacePhoto | null>();
const STORAGE_KEY = 'fth-place-images-v3';

/** Places whose plain name is ambiguous on Wikipedia, mapped to the right article. */
const KNOWN_TITLES: Record<string, string> = {
  'new york': 'New York City',
  'georgetown': 'George Town, Cayman Islands',
  'george town': 'George Town, Cayman Islands',
  'nassau': 'Nassau, Bahamas',
  'cozumel': 'Cozumel',
  'costa maya': 'Costa Maya',
  'orlando': 'Orlando, Florida',
  'tampa': 'Tampa, Florida',
  'miami': 'Miami',
  'los angeles': 'Los Angeles',
  'santa monica': 'Santa Monica, California',
  'denver': 'Denver',
  'san francisco': 'San Francisco',
  'ubud': 'Ubud',
  'denpasar': 'Denpasar',
};

async function searchTitle(query: string): Promise<string | null> {
  const res = await fetch(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=1&format=json&origin=*&srsearch=${encodeURIComponent(query)}`,
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { query?: { search?: { title: string }[] } };
  return data.query?.search?.[0]?.title ?? null;
}

function readStore(): Record<string, PlacePhoto | null> {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    return raw ? (JSON.parse(raw) as Record<string, PlacePhoto | null>) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, PlacePhoto | null>) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // storage unavailable; memory cache still works
  }
}

async function lookup(title: string): Promise<{ photo: PlacePhoto | null; disambiguation: boolean }> {
  const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return { photo: null, disambiguation: false };
  const data = (await res.json()) as {
    type?: string;
    thumbnail?: { source?: string };
    originalimage?: { source?: string; width?: number };
  };
  const disambiguation = data.type === 'disambiguation';
  const source = data.thumbnail?.source?.split('?')[0] ?? null;
  if (!source) return { photo: null, disambiguation };
  // Wikimedia only renders a few fixed thumbnail widths; 1280 is one of them.
  // Use it for the banner when the original is at least that wide, else the
  // small thumbnail as given (about 330px).
  const big = (data.originalimage?.width ?? 0) >= 1280 ? source.replace(/\/\d+px-/, '/1280px-') : source;
  return { photo: { big, small: source }, disambiguation };
}

/** Returns a big and a small photo URL for the place, or null if none could be found. */
export async function placeImage(place: string | null | undefined, hint?: string | null): Promise<PlacePhoto | null> {
  const name = (place ?? '').trim();
  if (!name) return null;
  const key = name.toLowerCase();
  if (memory.has(key)) return memory.get(key) ?? null;
  const store = readStore();
  if (key in store) {
    memory.set(key, store[key]);
    return store[key];
  }
  let photo: PlacePhoto | null = null;
  try {
    const known = KNOWN_TITLES[key];
    const first = await lookup(known ?? name);
    photo = first.photo;
    if (!photo || first.disambiguation) {
      // Ambiguous or missing: ask Wikipedia's search for the city article.
      const title = await searchTitle(`${name} city${hint ? ` ${hint}` : ''}`);
      if (title) photo = (await lookup(title)).photo;
    }
  } catch {
    photo = null;
  }
  memory.set(key, photo);
  store[key] = photo;
  writeStore(store);
  return photo;
}
