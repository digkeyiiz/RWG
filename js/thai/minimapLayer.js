// 2D minimap drawing for the Thailand map layer.
const COLORS = {
  motorway: ['#e0603a', 9], motorway_link: ['#e0603a', 6], trunk: ['#e8923a', 8], trunk_link: ['#e8923a', 5],
  primary: ['#e8c24a', 7], primary_link: ['#e8c24a', 5], secondary: ['#f2f2f2', 6], secondary_link: ['#f2f2f2', 4],
  tertiary: ['#d0d0d0', 5], tertiary_link: ['#d0d0d0', 4],
};
const MINOR_STYLE = ['#8c8f94', 3.5];
const ORDER = ['minor', 'tertiary', 'secondary', 'primary', 'trunk', 'motorway'];
const GROUP = (c) => (c in COLORS ? c.replace('_link', '') : 'minor');

/**
 * Draw roads (and water) on a 2D context.
 * @param ctx 2D context; the map is centred on the canvas centre.
 * @param tm ThaiMap instance
 * @param cx,cz world position at the canvas centre (metres)
 * @param scale pixels per metre (e.g. 0.3 street level, 0.02 city, 0.0005 country)
 * @param rotation radians, rotates the map about the centre (positive = clockwise on screen);
 *        pass e.g. `rotation = heading` so the car's forward points up, depending on your yaw convention.
 */
export function drawThaiMinimap(ctx, tm, cx, cz, scale, rotation = 0) {
  if (!tm || !tm.hasData) return;
  const cw = ctx.canvas.width, ch = ctx.canvas.height;
  const R = Math.hypot(cw, ch) / 2 / scale;          // world radius covering the canvas
  const x0 = cx - R, x1 = cx + R, z0 = cz - R, z1 = cz + R;
  ctx.save();
  ctx.translate(cw / 2, ch / 2); ctx.rotate(rotation); ctx.scale(scale, scale); ctx.translate(-cx, -cz);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // water
  ctx.fillStyle = '#3b6a8c';
  tm.forEachWater(x0, z0, x1, z1, (w) => {
    const p = w.p;
    if (w.w) { ctx.strokeStyle = '#3b6a8c'; ctx.lineWidth = Math.max(1.5 / scale, 8); ctx.beginPath(); ctx.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]); ctx.stroke(); return; }
    ctx.beginPath(); ctx.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
    ctx.closePath(); ctx.fill();
  });
  // roads, batched per class group, drawn low class first
  const batches = {};
  const useLocal = scale > 0.004 || !tm.country;
  const add = (r, a, b, coarse) => {
    const g = GROUP(r.c); if (r.skip) return;
    (batches[g] || (batches[g] = [])).push(r, a, b);
  };
  if (tm.local && (useLocal || scale > 0.001)) tm.forEachPiece('local', x0, z0, x1, z1, (r, a, b) => add(r, a, b));
  if (tm.country && !useLocal || (tm.country && !tm.local)) {
    const box = tm.localBox;
    tm.forEachPiece('country', x0, z0, x1, z1, (r, a, b) => {
      if (box && scale > 0.001) { const m = (a + b) >> 1; const x = r.p[m * 2], z = r.p[m * 2 + 1]; if (x > box[0] && x < box[2] && z > box[1] && z < box[3]) return; }
      add(r, a, b);
    });
  }
  const step = scale < 0.01 ? Math.ceil(0.6 / (scale * 30)) : 1;   // vertex decimation when zoomed far out
  for (const g of ORDER) {
    const list = batches[g]; if (!list) continue;
    const st = g === 'minor' ? MINOR_STYLE : COLORS[g];
    if (g === 'minor' && scale < 0.02) continue;
    ctx.strokeStyle = st[0];
    ctx.lineWidth = Math.max(1.2 / scale, st[1] * (scale > 0.05 ? 1 : 0.6));
    ctx.beginPath();
    for (let k = 0; k < list.length; k += 3) {
      const p = list[k].p, a = list[k + 1], b = list[k + 2];
      ctx.moveTo(p[a * 2], p[a * 2 + 1]);
      for (let i = a + 1; i < b; i += step) ctx.lineTo(p[i * 2], p[i * 2 + 1]);
      ctx.lineTo(p[b * 2], p[b * 2 + 1]);
    }
    ctx.stroke();
  }
  ctx.restore();
}
