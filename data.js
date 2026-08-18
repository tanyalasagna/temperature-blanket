// data.js — colour scale, API helpers, date utilities (no DOM, no Three.js)

export const COLOUR_SCALE = [
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

export function tempToHex(degC) {
  for (const band of COLOUR_SCALE) {
    if (degC < band.below) return band.hex;
  }
  return COLOUR_SCALE[COLOUR_SCALE.length - 1].hex;
}

export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function shiftDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export const THIS_YEAR = new Date().getFullYear();

export function makeIdleColors() {
  const COUNT = 365, MIN_V = 0x3a, MAX_V = 0x8a, STEP = 7;
  let v = 0x62, s = 1;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
  return Array.from({ length: COUNT }, () => {
    v = Math.max(MIN_V, Math.min(MAX_V, Math.round(v + (rand() - 0.5) * 2 * STEP)));
    const h = v.toString(16).padStart(2, '0');
    return `#${h}${h}${h}`;
  });
}

export async function geocode(placeName) {
  const url = `https://geocoding-api.open-meteo.com/v1/search` +
              `?name=${encodeURIComponent(placeName)}&count=1&language=en&format=json`;
  const res  = await fetch(url);
  if (!res.ok) throw new Error(`Geocoding HTTP ${res.status}`);
  const json = await res.json();
  if (!json.results?.length) throw new Error(`No results for "${placeName}"`);
  const r = json.results[0];
  return { latitude: r.latitude, longitude: r.longitude,
           label: [r.name, r.admin1, r.country].filter(Boolean).join(', ') };
}

export async function fetchArchive(lat, lon, startDate, endDate) {
  const url = `https://archive-api.open-meteo.com/v1/archive` +
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

export function parseDailyData(daily) {
  return daily.time.map((date, i) => {
    const high = daily.temperature_2m_max[i];
    const low  = daily.temperature_2m_min[i];
    const avg  = (high != null && low != null) ? (high + low) / 2 : (high ?? low ?? 0);
    return { date, avg };
  });
}

export function makeSampleData(startDateStr, endDateStr) {
  const days = [];
  let cur    = new Date(startDateStr + 'T12:00:00');
  const end  = new Date(endDateStr   + 'T12:00:00');
  while (cur <= end) {
    const doy      = Math.round((cur - new Date(cur.getFullYear(), 0, 0)) / 86400000);
    const seasonal = 10 * Math.sin((doy / 365) * 2 * Math.PI - Math.PI / 2);
    const noise    = (Math.random() - 0.5) * 6;
    days.push({ date: toISODate(cur), avg: 12 + seasonal + noise });
    cur = shiftDays(cur, 1);
  }
  return days;
}
