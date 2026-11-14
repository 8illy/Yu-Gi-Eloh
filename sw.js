// Service worker: lets the site install as an app and keep working offline.
// Everything is "network first": online you always get the latest files and data, and each response is saved.
// Offline (or if the network is very slow) the last saved copy is used, including the latest config.json / data.json.
const VER = 'v1', SHELL = 'shell-' + VER, DATA = 'data-' + VER, IMG = 'img-' + VER;
const PRECACHE = ['./', 'index.html', 'lib.js', 'style.css', 'manifest.webmanifest', 'favicon.ico', 'logo.png',
                  'icons/icon-192.png', 'icons/icon-512.png', 'images/beat-medal.png'];
const MAX_IMAGES = 500;

// cache key = the URL without the ?t= cache-buster the page adds to every request
const key = u => { const x = new URL(u, location.href); x.searchParams.delete('t'); return x.href; };
// keep a copy of a response together with the time it was saved
async function stamp(res) {
	const h = new Headers(res.headers); h.set('x-sw-cached-at', String(Date.now()));
	return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: h });
}

self.addEventListener('install', e => e.waitUntil((async () => {
	const shell = await caches.open(SHELL);
	await Promise.allSettled(PRECACHE.map(u => shell.add(u)));          // a missing logo / favicon must not break the install
	// save the data now too, so the first offline visit already has something to show
	const data = await caches.open(DATA);
	let cfg = {};
	try { const r = await fetch('data/config.json', { cache: 'no-store' }); if (r.ok) { await data.put(new Request(key('data/config.json')), await stamp(r.clone())); cfg = await r.json(); } } catch {}
	const dataUrl = (cfg.settings && cfg.settings.dataUrl) || 'data/data.json';
	try { const r = await fetch(dataUrl, { cache: 'no-store' }); if (r.ok) await data.put(new Request(key(dataUrl)), await stamp(r)); } catch {}
	await self.skipWaiting();
})()));

self.addEventListener('activate', e => e.waitUntil((async () => {
	for (const n of await caches.keys()) if (![SHELL, DATA, IMG].includes(n)) await caches.delete(n);
	await self.clients.claim();
})()));

async function networkFirst(req, name, ms) {
	const cache = await caches.open(name), k = new Request(key(req.url));
	const net = fetch(req).then(async res => {
		if (!res.ok) throw Object.assign(new Error('HTTP ' + res.status), { res });
		await cache.put(k, await stamp(res.clone()));                    // always refresh the saved copy
		return res;
	});
	net.catch(() => {});                                                  // (a late failure after the timeout is not an error)
	try {
		return await Promise.race([net, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
	} catch (err) {
		let hit = await cache.match(k) || await cache.match(k, { ignoreSearch: true });   // ignoreSearch: the page may ask for lib.js?v=2 while lib.js was saved
		if (!hit && req.mode === 'navigate') hit = await (await caches.open(SHELL)).match(new Request(key('index.html')));
		if (hit) {                                                        // offline copy, flagged so the page can say so
			const h = new Headers(hit.headers); h.set('x-sw-from-cache', '1');
			return new Response(await hit.blob(), { status: hit.status, statusText: hit.statusText, headers: h });
		}
		if (err.res) return err.res;                                      // a real error page from the server and nothing saved
		throw err;
	}
}

// avatars (other site): cache first. Asked for with CORS so the copy is small; if that is refused, just pass through.
async function imageFirst(req) {
	const cache = await caches.open(IMG), hit = await cache.match(req.url);
	if (hit) return hit;
	try {
		const res = await fetch(req.url, { mode: 'cors' });
		if (res.ok) { await cache.put(req.url, res.clone()); const ks = await cache.keys(); if (ks.length > MAX_IMAGES) await cache.delete(ks[0]); }
		return res;
	} catch { return fetch(req); }
}

self.addEventListener('fetch', e => {
	const req = e.request;
	if (req.method !== 'GET') return;
	const u = new URL(req.url), same = u.origin === location.origin, isJson = /\.json$/i.test(u.pathname);
	if (same || isJson) e.respondWith(networkFirst(req, isJson ? DATA : SHELL, isJson ? 6000 : 4000));
	else if (req.destination === 'image') e.respondWith(imageFirst(req));
});
