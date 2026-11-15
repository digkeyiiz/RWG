// Feasibility probe: download Thailand motorway+trunk roads from OpenStreetMap (Overpass API).
const fs = require('fs');
const q = '[out:json][timeout:180];area["ISO3166-1"="TH"]->.t;way["highway"~"^(motorway|trunk)$"](area.t);out geom tags;';
const t = Date.now();
fetch('https://overpass-api.de/api/interpreter', {
  method: 'POST', body: 'data=' + encodeURIComponent(q),
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'vios-garage-dev/1.0' },
}).then(async (r) => {
  const s = await r.text();
  console.log(r.status, (s.length / 1e6).toFixed(1) + ' MB', (Date.now() - t) / 1000 + 's');
  if (!r.ok) return console.log(s.slice(0, 300));
  const j = JSON.parse(s);
  console.log('ways', j.elements.length);
  fs.writeFileSync(process.env.TEMP + '/th_main.json', s);
}).catch((e) => console.log('FAIL', e.cause?.code || e.message));
