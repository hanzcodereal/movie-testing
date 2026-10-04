const BASE = 'https://movienas.vercel.app'
const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
const TYPES = ['movie']
let build = null
let builtAt = 0

const get = async (url, json = true) => {
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) })
  if (!r.ok) throw new Error('upstream ' + r.status)
  return json ? r.json() : r.text()
}

async function buildId(force) {
  if (build && !force && Date.now() - builtAt < 600000) return build
  const html = await get(BASE, false)
  const m = html.match(/"buildId":"([^"]+)"/) || html.match(/\/_next\/data\/([^/]+)\//)
  if (!m) throw new Error('build id ga ketemu')
  builtAt = Date.now()
  return (build = m[1])
}

const data = async p => {
  try { return await get(`${BASE}/_next/data/${await buildId()}${p}`) }
  catch { return get(`${BASE}/_next/data/${await buildId(true)}${p}`) }
}

const poster = o => {
  for (const [k, v] of Object.entries(o || {})) if (typeof v === 'string' && /^https?:/i.test(v) && /cover|poster|thumb|image|img/i.test(k)) return v
  return null
}

const item = i => ({
  title: i.title,
  type: i.typeLabel,
  year: i.year,
  rating: i.imdbRating,
  genre: i.genre,
  path: i.detailPath,
  poster: poster(i),
})

export default async function handler(req, res) {
  const { a, t, q, p } = req.query || {}
  try {
    let out
    if (a === 'home') {
      const h = (await data('/index.json')).pageProps
      out = {
        hero: h.heroItem ? { ...item(h.heroItem), desc: h.heroItem.description || '' } : null,
        categories: (h.categories || []).map(c => ({ title: c.title, items: (c.items || []).map(item) })),
      }
    } else if (a === 'list' && TYPES.includes(t)) {
      const r = await data(`/search/${t}.json?slug=${t}`)
      out = { items: (r.pageProps.initialResults || []).map(item) }
    } else if (a === 'search' && q) {
      const r = await get(`${BASE}/api/search?q=${encodeURIComponent(String(q).slice(0, 80))}&type=0`)
      out = { total: r.count || 0, items: (r.data || []).map(item) }
    } else if (a === 'detail' && /^[\w\-./]+$/.test(p || '') && !String(p).includes('..')) {
      const d = (await data(`/detail/${p}.json?path=${p}`)).pageProps.detail
      let streams = []
      try {
        const s = (await data(`/play/${p}.json?slug=${p}`)).pageProps.stream
        streams = (s?.streams || []).map(x => ({ quality: x.quality, size: x.sizeFormatted, url: x.url }))
      } catch {}
      out = {
        title: d.title,
        desc: d.description,
        year: d.year,
        rating: d.imdbRating,
        ratingCount: d.imdbRatingCount,
        genre: d.genre,
        duration: d.durationFormatted,
        country: d.countryName,
        subtitles: d.subtitles,
        poster: poster(d),
        streams,
      }
    } else {
      return res.status(400).json({ ok: false, error: 'request nggak valid' })
    }
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
    res.status(200).json({ ok: true, ...out })
  } catch (e) {
    res.status(502).json({ ok: false, error: 'Gagal ambil data: ' + e.message })
  }
}
