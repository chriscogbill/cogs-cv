// cogs-cv Worker
// - Serves the static CV.
// - Stores the live version in KV so the admin toggle changes which framing
//   every visitor sees, with no redeploy.
// - Gates writes behind the shared cogs-auth identity (auth.cogs.tech), so only
//   Chris can change the live version. Visitors are never forced to log in.
//
// Bindings (see wrangler.jsonc):
//   ASSETS    - static assets (the repo files)
//   CV_STATE  - KV namespace holding key "version" = "unit4" | "ai"
//   DEV_ADMIN - "1" in .dev.vars to treat local requests as admin (prod: unset)

const DEFAULT_VERSION = 'unit4';
const ADMIN_EMAIL = 'cecogbill@gmail.com';
const AUTH_ME_URL = 'https://auth.cogs.tech/api/auth/me';

function normalise(v) {
  return v === 'ai' ? 'ai' : 'unit4';
}

// Validate the visitor against the shared cogs-auth session (server-side, no CORS).
async function getUser(request) {
  const cookie = request.headers.get('Cookie');
  if (!cookie) return null; // anonymous visitors never hit the auth service
  try {
    const r = await fetch(AUTH_ME_URL, { headers: { Cookie: cookie } });
    if (!r.ok) return null;
    const data = await r.json();
    return data && data.success ? data.user : null;
  } catch (e) {
    return null;
  }
}

function isAdmin(user) {
  return !!(user && user.email && user.email.toLowerCase() === ADMIN_EMAIL);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const devAdmin = env.DEV_ADMIN === '1';

    // ── Who am I? (drives the settings gear / toggle visibility) ──────
    if (url.pathname === '/api/me') {
      const user = devAdmin ? null : await getUser(request);
      return Response.json({
        authed: devAdmin || !!user,
        admin: devAdmin || isAdmin(user),
        email: user ? user.email : null,
      });
    }

    // ── Read / set the live version ───────────────────────────────────
    if (url.pathname === '/api/cv-version') {
      if (request.method === 'GET') {
        const version = (await env.CV_STATE.get('version')) || DEFAULT_VERSION;
        return Response.json({ version });
      }
      if (request.method === 'POST') {
        const allowed = devAdmin || isAdmin(await getUser(request));
        if (!allowed) return new Response('Unauthorized', { status: 401 });
        let body = {};
        try { body = await request.json(); } catch (e) { /* ignore */ }
        const version = normalise(body.version);
        await env.CV_STATE.put('version', version);
        return Response.json({ version });
      }
      return new Response('Method Not Allowed', { status: 405 });
    }

    // ── Everything else: serve assets, injecting the live version ─────
    const assetResponse = await env.ASSETS.fetch(request);
    const contentType = assetResponse.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return assetResponse;
    }

    const version = (await env.CV_STATE.get('version')) || DEFAULT_VERSION;
    return new HTMLRewriter()
      .on('html', {
        element(el) {
          const existing = (el.getAttribute('class') || '').replace(/\bcv-(unit4|ai)\b/g, '').trim();
          el.setAttribute('class', (existing + ' cv-' + version).trim());
        },
      })
      .transform(assetResponse);
  },
};
