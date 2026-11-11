// Cloudflare Worker - Supabase 프록시
// 중국에서도 접속 가능하도록 Cloudflare 엣지를 통해 Supabase 호출
//
// 배포 방법:
// 1. wrangler.toml 설정
// 2. wrangler secret put SUPABASE_URL
// 3. wrangler secret put SUPABASE_ANON_KEY
// 4. wrangler deploy

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, Prefer',
};

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const targetUrl = env.SUPABASE_URL + url.pathname + url.search;

    const headers = new Headers();
    headers.set('Content-Type', 'application/json');
    headers.set('apikey', env.SUPABASE_ANON_KEY);
    headers.set('Authorization', `Bearer ${env.SUPABASE_ANON_KEY}`);

    // Prefer 헤더 전달 (return=representation 등)
    const prefer = request.headers.get('Prefer');
    if (prefer) headers.set('Prefer', prefer);

    try {
      const response = await fetch(targetUrl, {
        method: request.method,
        headers,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      });

      const newHeaders = new Headers(response.headers);
      Object.entries(CORS_HEADERS).forEach(([k, v]) => newHeaders.set(k, v));

      return new Response(response.body, {
        status: response.status,
        headers: newHeaders,
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
  },
};
