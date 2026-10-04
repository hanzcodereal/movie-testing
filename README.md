# hanzMovie

Deploy ke Vercel: `vercel --prod` (atau import repo). Tanpa build step, tanpa dependency.

- `public/index.html` frontend
- `api/movie.js` scraper (`a=home`, `a=list&t=movie`, `a=search&q=`, `a=detail&p=`)
- `middleware.js` anti-bot invisible, env `GUARD_SECRET` (wajib diganti) dan `BOT_KEY` (opsional)
