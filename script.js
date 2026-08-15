    // -------------------------------------------------------------------------
    // Colour scale — maps average °C to a colour band
    // -------------------------------------------------------------------------
    const WOOL_TEXTURE_URI = 'wool-texture.jpg';

    const COLOUR_SCALE = [
      { below: -20,      hex: '#1a0050', label: '< −20'      },
      { below: -10,      hex: '#0000cd', label: '−20 to −10' },
      { below:   0,      hex: '#4169e1', label: '−10 to 0'   },
      { below:   5,      hex: '#00bfff', label: '0 to 5'     },
      { below:  10,      hex: '#20b2aa', label: '5 to 10'    },
      { below:  15,      hex: '#2e8b57', label: '10 to 15'   },
      { below:  20,      hex: '#9acd32', label: '15 to 20'   },
      { below:  25,      hex: '#ffd700', label: '20 to 25'   },
      { below:  30,      hex: '#ff8c00', label: '25 to 30'   },
      { below:  35,      hex: '#ff4500', label: '30 to 35'   },
      { below: Infinity, hex: '#8b0000', label: '> 35'       },
    ];

    function tempToHex(degC) {
      for (const band of COLOUR_SCALE) {
        if (degC < band.below) return band.hex;
      }
      return COLOUR_SCALE[COLOUR_SCALE.length - 1].hex;
    }

    // ── Animation constants ──
    const REVEAL_SECS         = 1.6;
    const REVEAL_OVERSHOOT    = 1.1;   // back.out strength on clip rect
    const SETTLE_AMPLITUDE    = 1.004; // scaleY peak for post-reveal wobble on rows
    const SWAY_PX             = 6;     // x offset (SVG user units) for horizontal sway
    const DROOP_RATIO         = 0.03;  // peak droop of the reveal curve as a fraction of HEIGHT
    const SHADOW_RY_RATIO     = 0.025; // ry as a fraction of total SVG HEIGHT
    const WOOL_TEXTURE_OPACITY = 0.3;        // was 0.55 — lower to preserve colour saturation
    const WOOL_TEXTURE_BLEND   = 'overlay'; // try 'overlay' or 'soft-light'
    const EDGE_WALK_STEP    = 0.8;  // max offset change per keyframe (SVG units)
    const EDGE_WALK_MAX     = 3;    // max excursion from nominal edge (SVG units)
    const EDGE_WALK_PERIOD  = 12;   // rows between walk keyframes; offsets interpolated
    const SILHOUETTE_WOBBLE = 0.015; // organic outline amplitude (fraction of dimension)
    const RIPPLE_FREQ           = 0.025;  // wave cycles per row — lower = fewer, broader waves
    const RIPPLE_AMPLITUDE      = 14;     // peak horizontal offset (SVG user units)
    const RIPPLE_Y_FRAC         = 0.15;   // vertical offset as fraction of horizontal offset
    const RIPPLE_SECS           = 4.5;    // ripple duration for idle/page-load
    const RIPPLE_SECS_GENERATE  = 2.5;    // shorter ripple for the Generate reveal
    const SHADE_MIN             = 0.82;   // brightness at trough (idle ripple)
    const SHADE_MAX             = 1.15;   // brightness at crest  (idle ripple)
    const GEN_SHADE_MIN         = 0.55;   // widened trough during Generate reveal
    const GEN_SHADE_MAX         = 1.2;    // widened crest  during Generate reveal
    const BLOOM_SECS       = 2.2;   // total time for colour to reach every row
    const BLOOM_SEEDS      = 4;
    const BLOOM_FADE_SECS  = 0.45;  // per-row crossfade duration
    const BLOOM_JITTER     = 0.12;  // arrival-time noise, fraction of BLOOM_SECS
    const BREATHE_AMPLITUDE = 1.5;   // SVG units — subtle idle displacement
    const BREATHE_FREQ      = 0.012; // broad wave: one slow crest down the blanket
    const BREATHE_SECS      = 9;     // seconds per full cycle
    const BREATHE_SHADE     = 0.04;  // brightness swing ±4% — does most of the work
    const SHADOW_BLUR_RATIO   = 0.008; // vertical stdDeviation as a fraction of HEIGHT
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) gsap.globalTimeline.timeScale(200);

    // -------------------------------------------------------------------------
    // Date helpers
    // -------------------------------------------------------------------------
    function toISODate(date) {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    function shiftDays(date, n) {
      const d = new Date(date);
      d.setDate(d.getDate() + n);
      return d;
    }

    // -------------------------------------------------------------------------
    // Year select
    // -------------------------------------------------------------------------
    const THIS_YEAR = new Date().getFullYear();

    function buildYearSelect() {
      const sel = document.getElementById('year-select');
      for (let y = THIS_YEAR; y >= 2000; y--) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        if (y === THIS_YEAR - 1) opt.selected = true;
        sel.appendChild(opt);
      }
      refreshYearNotice();
    }

    function refreshYearNotice() {
      const year   = parseInt(document.getElementById('year-select').value, 10);
      const notice = document.getElementById('year-notice');
      if (year === THIS_YEAR) {
        const safeEnd  = shiftDays(new Date(), -5);
        const dayCount = Math.round((safeEnd - new Date(THIS_YEAR, 0, 1)) / 86400000) + 1;
        notice.textContent =
          `${THIS_YEAR} isn't over yet — showing the ${dayCount} completed days up to ${toISODate(safeEnd)}.`;
      } else {
        notice.textContent = '';
      }
    }

    // -------------------------------------------------------------------------
    // Location autocomplete
    // -------------------------------------------------------------------------
    let pickedLocation = null;
    let debounceTimer  = null;
    let activeOptIdx   = -1;

    function getOpts() {
      return Array.from(document.querySelectorAll('.place-opt'));
    }

    async function onPlaceInput() {
      pickedLocation = null;
      const query = document.getElementById('place-input').value.trim();
      clearTimeout(debounceTimer);
      if (query.length < 2) { closeDropdown(); return; }

      debounceTimer = setTimeout(async () => {
        try {
          const url =
            `https://geocoding-api.open-meteo.com/v1/search` +
            `?name=${encodeURIComponent(query)}&count=6&language=en&format=json`;
          const json = await (await fetch(url)).json();
          populateDropdown(json.results || []);
        } catch { closeDropdown(); }
      }, 280);
    }

    function populateDropdown(results) {
      const dd = document.getElementById('place-dropdown');
      activeOptIdx = -1;
      dd.innerHTML = '';
      if (!results.length) { closeDropdown(); return; }

      results.forEach(r => {
        const label = [r.name, r.admin1, r.country].filter(Boolean).join(', ');
        const div   = document.createElement('div');
        div.className = 'place-opt';
        div.setAttribute('role', 'option');
        div.textContent = label;
        div.addEventListener('mousedown', e => { e.preventDefault(); pickOption(r, label); });
        dd.appendChild(div);
      });
      gsap.killTweensOf(dd);
      dd.style.display = 'block';
      gsap.fromTo(dd, { opacity: 0, y: -4 }, { opacity: 1, y: 0, duration: 0.15, ease: 'power2.out' });
    }

    function pickOption(result, label) {
      pickedLocation = { latitude: result.latitude, longitude: result.longitude, label };
      document.getElementById('place-input').value = label;
      closeDropdown();
    }

    function closeDropdown() {
      const dd = document.getElementById('place-dropdown');
      activeOptIdx = -1;
      if (dd.style.display === 'none') return;
      gsap.killTweensOf(dd);
      gsap.to(dd, {
        opacity: 0, y: -4, duration: 0.12, ease: 'power2.in',
        onComplete: () => { dd.style.display = 'none'; gsap.set(dd, { y: 0 }); },
      });
    }

    function onPlaceKeydown(e) {
      const dd = document.getElementById('place-dropdown');
      if (dd.style.display !== 'block') return;
      const opts = getOpts();

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeOptIdx = Math.min(activeOptIdx + 1, opts.length - 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeOptIdx = Math.max(activeOptIdx - 1, -1);
      } else if (e.key === 'Enter' && activeOptIdx >= 0) {
        e.preventDefault();
        opts[activeOptIdx].dispatchEvent(new MouseEvent('mousedown'));
        return;
      } else if (e.key === 'Escape') {
        closeDropdown(); return;
      }
      opts.forEach((o, i) =>
        o.setAttribute('aria-selected', i === activeOptIdx ? 'true' : 'false'));
    }

    // -------------------------------------------------------------------------
    // Geocoding fallback
    // -------------------------------------------------------------------------
    async function geocode(placeName) {
      const url =
        `https://geocoding-api.open-meteo.com/v1/search` +
        `?name=${encodeURIComponent(placeName)}&count=1&language=en&format=json`;
      const res  = await fetch(url);
      if (!res.ok) throw new Error(`Geocoding HTTP ${res.status}`);
      const json = await res.json();
      if (!json.results?.length) throw new Error(`No results for "${placeName}"`);
      const r = json.results[0];
      return {
        latitude:  r.latitude,
        longitude: r.longitude,
        label: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
      };
    }

    // -------------------------------------------------------------------------
    // Open-Meteo archive API
    // -------------------------------------------------------------------------
    async function fetchArchive(lat, lon, startDate, endDate) {
      const url =
        `https://archive-api.open-meteo.com/v1/archive` +
        `?latitude=${lat}&longitude=${lon}` +
        `&start_date=${startDate}&end_date=${endDate}` +
        `&daily=temperature_2m_max,temperature_2m_min` +
        `&timezone=auto`;
      const res  = await fetch(url);
      if (!res.ok) throw new Error(`Archive API HTTP ${res.status}`);
      const json = await res.json();
      if (!json.daily?.time) throw new Error('Unexpected archive response shape');
      return json.daily;
    }

    function parseDailyData(daily) {
      return daily.time.map((date, i) => {
        const high = daily.temperature_2m_max[i];
        const low  = daily.temperature_2m_min[i];
        const avg  = (high != null && low != null) ? (high + low) / 2 : (high ?? low ?? 0);
        return { date, high, low, avg, sample: false };
      });
    }

    // -------------------------------------------------------------------------
    // Sample data fallback
    // -------------------------------------------------------------------------
    function makeSampleData(startDateStr, endDateStr) {
      const days = [];
      let cur   = new Date(startDateStr + 'T12:00:00');
      const end = new Date(endDateStr   + 'T12:00:00');
      while (cur <= end) {
        const doy      = Math.round((cur - new Date(cur.getFullYear(), 0, 0)) / 86400000);
        const seasonal = 10 * Math.sin((doy / 365) * 2 * Math.PI - Math.PI / 2);
        const noise    = (Math.random() - 0.5) * 6;
        const avg      = 12 + seasonal + noise;
        days.push({
          date:   toISODate(cur),
          high:   avg + 4 + Math.random() * 2,
          low:    avg - 4 - Math.random() * 2,
          avg, sample: true,
        });
        cur = shiftDays(cur, 1);
      }
      return days;
    }

    // -------------------------------------------------------------------------
    function makeIdleRows() {
      const COUNT = 365;
      const MIN_V = 0x3a;  // 58  — darkest grey
      const MAX_V = 0x8a;  // 138 — lightest grey
      const STEP  = 7;
      let v = 0x62;
      let s = 1;
      const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
      return Array.from({ length: COUNT }, () => {
        v = Math.max(MIN_V, Math.min(MAX_V, Math.round(v + (rand() - 0.5) * 2 * STEP)));
        const h = v.toString(16).padStart(2, '0');
        return { fill: `#${h}${h}${h}`, tooltip: null };
      });
    }

    // SVG blanket renderer
    // -------------------------------------------------------------------------
    let blanketTl = null; // module-scope; killed before each new render
    let colourTl  = null; // module-scope; killed before each new colour tween
    let rippleTl  = null; // module-scope; killed before each new ripple
    let breatheTl = null; // module-scope; continuous idle animation, killed by ripple
    let bloomTl   = null; // module-scope; colour-bloom during Generate
    let bloomGeneration = 0;

    function renderBlanket(rowDefs, animate = true) {
      if (blanketTl) { blanketTl.kill(); blanketTl = null; }
      if (colourTl)  { colourTl.kill();  colourTl  = null; }

      const wrap = document.getElementById('blanket-wrap');
      document.getElementById('blanket-svg')?.remove();

      const ROW_H  = 14;
      const WIDTH  = 800;
      const HEIGHT = rowDefs.length * ROW_H;
      const PAD_X  = Math.round(WIDTH * 0.08);           // horizontal inset, ~8 % of WIDTH
      const PAD_Y  = Math.round(PAD_X * HEIGHT / WIDTH); // vertical inset, scaled for viewBox squash
      const totalW = WIDTH + PAD_X * 2;                  // full viewBox width
      const totalH = HEIGHT + PAD_Y * 2;                 // full viewBox height
      const NS     = 'http://www.w3.org/2000/svg';

      // Read tuneable CSS custom properties at render time
      const cs           = getComputedStyle(document.documentElement);
      const woolDisplace = +cs.getPropertyValue('--wool-displace').trim()  || 3;
      const woolFreqX    = +cs.getPropertyValue('--wool-freq-x').trim()    || 0.6;
      const woolFreqY    = +cs.getPropertyValue('--wool-freq-y').trim()    || 0.06;

      const mk = tag => document.createElementNS(NS, tag);
      const at = (el, obj) => {
        Object.entries(obj).forEach(([k, v]) => el.setAttribute(k, v));
        return el;
      };

      // ── SVG root ──
      const svg = at(mk('svg'), {
        id: 'blanket-svg',
        viewBox: `0 0 ${WIDTH + PAD_X * 2} ${HEIGHT + PAD_Y * 2}`,
        preserveAspectRatio: 'none',
      });

      // ── defs ──
      const defs = mk('defs');

      // Wool texture filter — applied once to the group, never per-rect.
      // baseFrequency is asymmetric: high x, low y because preserveAspectRatio:"none"
      // squashes the viewBox ~10:1, so equal pixel-space noise needs ~10:1 frequency ratio.
      const woolFilter = at(mk('filter'), {
        id: 'wool',
        x: '-25%', y: '-5%', width: '150%', height: '110%',
        'color-interpolation-filters': 'linearRGB',
      });
      [
        at(mk('feTurbulence'), {
          type: 'fractalNoise',
          baseFrequency: `${woolFreqX} ${woolFreqY}`,
          numOctaves: '3', seed: '11', result: 'noise',
        }),
        at(mk('feDisplacementMap'), {
          in: 'SourceGraphic', in2: 'noise',
          scale: String(woolDisplace),
          xChannelSelector: 'R', yChannelSelector: 'G', result: 'displaced',
        }),
        // Light asymmetric blur softens displaced yarn edges without smearing colour bands
        at(mk('feGaussianBlur'), { in: 'displaced', stdDeviation: '0.4 0.05' }),
      ].forEach(p => woolFilter.appendChild(p));
      defs.appendChild(woolFilter);

      // Blur filter for the roll-edge shadow ellipse
      const shadowFilter = at(mk('filter'), {
        id: 'shadow-blur',
        x: '-20%', y: '-60%', width: '140%', height: '220%',
      });
      shadowFilter.appendChild(at(mk('feGaussianBlur'), {
        stdDeviation: `6 ${(HEIGHT * SHADOW_BLUR_RATIO).toFixed(1)}`,
      }));
      defs.appendChild(shadowFilter);

      // Soft depth drop shadow applied to the blanket group so it sits on the card
      const dropShadowFilter = at(mk('filter'), {
        id: 'blanket-drop-shadow',
        x: '-25%', y: '-5%', width: '150%', height: '115%',
      });
      dropShadowFilter.appendChild(at(mk('feGaussianBlur'), {
        stdDeviation: `30 ${(HEIGHT * 0.01).toFixed(1)}`,
      }));
      defs.appendChild(dropShadowFilter);

      // Clip path — a <path> whose bottom edge is a quadratic curve, rebuilt each frame.
      const clip = mk('clipPath');
      clip.setAttribute('id', 'blanket-reveal');
      const CLIP_SLOP = RIPPLE_AMPLITUDE * 2;             // per-row deviation from mean ≤ AMPLITUDE
      const fullD =
        `M ${PAD_X - CLIP_SLOP} ${PAD_Y} L ${PAD_X + WIDTH + CLIP_SLOP} ${PAD_Y}` +
        ` L ${PAD_X + WIDTH + CLIP_SLOP} ${PAD_Y + HEIGHT}` +
        ` Q ${PAD_X + WIDTH / 2} ${PAD_Y + HEIGHT} ${PAD_X - CLIP_SLOP} ${PAD_Y + HEIGHT} Z`;
      const clipPathEl = at(mk('path'), { id: 'blanket-clip-path', d: fullD });
      clip.appendChild(clipPathEl);
      defs.appendChild(clip);

      // Silhouette mask — organic outline: rounded corners + gently bowed sides.
      // Applied to shadowWrap so it shapes blanket and its drop shadow together.
      (() => {
        const CRX = WIDTH * 0.01;   // corner radius, horizontal (≈8 SVG units)
        const CRY = HEIGHT * 0.01;  // corner radius, vertical (compensates ~10:1 squash)
        const CP  = 0.5523;         // Bézier coefficient for 90° arc approximation
        let ss = 999;
        const sr = () => { ss = (ss * 1664525 + 1013904223) >>> 0; return ss / 0xffffffff; };
        const wobH = () => (sr() - 0.5) * 2 * HEIGHT * SILHOUETTE_WOBBLE;
        const wobW = () => (sr() - 0.5) * 2 * WIDTH  * SILHOUETTE_WOBBLE;
        const [x0, y0, x1, y1] = [PAD_X - CLIP_SLOP, PAD_Y, PAD_X + WIDTH + CLIP_SLOP, PAD_Y + HEIGHT];
        const eW = WIDTH - 2 * CRX, eH = HEIGHT - 2 * CRY;
        // Two control-point offsets per edge (perpendicular to edge direction)
        const t1 = wobH(), t2 = wobH();  // top    — vertical
        const r1 = wobW(), r2 = wobW();  // right  — horizontal
        const b1 = wobH(), b2 = wobH();  // bottom — vertical
        const l1 = wobW(), l2 = wobW();  // left   — horizontal
        const d = [
          `M ${x0 + CRX} ${y0}`,
          // top edge
          `C ${x0 + CRX + eW / 3} ${y0 + t1}  ${x1 - CRX - eW / 3} ${y0 + t2}  ${x1 - CRX} ${y0}`,
          // TR corner
          `C ${x1 - CRX * (1 - CP)} ${y0}  ${x1} ${y0 + CRY * (1 - CP)}  ${x1} ${y0 + CRY}`,
          // right edge
          `C ${x1 + r1} ${y0 + CRY + eH / 3}  ${x1 + r2} ${y1 - CRY - eH / 3}  ${x1} ${y1 - CRY}`,
          // BR corner
          `C ${x1} ${y1 - CRY * (1 - CP)}  ${x1 - CRX * (1 - CP)} ${y1}  ${x1 - CRX} ${y1}`,
          // bottom edge
          `C ${x1 - CRX - eW / 3} ${y1 + b1}  ${x0 + CRX + eW / 3} ${y1 + b2}  ${x0 + CRX} ${y1}`,
          // BL corner
          `C ${x0 + CRX * (1 - CP)} ${y1}  ${x0} ${y1 - CRY * (1 - CP)}  ${x0} ${y1 - CRY}`,
          // left edge
          `C ${x0 + l1} ${y1 - CRY - eH / 3}  ${x0 + l2} ${y0 + CRY + eH / 3}  ${x0} ${y0 + CRY}`,
          // TL corner
          `C ${x0} ${y0 + CRY * (1 - CP)}  ${x0 + CRX * (1 - CP)} ${y0}  ${x0 + CRX} ${y0}`,
          'Z',
        ].join(' ');
        const silClip = mk('clipPath');
        silClip.setAttribute('id', 'blanket-silhouette');
        silClip.appendChild(at(mk('path'), { d }));
        defs.appendChild(silClip);
      })();

      // Wool texture pattern — tiles across the blanket in SVG coordinate space
      const tileW  = totalW / 8;
      const tileH  = totalH / 8;
      const texPat = at(mk('pattern'), {
        id: 'wool-texture',
        patternUnits: 'userSpaceOnUse',
        width: String(tileW),
        height: String(tileH),
      });
      const texImg = at(mk('image'), {
        href: WOOL_TEXTURE_URI,
        width: String(tileW),
        height: String(tileH),
        preserveAspectRatio: 'none',
      });
      texPat.appendChild(texImg);
      defs.appendChild(texPat);

      svg.appendChild(defs);

      // ── rows group — wool filter + reveal clip; wrapped for depth drop shadow ──
      const rows = at(mk('g'), {
        id: 'blanket-rows',
        'clip-path': 'url(#blanket-reveal)',
        filter: 'url(#wool)',
      });

      // Deterministic edge walk — keyframes every EDGE_WALK_PERIOD rows, linearly
      // interpolated so the silhouette drifts over ~17px rather than jittering per pixel
      let walkSeed = 1;
      const walkRand = () => { walkSeed = (walkSeed * 1664525 + 1013904223) >>> 0; return walkSeed / 0xffffffff; };
      const wclamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
      const N = rowDefs.length;
      const numKeys = Math.ceil(N / EDGE_WALK_PERIOD) + 1;
      let kL = 0, kR = 0;
      const keysL = Array.from({ length: numKeys }, () =>
        (kL = wclamp(kL + (walkRand() - 0.5) * 2 * EDGE_WALK_STEP, -EDGE_WALK_MAX, EDGE_WALK_MAX)));
      const keysR = Array.from({ length: numKeys }, () =>
        (kR = wclamp(kR + (walkRand() - 0.5) * 2 * EDGE_WALK_STEP, -EDGE_WALK_MAX, EDGE_WALK_MAX)));
      const leftOffsets = Array.from({ length: N }, (_, i) => {
        const ki = Math.floor(i / EDGE_WALK_PERIOD);
        return keysL[ki] + (i % EDGE_WALK_PERIOD) / EDGE_WALK_PERIOD * (keysL[ki + 1] - keysL[ki]);
      });
      const rightOffsets = Array.from({ length: N }, (_, i) => {
        const ki = Math.floor(i / EDGE_WALK_PERIOD);
        return keysR[ki] + (i % EDGE_WALK_PERIOD) / EDGE_WALK_PERIOD * (keysR[ki + 1] - keysR[ki]);
      });

      rowDefs.forEach((row, i) => {
        const xLeft  = PAD_X + leftOffsets[i];
        const xRight = PAD_X + WIDTH + rightOffsets[i];
        const w = xRight - xLeft;
        const yTop = PAD_Y + i * ROW_H;
        const rect = at(mk('rect'), {
          x: String(xLeft), y: String(yTop),
          width: String(w), height: String(ROW_H - 1),
          fill: row.fill,
        });
        rect.setAttribute('data-base-x',    String(xLeft));
        rect.setAttribute('data-base-y',    String(yTop));
        rect.setAttribute('data-base-fill', row.fill);
        if (row.tooltip) {
          const tip = mk('title');
          tip.textContent = row.tooltip;
          rect.appendChild(tip);
        }
        rows.appendChild(rect);
        // Paired texture rect — identical geometry, no data-base-x so ripple skips it
        const tRect = at(mk('rect'), {
          x: String(xLeft), y: String(yTop),
          width: String(w), height: String(ROW_H - 1),
          fill: 'url(#wool-texture)', 'pointer-events': 'none',
        });
        tRect.style.mixBlendMode = WOOL_TEXTURE_BLEND;
        tRect.style.filter = 'grayscale(1)';
        tRect.style.opacity = String(WOOL_TEXTURE_OPACITY);
        rows.appendChild(tRect);
      });

      // Static shadow rect: offset, semi-transparent, clipped to silhouette, blurred
      const shadowRect = at(mk('rect'), {
        id: 'blanket-shadow-rect',
        x: String(PAD_X + Math.round(WIDTH * 0.015)),
        y: String(PAD_Y + Math.round(HEIGHT * 0.007)),
        width: String(WIDTH), height: String(HEIGHT),
        fill: '#000', opacity: '0.25',
        'clip-path': 'url(#blanket-silhouette)',
        filter: 'url(#blanket-drop-shadow)',
      });
      svg.appendChild(shadowRect);
      // Silhouette clip wraps rows; no drop shadow filter on this group
      const shadowWrap = at(mk('g'), { 'clip-path': 'url(#blanket-silhouette)' });
      shadowWrap.appendChild(rows);
      svg.appendChild(shadowWrap);

      // ── roll-edge shadow — always in DOM; GSAP animates cy+opacity when motion is allowed ──
      const shadow = at(mk('ellipse'), {
        id: 'blanket-shadow',
        cx: String(PAD_X + WIDTH / 2), cy: String(PAD_Y),
        rx: String(WIDTH * 0.48), ry: String(HEIGHT * SHADOW_RY_RATIO),
        fill: 'rgba(0,0,0,0.18)',
        filter: 'url(#shadow-blur)',
        opacity: prefersReducedMotion ? '0' : '1',
      });
      svg.appendChild(shadow);

      wrap.appendChild(svg);


      if (!animate || prefersReducedMotion) return;

      gsap.set('#blanket-rows', { transformOrigin: 'top' });

      blanketTl = gsap.timeline();

      // Curved reveal: a JS state object drives the clip path and shadow cy each frame.
      // droop = sin(progress * π) * HEIGHT * DROOP_RATIO peaks mid-fall and returns to 0.
      const revealState = { progress: 0 };
      blanketTl.to(revealState, {
        progress: 1,
        duration: REVEAL_SECS,
        ease: `back.out(${REVEAL_OVERSHOOT})`,
        onUpdate() {
          const edgeY = PAD_Y + revealState.progress * HEIGHT;
          const droop = Math.sin(revealState.progress * Math.PI) * HEIGHT * DROOP_RATIO;
          clipPathEl.setAttribute('d',
            `M ${PAD_X - CLIP_SLOP} ${PAD_Y}` +
            ` L ${PAD_X + WIDTH + CLIP_SLOP} ${PAD_Y}` +
            ` L ${PAD_X + WIDTH + CLIP_SLOP} ${edgeY}` +
            ` Q ${PAD_X + WIDTH / 2} ${edgeY + droop} ${PAD_X - CLIP_SLOP} ${edgeY} Z`
          );
          shadow.setAttribute('cy', String(edgeY + droop));
        },
      }, 0);

      // Shadow fade-out
      blanketTl.to(shadow, {
        opacity: 0,
        duration: 0.4,
        ease: 'power1.in',
      }, REVEAL_SECS * 0.7);

      // Horizontal sway: barely-perceptible drift that breaks the rigid vertical wipe
      blanketTl.from('#blanket-rows', {
        x: SWAY_PX,
        duration: 1.2,
        ease: 'power3.out',
      }, 0);

      // Settle wobble: damped oscillation at the tail of the reveal
      blanketTl.from('#blanket-rows', {
        scaleY: SETTLE_AMPLITUDE,
        duration: 0.7,
        ease: 'elastic.out(1, 0.4)',
      }, REVEAL_SECS * 0.92);

    }

    function shadedFill(baseHex, offset) {
      if (!baseHex || baseHex.length !== 7 || baseHex[0] !== '#') return baseHex || '';
      const brightness = 1 + (offset / RIPPLE_AMPLITUDE) * (SHADE_MAX - SHADE_MIN) / 2;
      const r = parseInt(baseHex.slice(1, 3), 16);
      const g = parseInt(baseHex.slice(3, 5), 16);
      const b = parseInt(baseHex.slice(5, 7), 16);
      const c = v => Math.max(0, Math.min(255, Math.round(v * brightness)));
      const h = v => v.toString(16).padStart(2, '0');
      return `#${h(c(r))}${h(c(g))}${h(c(b))}`;
    }

    // shadedFill with explicit shade range and extra brightness multiplier (used for Generate reveal)
    function shadedFillWith(baseHex, offset, shadeMin, shadeMax, extraDim) {
      if (!baseHex || baseHex.length !== 7 || baseHex[0] !== '#') return baseHex || '';
      const brightness = (1 + (offset / RIPPLE_AMPLITUDE) * (shadeMax - shadeMin) / 2) * extraDim;
      const r = parseInt(baseHex.slice(1, 3), 16);
      const g = parseInt(baseHex.slice(3, 5), 16);
      const b = parseInt(baseHex.slice(5, 7), 16);
      const c = v => Math.max(0, Math.min(255, Math.round(v * brightness)));
      const h = v => v.toString(16).padStart(2, '0');
      return `#${h(c(r))}${h(c(g))}${h(c(b))}`;
    }

    function breatheFill(baseHex, offset) {
      if (!baseHex || baseHex.length !== 7 || baseHex[0] !== '#') return baseHex || '';
      const brightness = 1 + (offset / BREATHE_AMPLITUDE) * BREATHE_SHADE;
      const r = parseInt(baseHex.slice(1, 3), 16);
      const g = parseInt(baseHex.slice(3, 5), 16);
      const b = parseInt(baseHex.slice(5, 7), 16);
      const c = v => Math.max(0, Math.min(255, Math.round(v * brightness)));
      const h = v => v.toString(16).padStart(2, '0');
      return `#${h(c(r))}${h(c(g))}${h(c(b))}`;
    }

    function startBreathe() {
      if (prefersReducedMotion) return;
      if (breatheTl) { breatheTl.kill(); breatheTl = null; }
      const dayRects = Array.from(document.querySelectorAll('#blanket-rows rect[data-base-x]'));
      if (!dayRects.length) return;
      const texRects = dayRects.map(r => r.nextElementSibling);
      const N = dayRects.length;
      // Cache base X values once — eliminates per-frame getAttribute reads
      const baseXs = dayRects.map(r => parseFloat(r.getAttribute('data-base-x')));
      // Precompute per-row shade LUT: 16 hex strings spanning 1-BREATHE_SHADE .. 1+BREATHE_SHADE
      const SHADE_STEPS = 16;
      const shadeLookup = dayRects.map(rect => {
        const fill = rect.getAttribute('data-base-fill');
        if (!fill || fill.length !== 7 || fill[0] !== '#') return null;
        const r = parseInt(fill.slice(1, 3), 16);
        const g = parseInt(fill.slice(3, 5), 16);
        const b = parseInt(fill.slice(5, 7), 16);
        const hx = v => v.toString(16).padStart(2, '0');
        const cl = v => Math.max(0, Math.min(255, Math.round(v)));
        return Array.from({ length: SHADE_STEPS }, (_, s) => {
          const brightness = 1 + (s / (SHADE_STEPS - 1) * 2 - 1) * BREATHE_SHADE;
          return `#${hx(cl(r * brightness))}${hx(cl(g * brightness))}${hx(cl(b * brightness))}`;
        });
      });
      const state = { phase: 0 };
      let frame = 0;
      breatheTl = gsap.timeline({ repeat: -1 });
      breatheTl.to(state, {
        phase: Math.PI * 2,
        duration: BREATHE_SECS,
        ease: 'none',
        onUpdate() {
          // Throttle to ~15fps — skip 3 of every 4 frames
          if (++frame % 4 !== 0) return;
          // Read pass: compute all sin values before any DOM writes
          const sinVals = new Float32Array(N);
          let sinSum = 0;
          for (let i = 0; i < N; i++) {
            sinVals[i] = Math.sin(i * BREATHE_FREQ - state.phase);
            sinSum += sinVals[i];
          }
          // Write pass: batch all DOM mutations
          for (let i = 0; i < N; i++) {
            const x = String(baseXs[i] + sinVals[i] * BREATHE_AMPLITUDE);
            dayRects[i].setAttribute('x', x);
            const lut = shadeLookup[i];
            if (lut) {
              const idx = Math.round((sinVals[i] + 1) * 0.5 * (SHADE_STEPS - 1));
              dayRects[i].setAttribute('fill', lut[idx]);
            }
            if (texRects[i]) texRects[i].setAttribute('x', x);
          }
          gsap.set('#blanket-shadow-rect', { x: (sinSum / N * BREATHE_AMPLITUDE * 0.3).toFixed(2) });
        },
      }, 0);
    }

    function rippleRows({ onRowUpdate, onFrame, duration, onComplete } = {}) {
      if (rippleTl)  { rippleTl.kill();  rippleTl  = null; }
      if (breatheTl) { breatheTl.kill(); breatheTl = null; }
      const dayRects = Array.from(document.querySelectorAll('#blanket-rows rect[data-base-x]'));
      if (!dayRects.length) return null;
      const texRects = dayRects.map(r => r.nextElementSibling);
      const N = dayRects.length;
      const state = { phase: 0, amp: 1 };
      rippleTl = gsap.timeline({
        onUpdate() {
          const offsets = dayRects.map((_, i) =>
            Math.sin(i * RIPPLE_FREQ - state.phase) * state.amp * RIPPLE_AMPLITUDE);
          const mean = offsets.reduce((s, o) => s + o, 0) / N;
          dayRects.forEach((rect, i) => {
            onRowUpdate(rect, i, offsets[i]);
            if (texRects[i]) {
              texRects[i].setAttribute('x', rect.getAttribute('x'));
              texRects[i].setAttribute('y', rect.getAttribute('y'));
            }
          });
          if (onFrame) onFrame(state, mean);
        },
        onComplete,
      });
      rippleTl.to(state, { phase: Math.PI * 4, duration, ease: 'none' }, 0);
      rippleTl.to(state, { amp: 0, duration, ease: 'power2.out' }, 0);
      return rippleTl;
    }

    function colourBlanket(days) {
      if (colourTl) { colourTl.kill(); colourTl = null; }

      const rowData = days.map(day => ({
        fill: tempToHex(day.avg),
        tooltip:
          `${day.date}  avg ${day.avg.toFixed(1)} °C` +
          `  (high ${day.high?.toFixed(1) ?? 'n/a'} / low ${day.low?.toFixed(1) ?? 'n/a'})` +
          (day.sample ? '  [sample]' : ''),
      }));

      const dayRects = Array.from(document.querySelectorAll('#blanket-rows rect[data-base-x]'));

      if (dayRects.length === days.length) {
        // Attach/update tooltips before the ripple starts
        dayRects.forEach((rect, i) => {
          let tip = rect.querySelector('title');
          if (!tip) {
            tip = document.createElementNS('http://www.w3.org/2000/svg', 'title');
            rect.appendChild(tip);
          }
          tip.textContent = rowData[i].tooltip;
        });

        if (prefersReducedMotion) {
          dayRects.forEach((rect, i) => {
            rect.setAttribute('fill', rowData[i].fill);
            rect.setAttribute('data-base-fill', rowData[i].fill);
          });
        } else {
          const N = dayRects.length;
          const greyFills = dayRects.map(r => r.getAttribute('data-base-fill'));
          dayRects.forEach((rect, i) => rect.setAttribute('data-base-fill', rowData[i].fill));
          const baseXs = dayRects.map(r => parseFloat(r.getAttribute('data-base-x')));
          const baseYs = dayRects.map(r => parseFloat(r.getAttribute('data-base-y')));

          let lcg = (++bloomGeneration * 2654435761) >>> 0;
          const rand = () => { lcg = (lcg * 1664525 + 1013904223) >>> 0; return lcg / 0xffffffff; };

          const seeds = [];
          for (let attempt = 0; attempt < 2000 && seeds.length < BLOOM_SEEDS; attempt++) {
            const c = Math.floor(rand() * N);
            if (seeds.every(s => Math.abs(s - c) >= 40)) seeds.push(c);
          }
          if (!seeds.length) seeds.push(Math.floor(N / 2));

          let maxDist = 0;
          const dists = new Float32Array(N);
          for (let i = 0; i < N; i++) {
            dists[i] = seeds.reduce((m, s) => Math.min(m, Math.abs(i - s)), Infinity);
            if (dists[i] > maxDist) maxDist = dists[i];
          }
          const arrivalTimes = new Float32Array(N);
          for (let i = 0; i < N; i++) {
            const jitter = (rand() * 2 - 1) * BLOOM_JITTER * BLOOM_SECS;
            arrivalTimes[i] = Math.max(0, (dists[i] / (maxDist || 1)) * BLOOM_SECS + jitter);
          }

          const greyR = new Uint8Array(N), greyG = new Uint8Array(N), greyB = new Uint8Array(N);
          const tgtR  = new Uint8Array(N), tgtG  = new Uint8Array(N), tgtB  = new Uint8Array(N);
          for (let i = 0; i < N; i++) {
            const gf = greyFills[i] || '#808080';
            const tf = rowData[i].fill;
            greyR[i] = parseInt(gf.slice(1,3),16); greyG[i] = parseInt(gf.slice(3,5),16); greyB[i] = parseInt(gf.slice(5,7),16);
            tgtR[i]  = parseInt(tf.slice(1,3),16); tgtG[i]  = parseInt(tf.slice(3,5),16); tgtB[i]  = parseInt(tf.slice(5,7),16);
          }
          const curR = new Uint8Array(N), curG = new Uint8Array(N), curB = new Uint8Array(N);
          for (let i = 0; i < N; i++) { curR[i] = greyR[i]; curG[i] = greyG[i]; curB[i] = greyB[i]; }

          const hx = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');

          const bloomState = { t: 0 };
          const bloomEnd   = BLOOM_SECS + BLOOM_FADE_SECS;
          bloomTl = gsap.timeline();
          bloomTl.to(bloomState, {
            t: bloomEnd, duration: bloomEnd, ease: 'none',
            onUpdate() {
              const t = bloomState.t;
              for (let i = 0; i < N; i++) {
                const a = arrivalTimes[i];
                if (t < a) continue;
                const p = (t - a) / BLOOM_FADE_SECS;
                if (p >= 1) { curR[i] = tgtR[i]; curG[i] = tgtG[i]; curB[i] = tgtB[i]; continue; }
                curR[i] = Math.round(greyR[i] + (tgtR[i] - greyR[i]) * p);
                curG[i] = Math.round(greyG[i] + (tgtG[i] - greyG[i]) * p);
                curB[i] = Math.round(greyB[i] + (tgtB[i] - greyB[i]) * p);
              }
            },
            onComplete() { bloomTl = null; },
          }, 0);

          rippleRows({
            duration: RIPPLE_SECS_GENERATE,
            onFrame(state, mean) {
              const silPath = document.querySelector('#blanket-silhouette path');
              if (silPath) silPath.setAttribute('transform', `translate(${mean.toFixed(2)}, 0)`);
              gsap.set('#blanket-shadow-rect', { x: (mean * 0.2).toFixed(2) });
            },
            onRowUpdate(rect, i, offset) {
              rect.setAttribute('x', String(baseXs[i] + offset));
              rect.setAttribute('y', String(baseYs[i] + offset * RIPPLE_Y_FRAC));
              const br = 1 + (offset / RIPPLE_AMPLITUDE) * (GEN_SHADE_MAX - GEN_SHADE_MIN) / 2;
              rect.setAttribute('fill', `#${hx(curR[i] * br)}${hx(curG[i] * br)}${hx(curB[i] * br)}`);
            },
            onComplete() {
              for (let i = 0; i < N; i++) {
                curR[i] = tgtR[i]; curG[i] = tgtG[i]; curB[i] = tgtB[i];
                dayRects[i].setAttribute('fill', rowData[i].fill);
              }
              if (bloomTl) { bloomTl.kill(); bloomTl = null; }
              document.querySelector('#blanket-silhouette path')?.removeAttribute('transform');
              gsap.set('#blanket-shadow-rect', { x: 0 });
              startBreathe();
            },
          });
        }
      } else {
        // Row count changed — rebuild SVG with final colours, then do a pure displacement ripple
        renderBlanket(rowData, false);
        if (!prefersReducedMotion) {
          const baseXs = Array.from(document.querySelectorAll('#blanket-rows rect[data-base-x]'))
            .map(r => parseFloat(r.getAttribute('data-base-x')));
          const baseYs = Array.from(document.querySelectorAll('#blanket-rows rect[data-base-x]'))
            .map(r => parseFloat(r.getAttribute('data-base-y')));
          rippleRows({
            duration: RIPPLE_SECS_GENERATE,
            onFrame(state, mean) {
              const silPath = document.querySelector('#blanket-silhouette path');
              if (silPath) silPath.setAttribute('transform', `translate(${mean.toFixed(2)}, 0)`);
              gsap.set('#blanket-shadow-rect', { x: (mean * 0.2).toFixed(2) });
            },
            onRowUpdate(rect, i, offset) {
              rect.setAttribute('x', String(baseXs[i] + offset));
              rect.setAttribute('y', String(baseYs[i] + offset * RIPPLE_Y_FRAC));
              rect.setAttribute('fill', shadedFillWith(rect.getAttribute('data-base-fill'), offset, GEN_SHADE_MIN, GEN_SHADE_MAX, 1));
            },
            onComplete() {
              document.querySelector('#blanket-silhouette path')?.removeAttribute('transform');
              gsap.set('#blanket-shadow-rect', { x: 0 });
              startBreathe();
            },
          });
        }
      }
    }

    function renderLegend() {
      const el = document.getElementById('legend');
      el.innerHTML = '';
      for (const band of COLOUR_SCALE) {
        const span = document.createElement('span');
        span.innerHTML =
          `<span class="swatch" style="background:${band.hex}"></span>${band.label}`;
        el.appendChild(span);
      }
    }

    // -------------------------------------------------------------------------
    // Status
    // -------------------------------------------------------------------------
    function setStatus(msg, isError = false) {
      const el = document.getElementById('status');
      gsap.killTweensOf(el);
      gsap.to(el, {
        opacity: 0, duration: 0.08, ease: 'none',
        onComplete: () => {
          el.textContent = msg;
          el.className   = isError ? 'error' : '';
          gsap.to(el, { opacity: 1, duration: 0.15, ease: 'power2.out' });
        },
      });
    }

    // -------------------------------------------------------------------------
    // Generate
    // -------------------------------------------------------------------------
    async function generate() {
      if (blanketTl) { blanketTl.kill(); blanketTl = null; }
      if (colourTl)  { colourTl.kill();  colourTl  = null; }
      if (rippleTl)  { rippleTl.kill();  rippleTl  = null; }
      if (breatheTl) { breatheTl.kill(); breatheTl = null; }
      if (bloomTl)   { bloomTl.kill();   bloomTl   = null; }
      document.querySelectorAll('#blanket-rows rect[data-base-x]').forEach(r => {
        r.setAttribute('x',    r.getAttribute('data-base-x'));
        r.setAttribute('y',    r.getAttribute('data-base-y'));
        const bf = r.getAttribute('data-base-fill');
        if (bf) r.setAttribute('fill', bf);
        const tRect = r.nextElementSibling;
        if (tRect) {
          tRect.setAttribute('x', r.getAttribute('data-base-x'));
          tRect.setAttribute('y', r.getAttribute('data-base-y'));
        }
      });
      document.querySelector('#blanket-silhouette path')?.removeAttribute('transform');
      gsap.set('#blanket-shadow-rect', { x: 0 });
      const placeText = document.getElementById('place-input').value.trim();
      const year      = parseInt(document.getElementById('year-select').value, 10);
      const btn       = document.getElementById('generate-btn');

      if (!placeText) { setStatus('Enter a location first.', true); return; }

      btn.disabled = true;
      document.getElementById('legend').innerHTML = '';

      const startDate = `${year}-01-01`;
      const endDate   = year === THIS_YEAR
        ? toISODate(shiftDays(new Date(), -5))
        : `${year}-12-31`;

      let days, usedSample = false;

      try {
        let loc;
        if (pickedLocation) {
          loc = pickedLocation;
        } else {
          setStatus('Looking up location…');
          loc = await geocode(placeText);
        }
        setStatus(`Fetching ${year} temperatures for ${loc.label}…`);

        const daily = await fetchArchive(loc.latitude, loc.longitude, startDate, endDate);
        days = parseDailyData(daily);
        setStatus(`${loc.label} · ${days.length} days · ${startDate} → ${endDate}`);

      } catch (err) {
        console.warn('Falling back to sample data:', err);
        days       = makeSampleData(startDate, endDate);
        usedSample = true;
        setStatus(`Couldn't fetch data — showing sample instead.`, true);
      }

      colourBlanket(days);
      renderLegend();
      if (blanketTl) {
        blanketTl.from('#legend span', {
          opacity: 0, y: 6, stagger: 0.03, duration: 0.25, ease: 'power2.out',
        }, 0.6);
      }
      btn.disabled = false;
    }

    // -------------------------------------------------------------------------
    // Wire up
    // -------------------------------------------------------------------------
    buildYearSelect();
    renderBlanket(makeIdleRows(), false);
    if (!prefersReducedMotion) {
      gsap.set('#blanket-rows', { opacity: 0 });
      gsap.to('#blanket-rows', { opacity: 1, duration: 0.5, ease: 'power1.out' });
      rippleRows({
        duration: RIPPLE_SECS,
        onFrame(state, mean) {
          const silPath = document.querySelector('#blanket-silhouette path');
          if (silPath) silPath.setAttribute('transform', `translate(${mean.toFixed(2)}, 0)`);
          gsap.set('#blanket-shadow-rect', { x: (mean * 0.2).toFixed(2) });
        },
        onRowUpdate(rect, i, offset) {
          rect.setAttribute('x', String(parseFloat(rect.getAttribute('data-base-x')) + offset));
          rect.setAttribute('y', String(parseFloat(rect.getAttribute('data-base-y')) + offset * RIPPLE_Y_FRAC));
          rect.setAttribute('fill', shadedFill(rect.getAttribute('data-base-fill'), offset));
        },
        onComplete() {
          document.querySelector('#blanket-silhouette path')?.removeAttribute('transform');
          gsap.set('#blanket-shadow-rect', { x: 0 });
          startBreathe();
        },
      });
    }

    document.getElementById('generate-btn').addEventListener('click', generate);
    document.getElementById('year-select').addEventListener('change', refreshYearNotice);

    document.getElementById('view-more-btn').addEventListener('click', () => {
      alert('More blankets coming soon!');
    });

    const noteModal    = document.getElementById('note-modal');
    const noteModalBox = document.getElementById('note-modal-box');

    function openModal() {
      noteModal.classList.add('open');
      gsap.fromTo(noteModal,    { opacity: 0 },    { opacity: 1, duration: 0.2,  ease: 'power2.out' });
      gsap.fromTo(noteModalBox, { scale: 0.96 }, { scale: 1,  duration: 0.25, ease: 'back.out(1.5)' });
    }
    function closeModal() {
      gsap.to(noteModal,    { opacity: 0, duration: 0.15, ease: 'power2.in',
        onComplete: () => noteModal.classList.remove('open') });
      gsap.to(noteModalBox, { scale: 0.96, duration: 0.15, ease: 'power2.in',
        onComplete: () => gsap.set(noteModalBox, { scale: 1 }) });
    }

    document.getElementById('designer-note-btn').addEventListener('click', openModal);
    document.getElementById('note-modal-close').addEventListener('click', closeModal);
    noteModal.addEventListener('click', e => { if (e.target === noteModal) closeModal(); });

    const genBtn = document.getElementById('generate-btn');
    genBtn.addEventListener('pointerdown',  () => gsap.to(genBtn, { scale: 0.97, duration: 0.10, ease: 'power2.out' }));
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(evt =>
      genBtn.addEventListener(evt, () => gsap.to(genBtn, { scale: 1, duration: 0.15, ease: 'power2.out' }))
    );

    const placeEl = document.getElementById('place-input');
    placeEl.addEventListener('input',   onPlaceInput);
    placeEl.addEventListener('keydown', onPlaceKeydown);
    placeEl.addEventListener('blur',    () => setTimeout(closeDropdown, 160));