// Wikipedia "On This Day" REST API fetcher.
// Returns a flat array of { year, text } objects for the given country's Wikipedia.
export async function fetchOnThisDay(country, date = new Date()) {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const lang = country === 'IT' ? 'it' : 'fr';
  const url = `https://${lang}.wikipedia.org/api/rest_v1/feed/onthisday/events/${month}/${day}`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'ContentPlatform/1.0 (educational use)' },
  });
  if (!res.ok) throw new Error(`Wikipedia API ${res.status}: ${url}`);

  const data = await res.json();
  return (data.events || []).map((e) => ({ year: Number(e.year), text: String(e.text || '') }));
}
