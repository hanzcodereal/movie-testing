const SECRET = process.env.GUARD_SECRET || 'ganti-ini-di-env-vercel'
const BOT_KEY = process.env.BOT_KEY || ''
const COOKIE = 'am_c'
const TTL = 12 * 60 * 60

const BAD_UA = /(httrack|wget|curl|python|requests|scrapy|aiohttp|go-http|libwww|okhttp|axios|node-fetch|undici|saveweb|webcopier|teleport|offline|downloader|sitesucker|webzip|headless|phantom|puppeteer|selenium)/i
const GOOD_BOT = /(googlebot|bingbot|duckduckbot|facebookexternalhit|twitterbot|whatsapp|telegrambot|discordbot)/i

export const config = {
  matcher: '/((?!_vercel|favicon.ico).*)',
}

const NEXT = () => new Response(null, { headers: { 'x-middleware-next': '1' } })

const deny = () =>
  new Response('403 Forbidden', {
    status: 403,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  })

const enc = new TextEncoder()
let keyP
const key = () =>
  (keyP ||= crypto.subtle.importKey('raw', enc.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']))
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('')
const sign = async ts => hex(await crypto.subtle.sign('HMAC', await key(), enc.encode(String(ts))))

async function hasValidCookie(cookie) {
  const m = cookie.match(new RegExp('(?:^|;\\s*)' + COOKIE + '=(\\d+)\\.([a-f0-9]{64})'))
  if (!m) return false
  const age = Math.floor(Date.now() / 1000) - Number(m[1])
  if (age < 0 || age > TTL) return false
  return (await sign(m[1])) === m[2]
}

async function challenge() {
  const ts = Math.floor(Date.now() / 1000)
  const tok = `${ts}.${await sign(ts)}`
  const html =
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="robots" content="noindex"><meta name="theme-color" content="#0B0B0C"><title>…</title>' +
    '<body style="margin:0;background:#0B0B0C;color:#f5f5f4;font:14px system-ui;display:grid;place-items:center;min-height:100vh">' +
    `<script>document.cookie="${COOKIE}=${tok};path=/;max-age=${TTL};samesite=lax"+(location.protocol==="https:"?";secure":"");` +
    'if(document.cookie.indexOf("' + COOKIE + '=")>-1)location.replace(location.href);else document.body.textContent="Aktifkan cookie dulu ya"</script>'
  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
  })
}

export default async function middleware(req) {
  const h = req.headers
  const ua = h.get('user-agent') || ''
  const isApi = new URL(req.url).pathname.startsWith('/api/')

  if (BOT_KEY && h.get('x-am-key') === BOT_KEY) return NEXT()

  if (!isApi && GOOD_BOT.test(ua)) return NEXT()

  if (!ua || BAD_UA.test(ua)) return deny()

  if (await hasValidCookie(h.get('cookie') || '')) return NEXT()
  if (!isApi && req.method === 'GET' && (h.get('accept') || '').includes('text/html')) return challenge()

  return deny()
}
