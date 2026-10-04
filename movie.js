import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const BASE = 'https://movienas.vercel.app';
const OUT = './hasil-full.json';
const PROGRESS = './hasil-progress.json';
const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

async function curlText(url) {
  const { stdout } = await execFileAsync('curl', ['-sL', '--compressed', '-A', UA, url], {
    maxBuffer: 50 * 1024 * 1024,
  });
  return stdout;
}

async function curlJSON(url) {
  const stdout = await curlText(url);
  if (!stdout) throw new Error('empty response');
  try {
    return JSON.parse(stdout);
  } catch (e) {
    throw new Error('invalid JSON: ' + stdout.slice(0, 100));
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('▸ ambil build id...');
const html = await curlText(BASE);
const m = html.match(/"buildId":"([^"]+)"/) || html.match(/\/_next\/data\/([^/]+)\//);
if (!m) {
  console.error('build id ga ketemu');
  process.exit(1);
}
const BUILD = m[1];
console.log('  build:', BUILD);

const get = (p) => curlJSON(`${BASE}/_next/data/${BUILD}${p}`);
const api = (p) => curlJSON(`${BASE}${p}`);

const pickPoster = (o) =>
  o?.poster ?? o?.posterUrl ?? o?.cover ?? o?.coverUrl ?? o?.image ?? o?.thumbnail ?? null;

let hasil;
if (existsSync(PROGRESS)) {
  console.log('▸ load progress...');
  hasil = JSON.parse(readFileSync(PROGRESS, 'utf-8'));
  console.log(`  detail udah ada: ${Object.keys(hasil.detail || {}).length}`);
} else {
  hasil = {
    meta: { build: BUILD, waktu: new Date().toISOString() },
    home: null,
    kategori: [],
    daftar: { movie: [], series: [], drama: [] },
    search: {},
    detail: {},
  };
}

if (!hasil.home) {
  console.log('▸ scrape home...');
  const home = await get('/index.json');
  hasil.home = home.pageProps.heroItem;
  hasil.kategori = home.pageProps.categories.map((c) => ({
    title: c.title,
    total: c.items.length,
    items: c.items.map((i) => ({
      title: i.title,
      type: i.typeLabel,
      year: i.year,
      rating: i.imdbRating,
      genre: i.genre,
      path: i.detailPath,
      poster: pickPoster(i),
    })),
  }));
  const total = hasil.kategori.reduce((a, b) => a + b.total, 0);
  console.log(`  ${hasil.kategori.length} kategori, ${total} item`);
  writeFileSync(PROGRESS, JSON.stringify(hasil, null, 2));
}

for (const t of ['movie', 'series', 'drama']) {
  if (hasil.daftar[t]?.length > 0) continue;
  console.log(`▸ scrape daftar ${t}...`);
  try {
    const r = await get(`/search/${t}.json?slug=${t}`);
    hasil.daftar[t] = r.pageProps.initialResults.map((i) => ({
      title: i.title,
      type: i.typeLabel,
      year: i.year,
      rating: i.imdbRating,
      path: i.detailPath,
      poster: pickPoster(i),
    }));
    console.log(`  ${hasil.daftar[t].length} item`);
  } catch (e) {
    console.log(`  gagal: ${e.message}`);
  }
  writeFileSync(PROGRESS, JSON.stringify(hasil, null, 2));
  await sleep(500);
}

const keywords = ['pokemon', 'k-on', 'lucifer', 'naruto', 'one piece', 'mafia', 'gangster', 'horror', 'romance', 'action'];
for (const q of keywords) {
  if (hasil.search[q]) continue;
  console.log(`▸ search "${q}"...`);
  try {
    const r = await api(`/api/search?q=${encodeURIComponent(q)}&type=0`);
    hasil.search[q] = {
      total: r.count,
      items: (r.data || []).map((i) => ({
        title: i.title,
        type: i.typeLabel,
        year: i.year,
        rating: i.imdbRating,
        path: i.detailPath,
        poster: pickPoster(i),
      })),
    };
    console.log(`  ${r.count} hasil`);
  } catch (e) {
    console.log(`  gagal: ${e.message}`);
  }
  writeFileSync(PROGRESS, JSON.stringify(hasil, null, 2));
  await sleep(500);
}

const allPaths = new Set();
for (const k of hasil.kategori) for (const it of k.items) allPaths.add(it.path);
for (const t of ['movie', 'series', 'drama']) for (const it of hasil.daftar[t]) allPaths.add(it.path);
for (const q of Object.keys(hasil.search)) for (const it of hasil.search[q].items) allPaths.add(it.path);

const pathList = [...allPaths];
console.log(`\n▸ total ${pathList.length} judul unik`);

console.log('▸ scrape detail + stream...');
let n = 0;
let ok = 0;
let skip = 0;
let fail = 0;

for (const p of pathList) {
  n++;

  if (hasil.detail[p]?.title) {
    skip++;
    continue;
  }

  process.stdout.write(`  [${n}/${pathList.length}] ${p} ... `);

  try {
    const d = await get(`/detail/${p}.json?path=${p}`);
    const detail = d.pageProps.detail;

    let stream = null;
    let episodes = null;

    try {
      const pl = await get(`/play/${p}.json?slug=${p}`);
      const s = pl.pageProps.stream;

      if (s?.streams?.length > 0) {
        stream = s.streams.map((x) => ({
          quality: x.quality,
          size: x.sizeFormatted,
          url: x.url,
        }));
      }

      if (detail.resource?.seasons) {
        episodes = detail.resource.seasons.map((se) => ({
          season: se.seasonNumber,
          maxEpisode: se.maxEpisode,
          episodes: se.allEpisodes,
          resolutions: se.resolutions,
        }));
      }
    } catch {}

    hasil.detail[p] = {
      title: detail.title,
      desc: detail.description,
      year: detail.year,
      rating: detail.imdbRating,
      ratingCount: detail.imdbRatingCount,
      genre: detail.genre,
      duration: detail.durationFormatted,
      country: detail.countryName,
      subtitles: detail.subtitles,
      totalEpisodes: detail.totalEpisodes,
      isEpisodic: detail.isEpisodic,
      resource: detail.resource?.source || null,
      poster: pickPoster(detail),
      seasons: episodes,
      stream,
    };

    console.log('ok');
    ok++;
  } catch (e) {
    console.log(`gagal: ${e.message}`);
    fail++;
  }

  if (n % 10 === 0) {
    writeFileSync(PROGRESS, JSON.stringify(hasil, null, 2));
  }

  await sleep(500);
}

writeFileSync(OUT, JSON.stringify(hasil, null, 2));

const size = JSON.stringify(hasil).length;
console.log(`\n✓ selesai`);
console.log(`  file: ${OUT}`);
console.log(`  size: ${(size / 1024).toFixed(1)} KB`);
console.log(`  ok: ${ok}`);
console.log(`  skip: ${skip}`);
console.log(`  fail: ${fail}`);
console.log(`  total detail: ${Object.keys(hasil.detail).length}`);
