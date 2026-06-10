// ============================================================
// farmOverview.js — Farm Overview Pillar (Dashboard + SVG Map + Estate)
// ============================================================
import { renderDashboard } from './dashboard.js';
import { renderEstate } from '../ops/estate.js';
import { dataService } from '../../services/dataService.js';

const TABS = [
  { id: 'command', label: 'Command Center', icon: 'dashboard' },
  { id: 'blocks', label: 'Block Register', icon: 'table_rows' },
];
let activeTab = 'command';

/** Farm pillar: command center + block register (quick snapshot lives on main Overview). */
export async function renderFarmPillar(container) {
  container.innerHTML = `
    <div class="section-card" style="padding:0;border:none;background:transparent;box-shadow:none;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
        <div>
          <h2 class="page-title" style="font-size:18px;margin:0;">Operations</h2>
          <p class="page-subtitle" style="margin:4px 0 0;font-size:12px;">Processing detail · block register · Nyakamenta Coffee Estate</p>
        </div>
        <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-muted);">
          <span style="width:7px;height:7px;border-radius:50%;background:var(--green-bright);display:inline-block;box-shadow:0 0 6px var(--green-bright);"></span>
          Live · ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </div>
      </div>
      <div class="pillar-tab-bar">
        ${TABS.map(t => `
          <button class="pillar-tab ${t.id === activeTab ? 'active' : ''}" data-tab="${t.id}">
            <span class="material-symbols-outlined">${t.icon}</span>${t.label}
          </button>`).join('')}
      </div>
      <div id="pillar-content"></div>
    </div>`;

  const tabContent = container.querySelector('#pillar-content');
  const renderTab = async (tab) => {
    activeTab = tab;
    container.querySelectorAll('.pillar-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    tabContent.innerHTML = '<div class="pillar-loading">Loading…</div>';
    if (tab === 'command') await renderDashboard(tabContent);
    if (tab === 'blocks') await renderEstate(tabContent);
  };
  container.querySelectorAll('.pillar-tab').forEach(btn => btn.addEventListener('click', () => renderTab(btn.dataset.tab)));
  await renderTab(activeTab);
}

// ─────────────────────────────────────────────────────────────
//  Geographic Estate Map — organic SVG path parcels
// ─────────────────────────────────────────────────────────────
async function renderEstateMap(container) {
  const [blocks, ipm] = await Promise.all([
    dataService.getBlocks(),
    dataService.getIpmRecords ? dataService.getIpmRecords().catch(() => []) : Promise.resolve([]),
  ]);

  const blockRisk = {};
  ipm.forEach(r => { blockRisk[r.block_id] = Math.max(blockRisk[r.block_id] || 0, r.severity_rating || 0); });

  const totalAcres = blocks.reduce((s, b) => s + (b.acres || 0), 0);
  const totalPlants = blocks.reduce((s, b) => s + Number(b.plant_count || 0), 0);
  const farmPlantCapacity = 27000;
  const totalKg = blocks.reduce((s, b) => s + (b.kgProcessed || 0), 0);
  const activeCount = blocks.filter(b => b.status === 'Active').length;
  const alertCount = blocks.filter(b => b.status === 'Alert').length;
  const maxKg = Math.max(...blocks.map(b => b.kgProcessed || 0), 1);

  // ── Geographic colour palette (like a political map) ─────────
  // Each block gets a muted geographic colour, status adds a tint
  const GEO_PALETTE = [
    { fill: '#4E7E3A', stroke: '#2D4F1F', label: '#E8F0D0' }, // olive green
    { fill: '#7A5C30', stroke: '#4A3818', label: '#F0E0C0' }, // warm brown
    { fill: '#3A6E5A', stroke: '#1E4035', label: '#C8F0E0' }, // teal green
    { fill: '#6A5E2A', stroke: '#3E3810', label: '#F0EAC0' }, // yellow-olive
    { fill: '#5A3A5A', stroke: '#381E38', label: '#F0C8F0' }, // dusty purple
    { fill: '#2E5E7A', stroke: '#12384A', label: '#C0E0F0' }, // slate blue
    { fill: '#7A4A3A', stroke: '#4A2A20', label: '#F0D0C0' }, // terracotta
    { fill: '#4A6A3A', stroke: '#283E1E', label: '#D0F0C0' }, // forest
  ];
  // Alert blocks get a reddish tint
  const alertOverlay = 'rgba(160,50,30,0.5)';

  // ── Squarified treemap ────────────────────────────────────────
  const MAP_W = 880, MAP_H = 540;
  const PAD = 22; // border where labels/decorations live
  const IW = MAP_W - PAD * 2, IH = MAP_H - PAD * 2;

  function squarify(nodes, x, y, w, h) {
    const out = [];
    const sorted = [...nodes].sort((a, b) => (b.acres || 1) - (a.acres || 1));

    function worst(row, width) {
      const s = row.reduce((a, n) => a + n.acres, 0);
      const max = row.reduce((a, n) => Math.max(a, n.acres), 0);
      const min = row.reduce((a, n) => Math.min(a, n.acres), Infinity);
      return Math.max((width * width * max) / (s * s), (s * s) / (width * width * min));
    }

    function commitRow(row, lx, ly, lw, lh, horiz) {
      const s = row.reduce((a, n) => a + n.acres, 0), tot = sorted.reduce((a, n) => a + n.acres, 0);
      let off = 0;
      row.forEach(n => {
        const r = n.acres / s;
        if (horiz) { out.push({ ...n, mx: lx + off, my: ly, mw: lw * r, mh: lh }); off += lw * r; }
        else { out.push({ ...n, mx: lx, my: ly + off, mw: lw, mh: lh * r }); off += lh * r; }
      });
    }

    function process(items, lx, ly, lw, lh) {
      if (!items.length) return;
      if (items.length === 1) { out.push({ ...items[0], mx: lx, my: ly, mw: lw, mh: lh }); return; }
      const horiz = lw >= lh, shorter = horiz ? lh : lw;
      let row = [items[0]], best = worst(row, shorter);
      for (let i = 1; i < items.length; i++) {
        const cand = [...row, items[i]], next = worst(cand, shorter);
        if (next > best) {
          const rs = row.reduce((a, n) => a + n.acres, 0), ts = items.reduce((a, n) => a + n.acres, 0), ratio = rs / ts;
          if (horiz) { commitRow(row, lx, ly, lw, lh * ratio, true); process(items.slice(i), lx, ly + lh * ratio, lw, lh * (1 - ratio)); }
          else { commitRow(row, lx, ly, lw * ratio, lh, false); process(items.slice(i), lx + lw * ratio, ly, lw * (1 - ratio), lh); }
          return;
        }
        row = cand; best = next;
      }
      if (horiz) commitRow(row, lx, ly, lw, lh, true);
      else commitRow(row, lx, ly, lw, lh, false);
    }

    process(sorted, x, y, w, h);
    return out;
  }

  const laid = squarify(blocks, PAD, PAD, IW, IH);

  // ── Deterministic hash helper ────────────────────────────────
  const dhash = (a, b = 0) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; };

  // ── Build organic SVG path for each block ───────────────────
  // Each rect → 4 curved edges using cubic bezier
  // The edge "waves" outward or inward based on a seed
  // Small overlap (no inset) so painted borders create the country border effect
  function organicPath(mx, my, mw, mh, seed) {
    const x = mx + 0.5, y = my + 0.5, w = mw - 1, h = mh - 1;
    const ax = Math.min(w * 0.13, 16); // horizontal amplitude cap
    const ay = Math.min(h * 0.13, 16); // vertical amplitude cap
    // Edge wave directions (each edge gets a sign)
    const tA = dhash(seed, 1) * ay;  // top edge bulge
    const rA = dhash(seed, 2) * ax;  // right edge
    const bA = dhash(seed, 3) * ay;  // bottom
    const lA = dhash(seed, 4) * ax;  // left
    // Each edge also has a subtle secondary twist
    const tB = dhash(seed, 5) * ay * 0.3;
    const rB = dhash(seed, 6) * ax * 0.3;
    const bB = dhash(seed, 7) * ay * 0.3;
    const lB = dhash(seed, 8) * ax * 0.3;

    // Corners jitter slightly
    const cj = Math.min(w, h) * 0.04;
    const tlx = x + dhash(seed, 9) * cj, tly = y + dhash(seed, 10) * cj;
    const trx = x + w + dhash(seed, 11) * cj, try_ = y + dhash(seed, 12) * cj;
    const brx = x + w + dhash(seed, 13) * cj, bry = y + h + dhash(seed, 14) * cj;
    const blx = x + dhash(seed, 15) * cj, bly = y + h + dhash(seed, 16) * cj;

    // Top control pts (curve top edge up or down)
    const t1x = tlx + w * 0.33, t1y = tly + tA + tB;
    const t2x = tlx + w * 0.67, t2y = tly + tA - tB;
    // Right control pts
    const r1x = trx + rA + rB, r1y = try_ + h * 0.33;
    const r2x = trx + rA - rB, r2y = try_ + h * 0.67;
    // Bottom control pts (note: going right→left so flip signs)
    const b1x = brx - w * 0.33, b1y = bry + bA - bB;
    const b2x = brx - w * 0.67, b2y = bry + bA + bB;
    // Left control pts (bottom→top)
    const l1x = blx + lA - lB, l1y = bly - h * 0.33;
    const l2x = blx + lA + lB, l2y = bly - h * 0.67;

    return [
      `M ${f(tlx)} ${f(tly)}`,
      `C ${f(t1x)} ${f(t1y)}, ${f(t2x)} ${f(t2y)}, ${f(trx)} ${f(try_)}`,
      `C ${f(r1x)} ${f(r1y)}, ${f(r2x)} ${f(r2y)}, ${f(brx)} ${f(bry)}`,
      `C ${f(b1x)} ${f(b1y)}, ${f(b2x)} ${f(b2y)}, ${f(blx)} ${f(bly)}`,
      `C ${f(l1x)} ${f(l1y)}, ${f(l2x)} ${f(l2y)}, ${f(tlx)} ${f(tly)}`,
      'Z',
    ].join(' ');
  }
  const f = v => v.toFixed(2);

  // ── Outer estate boundary (irregular curved polygon) ─────────
  function estateOutlinePath() {
    const m = PAD - 8;
    const x = m, y = m, w = MAP_W - m * 2, h = MAP_H - m * 2;
    const pts = [
      [x + 30, y + 5], [x + w * 0.5 + dhash(99, 1) * 20, y + dhash(99, 2) * 8],
      [x + w - 25, y + 8], [x + w + dhash(99, 3) * 6, y + 35],
      [x + w + dhash(99, 4) * 5, y + h * 0.5 + dhash(99, 5) * 15], [x + w, y + h - 30],
      [x + w - 20, y + h - 5], [x + w * 0.5 + dhash(99, 6) * 18, y + h + dhash(99, 7) * 6],
      [x + 22, y + h + 3], [x - 3, y + h - 28],
      [x + dhash(99, 8) * 5, y + h * 0.5], [x + 5, y + 30],
    ];
    const d = pts.map((p, i) => {
      const prev = pts[(i + pts.length - 1) % pts.length];
      const next = pts[(i + 1) % pts.length];
      return i === 0 ? `M ${f(p[0])} ${f(p[1])}` : `L ${f(p[0])} ${f(p[1])}`;
    }).join(' ') + 'Z';
    return d;
  }

  // ── Grid lines (like a geographic map graticule) ─────────────
  const graticule = [];
  for (let i = 1; i < 4; i++) {
    const x = PAD + IW * (i / 4);
    const y = PAD + IH * (i / 4);
    graticule.push(`<line x1="${f(x)}" y1="${PAD}" x2="${f(x)}" y2="${MAP_H - PAD}" stroke="rgba(255,255,255,0.06)" stroke-width="0.6"/>`);
    graticule.push(`<line x1="${PAD}" y1="${f(y)}" x2="${MAP_W - PAD}" y2="${f(y)}" stroke="rgba(255,255,255,0.06)" stroke-width="0.6"/>`);
  }

  // ── Build block SVG ──────────────────────────────────────────
  const blockSVGs = laid.map((b, i) => {
    const geo = GEO_PALETTE[i % GEO_PALETTE.length];
    const isAlert = b.status === 'Alert';
    const isInactive = b.status === 'Inactive';
    const path = organicPath(b.mx, b.my, b.mw, b.mh, i * 41 + 17);
    const cx = b.mx + b.mw / 2;
    const cy = b.my + b.mh / 2;
    const kpa = b.acres > 0 ? ((b.kgProcessed || 0) / b.acres).toFixed(0) : '—';
    const yPct = ((b.kgProcessed || 0) / maxKg * 100).toFixed(0);
    const sev = blockRisk[b.id] || 0;
    const riskC = sev <= 2 ? '#A8D878' : sev <= 3 ? '#E8C040' : '#E07050';
    const showFull = b.mw > 100 && b.mh > 80;
    const showMed = b.mw > 60 && b.mh > 50;
    const showMin = b.mw > 30 && b.mh > 25;
    const fSize = Math.min(13, Math.max(7, Math.min(b.mw / 8, b.mh / 5)));

    return `
    <g class="estate-block" data-id="${b.id}" style="cursor:pointer;">
      <!-- Fill -->
      <path d="${path}"
        fill="${isInactive ? '#5A5040' : geo.fill}"
        stroke="${geo.stroke}"
        stroke-width="1.8"
        stroke-linejoin="round"
        opacity="${isInactive ? 0.6 : 1}"/>

      <!-- Alert tint overlay -->
      ${isAlert ? `<path d="${path}" fill="${alertOverlay}" pointer-events="none"/>` : ''}

      <!-- Inner vignette (darkens edges, brightens centre — geographic map relief) -->
      <path d="${path}" fill="url(#block-relief-${i})" pointer-events="none" opacity="0.4"/>

      ${showMin ? `
        <!-- Block name label -->
        <text x="${f(cx)}" y="${f(cy - (showFull ? 12 : showMed ? 5 : 0))}"
          text-anchor="middle" dominant-baseline="middle"
          font-family="Georgia,'Times New Roman',serif"
          font-size="${f(fSize)}"
          font-style="italic"
          font-weight="${showFull ? '700' : '600'}"
          fill="${geo.label}"
          paint-order="stroke"
          stroke="${geo.stroke}" stroke-width="2.5"
          letter-spacing="0.04em">
          ${b.name}
        </text>

        ${showMed ? `
          <!-- Acreage + plants sub-label -->
          <text x="${f(cx)}" y="${f(cy + fSize + 2)}"
            text-anchor="middle"
            font-family="Inter,system-ui,sans-serif"
            font-size="${f(Math.max(6.5, fSize * 0.65))}"
            fill="${geo.label}" opacity="0.75"
            paint-order="stroke"
            stroke="${geo.stroke}" stroke-width="1.5">
            ${b.acres} ac · ${Number(b.plant_count || 0).toLocaleString()} trees
          </text>
        ` : ''}

        ${showFull ? `
          <!-- Yield label -->
          <text x="${f(cx)}" y="${f(cy + fSize * 2.4 + 4)}"
            text-anchor="middle"
            font-family="Inter,system-ui,sans-serif"
            font-size="${f(Math.max(6, fSize * 0.58))}"
            fill="${geo.label}" opacity="0.60"
            paint-order="stroke"
            stroke="${geo.stroke}" stroke-width="1.5">
            ${(b.kgProcessed || 0).toLocaleString()} kg
          </text>
        ` : ''}

        <!-- Status / pest risk indicator dot -->
        ${b.status === 'Alert' ? `
          <circle cx="${f(cx - fSize * 2)}" cy="${f(cy - fSize * 2)}" r="4"
            fill="#E07050" stroke="rgba(0,0,0,0.5)" stroke-width="1"/>` : ''}
        <circle cx="${f(b.mx + b.mw - 10)}" cy="${f(b.my + 10)}" r="3.5"
          fill="${riskC}" stroke="rgba(0,0,0,0.4)" stroke-width="1" opacity="0.9"/>
      ` : ''}
    </g>`;
  }).join('');

  // ── Radial gradients for block relief ───────────────────────
  const reliefDefs = laid.map((b, i) => {
    const geo = GEO_PALETTE[i % GEO_PALETTE.length];
    const cx = ((b.mx + b.mw / 2) / MAP_W * 100).toFixed(1) + '%';
    const cy = ((b.my + b.mh / 2) / MAP_H * 100).toFixed(1) + '%';
    return `
    <radialGradient id="block-relief-${i}" cx="${cx}" cy="${cy}" r="70%" gradientUnits="userSpaceOnUse"
      x1="${b.mx}" y1="${b.my}" x2="${b.mx + b.mw}" y2="${b.my + b.mh}">
      <stop offset="0%"   stop-color="rgba(255,255,255,0.10)"/>
      <stop offset="60%"  stop-color="rgba(0,0,0,0.00)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.25)"/>
    </radialGradient>`;
  }).join('');

  // ── Compass rose ─────────────────────────────────────────────
  const compass = `
    <g transform="translate(${MAP_W - 48},${MAP_H - 48})">
      <circle r="22" fill="rgba(20,15,8,0.75)" stroke="rgba(180,155,90,0.6)" stroke-width="1.2"/>
      <polygon points="0,-17,-5,0,0,-6,5,0" fill="#D4B84A"/>
      <polygon points="0,17,-5,0,0,6,5,0"  fill="rgba(180,155,90,0.3)"/>
      <line x1="-17" y1="0" x2="17" y2="0" stroke="rgba(180,155,90,0.3)" stroke-width="0.8"/>
      <text x="0" y="-21" text-anchor="middle" font-size="9" fill="#D4B84A"
        font-weight="900" font-family="Georgia,serif" letter-spacing="0.05em">N</text>
      <text x="0" y="29"  text-anchor="middle" font-size="7" fill="rgba(180,155,90,0.5)"
        font-family="Inter,sans-serif">S</text>
    </g>`;

  // ── Bottom stats bar overlaid on map ─────────────────────────
  const statsBar = `
    <g transform="translate(0,${MAP_H - 38})">
      <rect x="0" y="0" width="${MAP_W}" height="38" fill="rgba(10,8,5,0.72)"/>
      <!-- Stats items -->
      <text x="20" y="15" font-size="7.5" fill="rgba(180,155,90,0.6)"
        font-family="Inter,sans-serif" text-transform="uppercase" letter-spacing="0.1em">ESTATE SUMMARY</text>
      <!-- Item 1 -->
      <text x="20" y="29" font-size="10" font-weight="700" fill="#E8D8A0" font-family="Inter,sans-serif">${totalAcres.toFixed(0)} ac · ${totalPlants.toLocaleString()} plants</text>
      <text x="20" y="38" font-size="7" fill="rgba(180,155,90,0.5)" font-family="Inter,sans-serif">TOTAL · ${farmPlantCapacity.toLocaleString()} CAPACITY</text>
      <line x1="90" y1="20" x2="90" y2="36" stroke="rgba(180,155,90,0.3)" stroke-width="0.8"/>
      <!-- Item 2 -->
      <text x="100" y="29" font-size="11" font-weight="700" fill="#A8D878" font-family="Inter,sans-serif">${activeCount} Active</text>
      <text x="100" y="38" font-size="7" fill="rgba(180,155,90,0.5)" font-family="Inter,sans-serif">of ${blocks.length} blocks</text>
      <line x1="195" y1="20" x2="195" y2="36" stroke="rgba(180,155,90,0.3)" stroke-width="0.8"/>
      <!-- Item 3 -->
      <text x="205" y="29" font-size="11" font-weight="700" fill="#E8D8A0" font-family="Inter,sans-serif">${totalKg.toLocaleString()} kg</text>
      <text x="205" y="38" font-size="7" fill="rgba(180,155,90,0.5)" font-family="Inter,sans-serif">SEASON YIELD</text>
      <line x1="310" y1="20" x2="310" y2="36" stroke="rgba(180,155,90,0.3)" stroke-width="0.8"/>
      ${alertCount > 0 ? `
      <!-- Alert badge -->
      <circle cx="326" cy="27" r="10" fill="rgba(180,60,30,0.4)" stroke="#E07050" stroke-width="1"/>
      <text x="326" y="31" text-anchor="middle" font-size="11" font-weight="800" fill="#E07050" font-family="Inter,sans-serif">${alertCount}</text>
      <text x="342" y="29" font-size="11" font-weight="700" fill="#E07050" font-family="Inter,sans-serif">Alert</text>
      ` : `
      <text x="325" y="29" font-size="11" font-weight="700" fill="#A8D878" font-family="Inter,sans-serif">✓ All Clear</text>`}
    </g>`;

  // ── Legend dots ──────────────────────────────────────────────
  const legend = `
    <g transform="translate(${MAP_W - 130},${PAD + 4})">
      <rect x="0" y="0" width="122" height="58" rx="5"
        fill="rgba(10,8,5,0.72)" stroke="rgba(180,155,90,0.3)" stroke-width="0.8"/>
      <text x="8" y="13" font-size="7" fill="rgba(180,155,90,0.7)"
        font-family="Inter,sans-serif" letter-spacing="0.09em">PEST RISK</text>
      ${[['Clear', '#A8D878'], ['Watch', '#E8C040'], ['Alert', '#E07050']].map(([l, c], i) => `
        <circle cx="16" cy="${25 + i * 12}" r="4" fill="${c}"/>
        <text x="26" y="${29 + i * 12}" font-size="8" fill="rgba(220,200,150,0.75)"
          font-family="Inter,sans-serif">${l}</text>`).join('')}
    </g>`;

  // ── Full SVG ─────────────────────────────────────────────────
  const svgMarkup = `
    <svg id="estate-svg" viewBox="0 0 ${MAP_W} ${MAP_H}" width="100%"
      style="display:block;border-radius:8px;border:2px solid rgba(140,110,50,0.5);">
      <defs>
        <!-- Map background gradient (parchment-dark)-->
        <radialGradient id="mapBg" cx="50%" cy="45%" r="70%">
          <stop offset="0%"   stop-color="#1E1C0F"/>
          <stop offset="100%" stop-color="#0E0C08"/>
        </radialGradient>
        <!-- Subtle vignette edge -->
        <radialGradient id="vignette" cx="50%" cy="50%" r="72%">
          <stop offset="60%"  stop-color="rgba(0,0,0,0)"/>
          <stop offset="100%" stop-color="rgba(0,0,0,0.55)"/>
        </radialGradient>
        ${reliefDefs}
      </defs>

      <!-- Background -->
      <rect width="${MAP_W}" height="${MAP_H}" rx="8" fill="url(#mapBg)"/>

      <!-- Graticule grid lines -->
      ${graticule.join('')}

      <!-- Estate outer boundary -->
      <path d="${estateOutlinePath()}"
        fill="none" stroke="rgba(180,155,90,0.35)" stroke-width="2.5"
        stroke-dasharray="8,5" stroke-linejoin="round"/>

      <!-- Block parcels -->
      ${blockSVGs}

      <!-- Vignette overlay -->
      <rect width="${MAP_W}" height="${MAP_H}" rx="8" fill="url(#vignette)" pointer-events="none"/>

      <!-- Compass -->
      ${compass}

      <!-- Legend -->
      ${legend}

      <!-- Stats bar -->
      ${statsBar}

      <!-- Map title -->
      <text x="${MAP_W / 2}" y="16" text-anchor="middle"
        font-size="8" font-weight="600" letter-spacing="0.2em"
        fill="rgba(180,155,90,0.5)" font-family="Georgia,serif">
        NYAKAMENTA COFFEE ESTATE — BLOCK MAP
      </text>
    </svg>`;

  container.innerHTML = blocks.length === 0
    ? `<div style="height:400px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);background:var(--bg-surface);border:1px solid var(--border);border-radius:8px;">No blocks registered. Go to Block Register to add blocks.</div>`
    : svgMarkup;

  if (!blocks.length) return;

  // ── Hover tooltip ────────────────────────────────────────────
  const tip = document.createElement('div');
  tip.id = 'estate-map-tip';
  tip.style.cssText = `
    position:fixed;pointer-events:none;z-index:9999;display:none;
    width:200px;background:#1A180E;border:1px solid rgba(180,155,90,0.5);
    border-radius:8px;box-shadow:0 8px 30px rgba(0,0,0,0.7);
    overflow:hidden;font-family:Inter,system-ui,sans-serif;`;
  document.body.appendChild(tip);
  const svg2 = container.querySelector('#estate-svg');
  if (svg2) {
    const obs = new MutationObserver(() => { tip.remove(); obs.disconnect(); });
    obs.observe(svg2.parentElement, { childList: true });
  }

  container.querySelectorAll('.estate-block').forEach((el, idx) => {
    const id = el.dataset.id;
    const b = blocks.find(bl => bl.id === id);
    if (!b) return;
    const geo = GEO_PALETTE[idx % GEO_PALETTE.length];
    const sev = blockRisk[id] || 0;
    const rc = sev <= 2 ? '#A8D878' : sev <= 3 ? '#E8C040' : '#E07050';
    const rl = sev <= 2 ? 'Clear' : sev <= 3 ? 'Watch' : 'Alert';
    const kpa = b.acres > 0 ? ((b.kgProcessed || 0) / b.acres).toFixed(0) : '—';
    const yp = ((b.kgProcessed || 0) / maxKg * 100).toFixed(0);

    el.addEventListener('mouseenter', () => {
      tip.innerHTML = `
        <div style="padding:9px 12px 7px;background:${geo.fill};border-bottom:2px solid ${geo.stroke};">
          <div style="font-size:13px;font-weight:700;color:${geo.label};
                      font-family:Georgia,serif;font-style:italic;">${b.name}</div>
          <div style="font-size:8px;color:${geo.label};opacity:0.8;margin-top:1px;text-transform:uppercase;
                      letter-spacing:.07em;">${b.status}</div>
        </div>
        <div style="padding:10px 12px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px;">
          <div>
            <div style="font-size:7px;text-transform:uppercase;letter-spacing:.08em;color:rgba(180,155,90,0.7);">Acreage</div>
            <div style="font-size:18px;font-weight:800;color:#E8D8A0;">${b.acres}<span style="font-size:9px;"> ac</span></div>
          </div>
          <div>
            <div style="font-size:7px;text-transform:uppercase;letter-spacing:.08em;color:rgba(180,155,90,0.7);">Coffee plants</div>
            <div style="font-size:18px;font-weight:800;color:#C8E8A8;">${Number(b.plant_count || 0).toLocaleString()}</div>
          </div>
          <div>
            <div style="font-size:7px;text-transform:uppercase;letter-spacing:.08em;color:rgba(180,155,90,0.7);">Kg/Acre</div>
            <div style="font-size:18px;font-weight:800;color:#D4B84A;">${kpa}</div>
          </div>
          <div style="grid-column:1/-1">
            <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
              <span style="font-size:7px;text-transform:uppercase;letter-spacing:.08em;color:rgba(180,155,90,0.7);">Season Yield</span>
              <span style="font-size:9px;font-weight:700;color:#E8D8A0;">${(b.kgProcessed || 0).toLocaleString()} kg</span>
            </div>
            <div style="height:4px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden;">
              <div style="height:100%;width:${yp}%;background:linear-gradient(90deg,${geo.fill},${geo.stroke.replace('#', '#7')});border-radius:2px;"></div>
            </div>
          </div>
        </div>
        <div style="padding:6px 12px;border-top:1px solid rgba(180,155,90,0.2);
                    display:flex;justify-content:space-between;align-items:center;background:rgba(0,0,0,0.3);">
          <span style="font-size:8px;color:rgba(180,155,90,0.6);">Pest Risk</span>
          <span style="display:flex;align-items:center;gap:4px;font-size:9px;font-weight:700;color:${rc};">
            <span style="width:7px;height:7px;border-radius:50%;background:${rc};display:inline-block;"></span>${rl}${sev ? ` · Sev ${sev}/5` : ''}
          </span>
        </div>`;
      tip.style.display = 'block';
    });
    el.addEventListener('mousemove', e => {
      let l = e.clientX + 16, t = e.clientY + 12;
      if (l + 210 > window.innerWidth - 10) l = e.clientX - 215;
      if (t + 210 > window.innerHeight - 10) t = e.clientY - 215;
      tip.style.left = l + 'px'; tip.style.top = t + 'px';
    });
    el.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
  });
}
