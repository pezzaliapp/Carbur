/**
 * Carbur — proxy MIMIT su Cloudflare Workers
 *
 * Scarica i due CSV open data del MIMIT lato server (dove il CORS del browser
 * non si applica), li mette in cache e li riserve alla PWA con gli header
 * CORS corretti. Nessun dato simulato: o prezzi reali, o errore onesto.
 *
 * Endpoint:
 *   GET /anagrafica  -> CSV anagrafica impianti attivi
 *   GET /prezzi      -> CSV prezzo alle 8
 *   GET /            -> healthcheck JSON
 */

const SRC = {
  anagrafica: 'https://www.mimit.gov.it/images/exportCSV/anagrafica_impianti_attivi.csv',
  prezzi:     'https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv',
};

// I file MIMIT cambiano ~1 volta al giorno: cache 3h è un buon compromesso
const CACHE_SECONDS = 60 * 60 * 3;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    if (path === '/') {
      return json({
        service: 'carbur-mimit-proxy',
        ok: true,
        endpoints: ['/anagrafica', '/prezzi'],
        cache_seconds: CACHE_SECONDS,
      });
    }

    const key = path === '/anagrafica' ? 'anagrafica'
              : path === '/prezzi'     ? 'prezzi'
              : null;

    if (!key) {
      return json({ error: 'not_found', path }, 404);
    }

    // Cache edge di Cloudflare: il CSV viene scaricato dal MIMIT
    // al massimo una volta ogni CACHE_SECONDS, non a ogni utente.
    const cache = caches.default;
    const cacheKey = new Request(url.toString(), request);
    let hit = await cache.match(cacheKey);
    if (hit) return withCors(hit);

    let upstream;
    try {
      upstream = await fetch(SRC[key], {
        cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
        headers: { 'User-Agent': 'Carbur-PWA/1.0 (+open-data MIMIT)' },
      });
    } catch (e) {
      return json({ error: 'mimit_unreachable', detail: String(e) }, 502);
    }

    if (!upstream.ok) {
      return json({ error: 'mimit_status', status: upstream.status }, 502);
    }

    const body = await upstream.text();
    if (!body || body.length < 100) {
      return json({ error: 'mimit_empty' }, 502);
    }

    const resp = new Response(body, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
        ...CORS,
      },
    });
    ctx.waitUntil(cache.put(cacheKey, resp.clone()));
    return resp;
  },
};

function withCors(r) {
  const h = new Headers(r.headers);
  for (const [k, v] of Object.entries(CORS)) h.set(k, v);
  return new Response(r.body, { status: r.status, headers: h });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });
}
