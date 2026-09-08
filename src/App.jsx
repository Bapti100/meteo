import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Sun, Cloud, CloudRain, CloudDrizzle, CloudSnow, CloudFog, CloudLightning,
  Search, Settings as SettingsIcon, Map as MapIcon, Table as TableIcon,
  Home, Plus, Trash2, Star, ChevronRight, ChevronDown, Play, Pause, Info, AlertTriangle
} from 'lucide-react';
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Bar
} from 'recharts';

/* ============================================================
   DONNÉES RÉELLES — API Open-Meteo (gratuite, sans clé, CORS ok)
   ------------------------------------------------------------
   - AROME : meteofrance_arome_france_hd (France, haute résolution, ~4 jours)
   - « WRF » : le WRF n'est pas proposé en accès libre par Météo-France ;
     on utilise ICON-EU (DWD), un modèle régional européen comparable
     en résolution/portée, comme relais entre AROME et GFS.
   - GFS : gfs_seamless (NOAA, portée longue)
   - Diagramme d'ensemble : API ensemble Open-Meteo (icon_d2 / icon_eu /
     gfs_seamless selon l'onglet). Le produit PE-AROME de Météo-France
     n'est pas disponible en accès gratuit, ceci est l'équivalent le
     plus proche.
   - Radar : reste une estimation schématique (une vraie mosaïque radar
     nécessite une autre source de données, non couverte ici).
   ============================================================ */

const MODELS = ['AROME', 'ICON-EU', 'GFS'];
const MODEL_API = { AROME: 'meteofrance_arome_france_hd', 'ICON-EU': 'icon_eu', GFS: 'gfs_seamless' };
const ENSEMBLE_API = { AROME: 'icon_d2', 'ICON-EU': 'icon_eu', GFS: 'gfs_seamless' };
const MODEL_DAYS = { AROME: 4, 'ICON-EU': 5, GFS: 10 };

const MODEL_INFO = {
  AROME: {
    color: '#2f6fd1', resolution: '1.3 km', portee: '0–42 h',
    desc: "Modèle français à haute résolution (Météo-France, via Open-Meteo). Très fiable à courte échéance.",
  },
  'ICON-EU': {
    color: '#1f9d6b', resolution: '~7 km', portee: '42–84 h',
    desc: "Modèle régional européen (DWD ICON-EU), utilisé comme relais entre AROME et GFS — le WRF n'étant pas disponible en accès gratuit.",
  },
  GFS: {
    color: '#c2720c', resolution: '~25 km', portee: '84 h–10 j',
    desc: "Modèle global (NOAA GFS). Portée longue mais résolution plus grossière : fiabilité décroissante après 3-4 jours.",
  },
};

const CITY_DB = [
  { name: 'Strasbourg', lat: 48.58, lon: 7.75 },
  { name: 'Paris', lat: 48.85, lon: 2.35 },
  { name: 'Lyon', lat: 45.76, lon: 4.83 },
  { name: 'Marseille', lat: 43.30, lon: 5.37 },
  { name: 'Chamonix', lat: 45.92, lon: 6.87 },
  { name: 'Annecy', lat: 45.90, lon: 6.13 },
  { name: 'Grenoble', lat: 45.19, lon: 5.72 },
  { name: 'Toulouse', lat: 43.60, lon: 1.44 },
  { name: 'Bordeaux', lat: 44.84, lon: -0.58 },
  { name: 'Nantes', lat: 47.22, lon: -1.55 },
  { name: 'Lille', lat: 50.63, lon: 3.06 },
  { name: 'Nice', lat: 43.70, lon: 7.27 },
  { name: 'Rennes', lat: 48.11, lon: -1.68 },
  { name: 'Metz', lat: 49.12, lon: 6.18 },
  { name: 'Besançon', lat: 47.24, lon: 6.02 },
  { name: 'Clermont-Ferrand', lat: 45.78, lon: 3.09 },
  { name: 'Montpellier', lat: 43.61, lon: 3.88 },
  { name: 'Biarritz', lat: 43.48, lon: -1.56 },
  { name: 'Colmar', lat: 48.08, lon: 7.36 },
  { name: 'Gap', lat: 44.56, lon: 6.08 },
];

const DIR_NAMES = ['Nord', 'Nord-Nord-Est', 'Nord-Est', 'Est-Nord-Est', 'Est', 'Est-Sud-Est', 'Sud-Est', 'Sud-Sud-Est',
  'Sud', 'Sud-Sud-Ouest', 'Sud-Ouest', 'Ouest-Sud-Ouest', 'Ouest', 'Ouest-Nord-Ouest', 'Nord-Ouest', 'Nord-Nord-Ouest'];
function windDirFull(deg) { return `${DIR_NAMES[Math.round(deg / 22.5) % 16]} : ${deg}°`; }
function windDirShort(deg) {
  const s = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  return s[Math.round(deg / 45) % 8];
}

/* --- Codes météo WMO (utilisés par Open-Meteo) --- */
function wmoInfo(code) {
  const map = {
    0: ['Ciel clair', Sun], 1: ['Peu nuageux', Sun], 2: ['Voilé', CloudFog], 3: ['Couvert', Cloud],
    45: ['Brouillard', CloudFog], 48: ['Brouillard givrant', CloudFog],
    51: ['Bruine faible', CloudDrizzle], 53: ['Bruine', CloudDrizzle], 55: ['Bruine forte', CloudDrizzle],
    56: ['Bruine verglaçante', CloudDrizzle], 57: ['Bruine verglaçante forte', CloudDrizzle],
    61: ['Pluie faible', CloudRain], 63: ['Pluie modérée', CloudRain], 65: ['Pluie forte', CloudRain],
    66: ['Pluie verglaçante', CloudRain], 67: ['Pluie verglaçante forte', CloudRain],
    71: ['Neige faible', CloudSnow], 73: ['Neige', CloudSnow], 75: ['Neige forte', CloudSnow], 77: ['Neige en grains', CloudSnow],
    80: ['Averses faibles', CloudRain], 81: ['Averses modérées', CloudRain], 82: ['Averses violentes', CloudRain],
    85: ['Averses de neige', CloudSnow], 86: ['Averses de neige fortes', CloudSnow],
    95: ['Orage', CloudLightning], 96: ['Orage avec grêle', CloudLightning], 99: ['Orage violent avec grêle', CloudLightning],
  };
  const [text, Icon] = map[code] || ['Indisponible', Cloud];
  return { text, Icon };
}

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return h;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- Appels API Open-Meteo ---------------- */
function dayKeyOf(t) { return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; }

function resolveWeatherCode(rawCode, cloud, precip) {
  if (rawCode != null && !Number.isNaN(rawCode)) return rawCode;
  if (precip > 2) return 65;
  if (precip > 0.5) return 63;
  if (precip > 0) return 61;
  if (cloud == null) return null;
  if (cloud > 75) return 3;
  if (cloud > 35) return 2;
  if (cloud > 15) return 1;
  return 0;
}

async function fetchForecast(loc, modelKey, days) {
  const modelParam = MODEL_API[modelKey];
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&hourly=temperature_2m,precipitation,weathercode,cloud_cover,windspeed_10m,winddirection_10m,windgusts_10m,relativehumidity_2m,pressure_msl&models=${modelParam}&forecast_days=${days}&timezone=auto`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.error) throw new Error(json.reason || `${modelKey} indisponible pour cette zone`);
  const h = json.hourly;
  const rows = [];
  for (let i = 0; i < h.time.length; i++) {
    const t = new Date(h.time[i]);
    const precip = h.precipitation ? (h.precipitation[i] ?? 0) : 0;
    const cloud = h.cloud_cover ? h.cloud_cover[i] : null;
    const rawCode = h.weathercode ? h.weathercode[i] : null;
    rows.push({
      t, hour: t.getHours(), dayKey: dayKeyOf(t),
      dayLabel: t.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }),
      temp: h.temperature_2m[i], precip, weathercode: resolveWeatherCode(rawCode, cloud, precip),
      windMoy: Math.round(h.windspeed_10m?.[i] ?? 0), windRaf: Math.round(h.windgusts_10m?.[i] ?? 0),
      windDir: Math.round(h.winddirection_10m?.[i] ?? 0), humidity: Math.round(h.relativehumidity_2m?.[i] ?? 0),
      pressure: (h.pressure_msl && h.pressure_msl[i] != null) ? Math.round(h.pressure_msl[i]) : null,
    });
  }
  const now = new Date(); now.setMinutes(0, 0, 0);
  const startIdx = rows.findIndex((r) => r.t.getTime() >= now.getTime());
  return startIdx >= 0 ? rows.slice(startIdx) : rows;
}

async function fetchBlendedTimeline(loc) {
  const settled = await Promise.allSettled([
    fetchForecast(loc, 'AROME', MODEL_DAYS.AROME),
    fetchForecast(loc, 'ICON-EU', MODEL_DAYS['ICON-EU']),
    fetchForecast(loc, 'GFS', MODEL_DAYS.GFS),
  ]);
  const [aromeR, iconR, gfsR] = settled;
  const arome = aromeR.status === 'fulfilled' ? aromeR.value : [];
  const icon = iconR.status === 'fulfilled' ? iconR.value : [];
  const gfs = gfsR.status === 'fulfilled' ? gfsR.value : [];
  const errors = settled
    .map((r, i) => (r.status === 'rejected' ? `${MODELS[i]} : ${r.reason.message}` : null))
    .filter(Boolean);

  const rows = [];
  const n1 = Math.min(42, arome.length);
  for (let i = 0; i < n1; i++) rows.push({ ...arome[i], model: i === 0 ? 'AROME' : null, phase: 'arome' });
  const n2 = Math.min(84, icon.length);
  for (let i = n1; i < n2; i++) rows.push({ ...icon[i], model: i === n1 ? 'ICON-EU' : null, phase: 'icon' });
  let dailyStarted = false;
  for (let i = n2; i < gfs.length; i++) {
    const r = gfs[i];
    if ([2, 8, 14, 20].includes(r.hour)) {
      rows.push({ ...r, model: !dailyStarted ? 'GFS' : null, phase: 'gfs-daily' });
      dailyStarted = true;
    }
  }
  let prevDay = null;
  rows.forEach((r) => { r.isNewDay = r.dayKey !== prevDay; prevDay = r.dayKey; });
  return { rows, errors };
}

async function fetchEnsemble(loc, modelKey) {
  const modelParam = ENSEMBLE_API[modelKey];
  const url = `https://ensemble-api.open-meteo.com/v1/ensemble?latitude=${loc.lat}&longitude=${loc.lon}&hourly=temperature_850hPa,temperature_500hPa,precipitation&models=${modelParam}&forecast_days=3&timezone=auto`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.error) throw new Error(json.reason || 'Ensemble indisponible pour cette zone');
  const h = json.hourly;
  const time = h.time;
  const membersFor = (base) => Object.keys(h).filter((k) => k.startsWith(base)).sort();
  const keys850 = membersFor('temperature_850hPa');
  const keys500 = membersFor('temperature_500hPa');
  const keysPrecip = membersFor('precipitation');
  const now = new Date(); now.setMinutes(0, 0, 0);
  let startIdx = time.findIndex((tStr) => new Date(tStr).getTime() >= now.getTime());
  if (startIdx < 0) startIdx = 0;
  const hoursToShow = Math.min(45, time.length - startIdx);
  const rows = [];
  for (let off = 0; off < hoursToShow; off++) {
    const i = startIdx + off;
    const vals850 = keys850.map((k) => h[k][i]).filter((v) => v != null);
    const vals500 = keys500.map((k) => h[k][i]).filter((v) => v != null);
    const valsPrecip = keysPrecip.map((k) => h[k][i]).filter((v) => v != null);
    const mean850 = vals850.reduce((a, b) => a + b, 0) / (vals850.length || 1);
    const mean500 = vals500.reduce((a, b) => a + b, 0) / (vals500.length || 1);
    const row = {
      hour: off, control850: vals850[0], control500: vals500[0],
      mean850: Math.round(mean850 * 10) / 10, mean500: Math.round(mean500 * 10) / 10,
      precip: Math.round((valsPrecip.reduce((a, b) => a + b, 0) / (valsPrecip.length || 1)) * 10) / 10,
      snow: mean850 < 1,
    };
    vals850.slice(0, 8).forEach((v, idx) => { row['m850_' + idx] = v; });
    vals500.slice(0, 8).forEach((v, idx) => { row['m500_' + idx] = v; });
    rows.push(row);
  }
  return rows;
}

function aggregateDaily(hourly) {
  const byDay = {};
  hourly.forEach((r) => {
    if (!byDay[r.dayKey]) byDay[r.dayKey] = { dayKey: r.dayKey, dayLabel: r.dayLabel, temps: [], precip: 0, codes: {} };
    byDay[r.dayKey].temps.push(r.temp);
    byDay[r.dayKey].precip += r.precip;
    byDay[r.dayKey].codes[r.weathercode] = (byDay[r.dayKey].codes[r.weathercode] || 0) + 1;
  });
  return Object.values(byDay).map((d) => {
    const dominant = Object.entries(d.codes).sort((a, b) => b[1] - a[1])[0][0];
    return {
      dayKey: d.dayKey, dayLabel: d.dayLabel,
      tmin: Math.round(Math.min(...d.temps)), tmax: Math.round(Math.max(...d.temps)),
      precip: Math.round(d.precip * 10) / 10, weathercode: parseInt(dominant, 10),
    };
  });
}

/* --- petit hook pour données asynchrones --- */
function useAsync(fn, deps) {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, data: null });
    fn().then((d) => { if (!cancelled) setState({ loading: false, error: null, data: d }); })
      .catch((e) => { if (!cancelled) setState({ loading: false, error: e.message || 'Erreur', data: null }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

const C = { bg: '#ffffff', panel: '#f6f7f9', border: '#e3e6ea', border2: '#d7dbe1', text: '#1a1f26', muted: '#6b7280' };

export default function App() {
  const [locations, setLocations] = useState([
    { id: 'strasbourg', name: 'Strasbourg', lat: 48.58, lon: 7.75, main: true },
    { id: 'annecy', name: 'Annecy', lat: 45.90, lon: 6.13, main: false },
    { id: 'chamonix', name: 'Chamonix', lat: 45.92, lon: 6.87, main: false },
  ]);
  const [view, setView] = useState('dashboard');
  const mainLoc = locations.find((l) => l.main) || locations[0];
  const [dashLoc, setDashLoc] = useState(mainLoc);

  useEffect(() => { setDashLoc(mainLoc); }, [mainLoc?.id]);

  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: "'Inter', system-ui, sans-serif", color: C.text }}>
      <style>{`
        * { box-sizing: border-box; }
        .mono { font-family: 'JetBrains Mono', ui-monospace, Menlo, monospace; }
        ::-webkit-scrollbar { height: 6px; width: 6px; }
        ::-webkit-scrollbar-thumb { background: #d7dbe1; border-radius: 3px; }
        button { font-family: inherit; }
        input::placeholder { color: #9aa3ad; }
      `}</style>
      <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100vh', display: 'flex', flexDirection: 'column', position: 'relative', borderLeft: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}` }}>
        <div style={{ flex: 1, paddingBottom: 72 }}>
          {view === 'dashboard' && (
            <Dashboard
              locations={locations} dashLoc={dashLoc} setDashLoc={setDashLoc}
              onSaveLocation={(loc) => {
                if (locations.some((l) => l.name === loc.name)) return;
                setLocations([...locations, { ...loc, id: loc.name.toLowerCase().replace(/\s+/g, '-'), main: false }]);
              }}
              isSaved={locations.some((l) => l.name === dashLoc.name)}
            />
          )}
          {view === 'compare' && <ComparePage locations={locations} />}
          {view === 'radar' && <RadarPage locations={locations} />}
          {view === 'settings' && <SettingsPage locations={locations} setLocations={setLocations} />}
        </div>
        <BottomNav view={view} setView={setView} />
      </div>
    </div>
  );
}

/* ---------------- Composants utilitaires ---------------- */
function Loading({ label }) {
  return <div style={{ padding: '20px 16px', fontSize: 12.5, color: C.muted }}>{label || 'Chargement…'}</div>;
}
function ErrorBox({ message }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '8px 16px', padding: 10, background: '#fdf2f2', border: '1px solid #f3c6c6', borderRadius: 6, color: '#a13333', fontSize: 12 }}>
      <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{message}</span>
    </div>
  );
}

/* ---------------- Navigation basse ---------------- */
function BottomNav({ view, setView }) {
  const items = [
    { id: 'dashboard', label: 'Prévisions', Icon: Home },
    { id: 'compare', label: 'Comparatif', Icon: TableIcon },
    { id: 'radar', label: 'Radar', Icon: MapIcon },
    { id: 'settings', label: 'Réglages', Icon: SettingsIcon },
  ];
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
      width: '100%', maxWidth: 480, display: 'flex', background: '#ffffff',
      borderTop: `1px solid ${C.border}`, zIndex: 20, boxShadow: '0 -2px 8px rgba(20,25,35,0.04)',
    }}>
      {items.map(({ id, label, Icon }) => {
        const active = view === id;
        return (
          <button key={id} onClick={() => setView(id)} style={{
            flex: 1, background: 'none', border: 'none', padding: '10px 4px 8px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            color: active ? '#2f6fd1' : '#9aa3ad', cursor: 'pointer',
          }}>
            <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
            <span style={{ fontSize: 10.5, letterSpacing: 0.2 }}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- Recherche de ville ---------------- */
function CitySearch({ onPick, placeholder }) {
  const [q, setQ] = useState('');
  const [lat, setLat] = useState(''); const [lon, setLon] = useState('');
  const [mode, setMode] = useState('ville');
  const results = q.length > 0
    ? CITY_DB.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())).slice(0, 6)
    : [];
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: 10 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {['ville', 'coordonnées'].map((m) => (
          <button key={m} onClick={() => setMode(m)} style={{
            fontSize: 11.5, padding: '4px 10px', borderRadius: 4, border: `1px solid ${C.border2}`,
            background: mode === m ? '#e9edf3' : 'transparent', color: mode === m ? C.text : C.muted, cursor: 'pointer',
          }}>{m === 'ville' ? 'Par ville' : 'Par coordonnées'}</button>
        ))}
      </div>
      {mode === 'ville' ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${C.border2}`, borderRadius: 4, padding: '6px 8px', background: '#fff' }}>
            <Search size={14} color={C.muted} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder || 'Rechercher une ville…'}
              style={{ background: 'none', border: 'none', outline: 'none', color: C.text, fontSize: 13, width: '100%' }} />
          </div>
          {results.length > 0 && (
            <div style={{ marginTop: 6 }}>
              {results.map((c) => (
                <button key={c.name} onClick={() => { onPick(c); setQ(''); }} style={{
                  display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center',
                  background: 'none', border: 'none', borderTop: `1px solid ${C.border}`, color: C.text,
                  padding: '7px 4px', fontSize: 13, cursor: 'pointer', textAlign: 'left',
                }}>
                  {c.name} <span className="mono" style={{ fontSize: 10.5, color: C.muted }}>{c.lat.toFixed(2)}, {c.lon.toFixed(2)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="Latitude" className="mono"
            style={{ flex: 1, background: '#fff', border: `1px solid ${C.border2}`, borderRadius: 4, padding: '6px 8px', color: C.text, fontSize: 12.5 }} />
          <input value={lon} onChange={(e) => setLon(e.target.value)} placeholder="Longitude" className="mono"
            style={{ flex: 1, background: '#fff', border: `1px solid ${C.border2}`, borderRadius: 4, padding: '6px 8px', color: C.text, fontSize: 12.5 }} />
          <button onClick={() => {
            const la = parseFloat(lat), lo = parseFloat(lon);
            if (!isNaN(la) && !isNaN(lo)) { onPick({ name: `${la.toFixed(2)}, ${lo.toFixed(2)}`, lat: la, lon: lo }); setLat(''); setLon(''); }
          }} style={{ background: '#e9edf3', border: `1px solid ${C.border2}`, borderRadius: 4, padding: '0 12px', color: C.text, fontSize: 12.5, cursor: 'pointer' }}>OK</button>
        </div>
      )}
    </div>
  );
}

/* ---------------- Page Dashboard ---------------- */
function Dashboard({ locations, dashLoc, setDashLoc, onSaveLocation, isSaved }) {
  const [model, setModel] = useState('AROME');
  const [showSearch, setShowSearch] = useState(false);
  const [showEnsemble, setShowEnsemble] = useState(false);

  const chartState = useAsync(() => fetchForecast(dashLoc, model, MODEL_DAYS[model]), [dashLoc.lat, dashLoc.lon, model]);
  const timelineState = useAsync(() => fetchBlendedTimeline(dashLoc), [dashLoc.lat, dashLoc.lon]);
  const ensembleState = useAsync(
    () => (showEnsemble ? fetchEnsemble(dashLoc, model) : Promise.resolve(null)),
    [dashLoc.lat, dashLoc.lon, model, showEnsemble]
  );

  const hourly = chartState.data || [];
  const timeline = timelineState.data?.rows || [];
  const timelineErrors = timelineState.data?.errors || [];
  const ensemble = ensembleState.data || [];
  const firstDailyIdx = timeline.findIndex((r) => r.phase === 'gfs-daily');

  return (
    <div>
      <div style={{ padding: '16px 16px 10px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 0.5, color: C.muted }}>Prévisions pour</div>
            <div style={{ fontSize: 22, fontWeight: 600 }}>{dashLoc.name}</div>
            <div className="mono" style={{ fontSize: 11, color: C.muted }}>{dashLoc.lat.toFixed(2)}°, {dashLoc.lon.toFixed(2)}°</div>
          </div>
          <button onClick={() => setShowSearch((s) => !s)} style={{
            background: C.panel, border: `1px solid ${C.border2}`, borderRadius: 6, padding: 8, color: C.text, cursor: 'pointer',
          }}><Search size={16} /></button>
        </div>
        {showSearch && (
          <div style={{ marginTop: 10 }}>
            <CitySearch onPick={(c) => { setDashLoc(c); setShowSearch(false); }} />
          </div>
        )}
        {!isSaved && (
          <button onClick={() => onSaveLocation(dashLoc)} style={{
            marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, background: 'none',
            border: `1px dashed ${C.border2}`, borderRadius: 5, padding: '6px 10px', color: C.muted, fontSize: 12, cursor: 'pointer',
          }}><Plus size={13} /> Ajouter aux villes suivies</button>
        )}
      </div>

      {/* Sélecteur de modèle */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}` }}>
        {MODELS.map((m) => {
          const active = model === m;
          return (
            <button key={m} onClick={() => setModel(m)} style={{
              flex: 1, padding: '10px 4px', background: 'none', border: 'none',
              borderBottom: active ? `2px solid ${MODEL_INFO[m].color}` : '2px solid transparent',
              color: active ? C.text : C.muted, fontWeight: active ? 600 : 500, fontSize: 13.5, cursor: 'pointer',
            }}>{m}</button>
          );
        })}
      </div>
      <div style={{ padding: '10px 16px', display: 'flex', gap: 8, alignItems: 'flex-start', background: C.panel, borderBottom: `1px solid ${C.border}` }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: MODEL_INFO[model].color, marginTop: 5, flexShrink: 0 }} />
        <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.4 }}>
          <span className="mono" style={{ color: C.text }}>Résolution {MODEL_INFO[model].resolution} · Portée {MODEL_INFO[model].portee}</span><br />
          {MODEL_INFO[model].desc}
        </div>
      </div>

      {/* Graphique température / précipitations (modèle sélectionné) */}
      <div style={{ padding: '14px 8px 4px 0', marginLeft: 8 }}>
        <div style={{ fontSize: 12.5, fontWeight: 500, marginLeft: 8, marginBottom: 2 }}>Courbe {model}</div>
        {chartState.loading && <Loading />}
        {chartState.error && <ErrorBox message={`${model} : ${chartState.error}`} />}
        {!chartState.loading && !chartState.error && (
          <ResponsiveContainer width="100%" height={190}>
            <ComposedChart data={hourly.slice(0, 48)} margin={{ top: 4, right: 12, left: -18, bottom: 0 }}>
              <CartesianGrid stroke={C.border} vertical={false} />
              <XAxis dataKey="hour" tick={{ fontSize: 9.5, fill: C.muted }} interval={3} tickLine={false} axisLine={{ stroke: C.border2 }} />
              <YAxis yAxisId="temp" tick={{ fontSize: 9.5, fill: C.muted }} tickLine={false} axisLine={false} width={28} />
              <YAxis yAxisId="precip" orientation="right" tick={{ fontSize: 9.5, fill: C.muted }} tickLine={false} axisLine={false} width={22} />
              <Tooltip contentStyle={{ background: '#fff', border: `1px solid ${C.border2}`, fontSize: 11, borderRadius: 4 }} labelStyle={{ color: C.muted }} />
              <Bar yAxisId="precip" dataKey="precip" fill="#2f8fce" opacity={0.45} radius={[2, 2, 0, 0]} />
              <Line yAxisId="temp" type="monotone" dataKey="temp" stroke={MODEL_INFO[model].color} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Diagramme d'ensemble */}
      <div style={{ margin: '4px 16px 18px', border: `1px solid ${C.border}`, borderRadius: 6, background: C.panel }}>
        <button onClick={() => setShowEnsemble((s) => !s)} style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'none', border: 'none', padding: '11px 14px', color: C.text, cursor: 'pointer',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 500 }}>
            <Info size={14} color={C.muted} /> Diagramme d'ensemble — {model}
          </span>
          <ChevronRight size={15} style={{ transform: showEnsemble ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} color={C.muted} />
        </button>
        {showEnsemble && (
          <div style={{ padding: '0 10px 14px' }}>
            <div style={{ fontSize: 11, color: C.muted, padding: '0 4px 8px', lineHeight: 1.4 }}>
              Ensemble {ENSEMBLE_API[model]} (Open-Meteo) — le produit PE-AROME de Météo-France n'étant pas
              disponible gratuitement, ceci est l'équivalent le plus proche. Plus les traces fines divergent,
              moins la prévision est fiable.
            </div>
            {ensembleState.loading && <Loading />}
            {ensembleState.error && <ErrorBox message={ensembleState.error} />}
            {!ensembleState.loading && !ensembleState.error && ensemble.length > 0 && (
              <>
                <div style={{ fontSize: 10.5, color: C.muted, margin: '0 4px 2px' }}>Temp. 850 hPa (°C)</div>
                <ResponsiveContainer width="100%" height={130}>
                  <ComposedChart data={ensemble} margin={{ top: 4, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke={C.border} vertical={false} />
                    <XAxis dataKey="hour" tick={{ fontSize: 9, fill: C.muted }} interval={7} tickLine={false} axisLine={{ stroke: C.border2 }} />
                    <YAxis tick={{ fontSize: 9, fill: C.muted }} tickLine={false} axisLine={false} width={24} />
                    <Tooltip contentStyle={{ background: '#fff', border: `1px solid ${C.border2}`, fontSize: 10.5, borderRadius: 4 }} />
                    {Array.from({ length: 8 }, (_, i) => (
                      <Line key={i} type="monotone" dataKey={'m850_' + i} stroke={MEMBER_COLORS[i]} strokeWidth={1} dot={false} opacity={0.55} connectNulls />
                    ))}
                    <Line type="monotone" dataKey="control850" stroke="#1e3a8a" strokeWidth={2.4} dot={false} connectNulls />
                    <Line type="monotone" dataKey="mean850" stroke="#dc2626" strokeWidth={2.4} dot={false} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
                <div style={{ fontSize: 10.5, color: C.muted, margin: '6px 4px 2px' }}>Temp. 500 hPa (°C)</div>
                <ResponsiveContainer width="100%" height={130}>
                  <ComposedChart data={ensemble} margin={{ top: 4, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke={C.border} vertical={false} />
                    <XAxis dataKey="hour" tick={{ fontSize: 9, fill: C.muted }} interval={7} tickLine={false} axisLine={{ stroke: C.border2 }} />
                    <YAxis tick={{ fontSize: 9, fill: C.muted }} tickLine={false} axisLine={false} width={24} />
                    <Tooltip contentStyle={{ background: '#fff', border: `1px solid ${C.border2}`, fontSize: 10.5, borderRadius: 4 }} />
                    {Array.from({ length: 8 }, (_, i) => (
                      <Line key={i} type="monotone" dataKey={'m500_' + i} stroke={MEMBER_COLORS[i]} strokeWidth={1} dot={false} opacity={0.55} connectNulls />
                    ))}
                    <Line type="monotone" dataKey="control500" stroke="#1e3a8a" strokeWidth={2.4} dot={false} connectNulls />
                    <Line type="monotone" dataKey="mean500" stroke="#dc2626" strokeWidth={2.4} dot={false} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
                <div style={{ fontSize: 10.5, color: C.muted, margin: '6px 4px 2px' }}>Précipitations — points = risque neige (850hPa &lt; 1°C)</div>
                <ResponsiveContainer width="100%" height={70}>
                  <ComposedChart data={ensemble} margin={{ top: 4, right: 10, left: -20, bottom: 0 }}>
                    <XAxis dataKey="hour" hide />
                    <YAxis tick={{ fontSize: 9, fill: C.muted }} tickLine={false} axisLine={false} width={24} />
                    <Bar dataKey="precip" fill="#2f8fce" radius={[2, 2, 0, 0]} />
                    <Line type="monotone" dataKey={(d) => (d.snow ? 0.2 : null)} stroke="#7c3aed" strokeWidth={0} dot={{ r: 2.5, fill: '#7c3aed' }} isAnimationActive={false} connectNulls={false} />
                  </ComposedChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', gap: 14, padding: '6px 4px 0', fontSize: 10.5, flexWrap: 'wrap' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: C.muted }}><span style={{ width: 10, height: 2.5, background: '#1e3a8a', display: 'inline-block' }} /> Run de contrôle</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: C.muted }}><span style={{ width: 10, height: 2.5, background: '#dc2626', display: 'inline-block' }} /> Moyenne des scénarios</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: C.muted }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: '#7c3aed', display: 'inline-block' }} /> Risque neige</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Frise combinée multi-modèles */}
      <div style={{ padding: '0 16px 4px', fontSize: 13, fontWeight: 600 }}>Prévision détaillée (modèle selon l'échéance)</div>
      <div style={{ padding: '0 16px 6px', fontSize: 11, color: C.muted, lineHeight: 1.4 }}>
        AROME jusqu'à 42h, puis ICON-EU jusqu'à 84h, puis GFS toutes les 6h au-delà.
      </div>
      {timelineErrors.length > 0 && <ErrorBox message={`Certaines sources ont échoué : ${timelineErrors.join(' · ')}`} />}
      {timelineState.loading && <Loading label="Chargement de la frise…" />}
      {!timelineState.loading && timeline.length > 0 && (
        <div style={{ overflowX: 'auto', margin: '4px 16px 24px', border: `1px solid ${C.border}`, borderRadius: 6 }}>
          <table className="mono" style={{ borderCollapse: 'collapse', width: '100%', minWidth: 720, fontSize: 11 }}>
            <thead>
              <tr style={{ background: C.panel }}>
                <Th>Jour</Th><Th>Heure</Th><Th>Temp.</Th><Th>Vent (dir · moy · raf.)</Th>
                <Th>Pluie 1h</Th><Th>Humid.</Th><Th>Pression</Th><Th>Temps</Th><Th>Modèle</Th>
              </tr>
            </thead>
            <tbody>
              {timeline.map((r, i) => {
                const { text } = wmoInfo(r.weathercode);
                return (
                  <React.Fragment key={i}>
                    {i === firstDailyIdx && (
                      <tr><td colSpan={9} style={{ background: '#eef1f5', padding: '6px 10px', color: C.muted, fontSize: 10.5, borderTop: `1px solid ${C.border}` }}>Météo par jour — résolution 6h</td></tr>
                    )}
                    <tr style={{ borderTop: `1px solid ${C.border}`, background: r.model ? '#f2f6fb' : 'transparent' }}>
                      <Td style={{ fontWeight: r.isNewDay ? 600 : 400 }}>{r.isNewDay ? r.dayLabel : ''}</Td>
                      <Td>{String(r.hour).padStart(2, '0')}h</Td>
                      <Td>{r.temp}°C</Td>
                      <Td>{windDirFull(r.windDir)} · {r.windMoy} · {r.windRaf}</Td>
                      <Td>{r.precip > 0 ? `${r.precip} mm` : '--'}</Td>
                      <Td>{r.humidity}%</Td>
                      <Td>{r.pressure != null ? `${r.pressure} hPa` : '--'}</Td>
                      <Td>{text}</Td>
                      <Td style={{ color: r.model ? (MODEL_INFO[r.model]?.color || C.text) : C.muted, fontWeight: r.model ? 700 : 400 }}>{r.model || ''}</Td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
const MEMBER_COLORS = ['#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#84cc16', '#f43f5e', '#6366f1'];
function Th({ children }) { return <th style={{ textAlign: 'left', padding: '7px 10px', color: C.muted, fontWeight: 500, fontSize: 10 }}>{children}</th>; }
function Td({ children, style }) { return <td style={{ padding: '6px 10px', color: C.text, whiteSpace: 'nowrap', ...style }}>{children}</td>; }

/* ---------------- Page Comparatif ---------------- */
function ComparePage({ locations }) {
  const [model, setModel] = useState('AROME');
  const [expandedId, setExpandedId] = useState(null);
  const [expandMode, setExpandMode] = useState('3h');

  const state = useAsync(async () => {
    const results = await Promise.all(locations.map(async (loc) => {
      try {
        const rows = await fetchForecast(loc, model, 2);
        return { loc, f: rows[0], error: null };
      } catch (e) {
        return { loc, f: null, error: e.message };
      }
    }));
    return results;
  }, [locations.map((l) => l.id).join(','), model]);

  const rows = state.data || [];

  return (
    <div>
      <div style={{ padding: '16px 16px 8px' }}>
        <div style={{ fontSize: 20, fontWeight: 600 }}>Comparatif des zones</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Touchez une ville pour voir son évolution</div>
      </div>
      <div style={{ display: 'flex', gap: 6, padding: '4px 16px 12px' }}>
        {MODELS.map((m) => (
          <button key={m} onClick={() => setModel(m)} style={{
            fontSize: 12, padding: '5px 12px', borderRadius: 20, border: `1px solid ${model === m ? MODEL_INFO[m].color : C.border2}`,
            background: model === m ? '#eef3fb' : 'transparent', color: model === m ? C.text : C.muted, cursor: 'pointer',
          }}>{m}</button>
        ))}
      </div>
      {state.loading && <Loading />}
      <div style={{ margin: '0 16px', border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden' }}>
        {!state.loading && rows.length === 0 && <div style={{ padding: 20, fontSize: 12.5, color: C.muted }}>Aucune ville suivie pour l'instant — ajoutez-en depuis l'onglet Réglages.</div>}
        {rows.map(({ loc, f, error }, i) => {
          const isOpen = expandedId === loc.id;
          if (error || !f) {
            return (
              <div key={loc.id} style={{ borderTop: i === 0 ? 'none' : `1px solid ${C.border}`, padding: '11px 12px' }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, marginBottom: 4 }}>{loc.name}</div>
                <ErrorBox message={error || 'Donnée indisponible'} />
              </div>
            );
          }
          const { Icon } = wmoInfo(f.weathercode);
          return (
            <div key={loc.id} style={{ borderTop: i === 0 ? 'none' : `1px solid ${C.border}` }}>
              <button onClick={() => setExpandedId(isOpen ? null : loc.id)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px',
                background: loc.main ? C.panel : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
              }}>
                <ChevronDown size={13} color={C.muted} style={{ transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform .15s', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5 }}>
                    {loc.main && <Star size={11} fill="#e8a83f" color="#e8a83f" />}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{loc.name}</span>
                  </div>
                </div>
                <Icon size={18} color="#4f8fe8" />
                <div className="mono" style={{ width: 40, textAlign: 'right', fontSize: 13, fontWeight: 600 }}>{Math.round(f.temp)}°</div>
                <div className="mono" style={{ width: 52, textAlign: 'right', fontSize: 11, color: '#2f8fce' }}>{f.precip > 0 ? `${f.precip}mm` : '–'}</div>
                <div className="mono" style={{ width: 62, textAlign: 'right', fontSize: 11, color: C.muted }}>{f.windMoy}km/h {windDirShort(f.windDir)}</div>
              </button>
              {isOpen && <ExpandedPreview loc={loc} model={model} mode={expandMode} setMode={setExpandMode} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ExpandedPreview({ loc, model, mode, setMode }) {
  const state = useAsync(() => fetchForecast(loc, model, 5), [loc.lat, loc.lon, model]);
  const hourly = state.data || [];
  const daily = useMemo(() => aggregateDaily(hourly), [hourly]);
  const items = mode === '3h'
    ? [0, 3, 6, 9].map((h) => hourly[h]).filter(Boolean)
    : daily.slice(0, 3);

  return (
    <div style={{ padding: '4px 12px 12px', background: '#fafbfc', borderTop: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', gap: 6, padding: '8px 0 8px' }}>
        {[['3h', 'Par 3h'], ['jours', 'Par jour']].map(([id, label]) => (
          <button key={id} onClick={() => setMode(id)} style={{
            fontSize: 11, padding: '4px 10px', borderRadius: 16, border: `1px solid ${C.border2}`,
            background: mode === id ? '#e9edf3' : 'transparent', color: mode === id ? C.text : C.muted, cursor: 'pointer',
          }}>{label}</button>
        ))}
      </div>
      {state.loading && <Loading />}
      {state.error && <ErrorBox message={state.error} />}
      {!state.loading && !state.error && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
          {items.map((it, i) => {
            if (mode === '3h') {
              const { Icon } = wmoInfo(it.weathercode);
              return (
                <div key={i} style={{ flex: '0 0 auto', minWidth: 68, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 6px', textAlign: 'center', background: '#fff' }}>
                  <div className="mono" style={{ fontSize: 10.5, color: C.muted }}>{String(it.hour).padStart(2, '0')}h</div>
                  <Icon size={16} color="#4f8fe8" style={{ margin: '4px auto' }} />
                  <div className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{Math.round(it.temp)}°</div>
                  <div className="mono" style={{ fontSize: 9.5, color: '#2f8fce' }}>{it.precip > 0 ? `${it.precip}mm` : '–'}</div>
                </div>
              );
            }
            const { Icon } = wmoInfo(it.weathercode);
            return (
              <div key={i} style={{ flex: '0 0 auto', minWidth: 78, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 6px', textAlign: 'center', background: '#fff' }}>
                <div className="mono" style={{ fontSize: 10.5, color: C.muted }}>{it.dayLabel}</div>
                <Icon size={16} color="#4f8fe8" style={{ margin: '4px auto' }} />
                <div className="mono" style={{ fontSize: 12.5, fontWeight: 600 }}>{it.tmin}° / {it.tmax}°</div>
                <div className="mono" style={{ fontSize: 9.5, color: '#2f8fce' }}>{it.precip > 0 ? `${it.precip}mm` : '–'}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------- Page Radar (reste schématique) ---------------- */
function RadarPage({ locations }) {
  const [model, setModel] = useState('AROME');
  const [hourAhead, setHourAhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (playing) {
      timerRef.current = setInterval(() => setHourAhead((h) => (h >= 24 ? 0 : h + 1)), 700);
    } else clearInterval(timerRef.current);
    return () => clearInterval(timerRef.current);
  }, [playing]);

  const bbox = { latMin: 42.3, latMax: 51.1, lonMin: -4.8, lonMax: 8.2 };
  const grid = useMemo(() => {
    const pts = [];
    const cols = 14, rowsN = 14;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rowsN; j++) {
        const lat = bbox.latMax - (i / cols) * (bbox.latMax - bbox.latMin);
        const lon = bbox.lonMin + (j / rowsN) * (bbox.lonMax - bbox.lonMin);
        const rand = mulberry32(hashSeed(`${i}-${j}-${model}-${hourAhead}`));
        const cellNoise = Math.sin(i * 0.9 + hourAhead * 0.35) * Math.cos(j * 0.7 - hourAhead * 0.25);
        const intensity = Math.max(0, (cellNoise + (rand() - 0.5) * 0.6));
        pts.push({ lat, lon, intensity });
      }
    }
    return pts;
  }, [model, hourAhead]);

  const project = (lat, lon) => ({
    x: ((lon - bbox.lonMin) / (bbox.lonMax - bbox.lonMin)) * 320,
    y: ((bbox.latMax - lat) / (bbox.latMax - bbox.latMin)) * 340,
  });
  const targetTime = new Date(Date.now() + hourAhead * 3600 * 1000);

  return (
    <div>
      <div style={{ padding: '16px 16px 8px' }}>
        <div style={{ fontSize: 20, fontWeight: 600 }}>Radar précipitations</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Estimation schématique — pas une vraie image radar (nécessite une autre source de données)</div>
      </div>
      <div style={{ display: 'flex', gap: 6, padding: '4px 16px 10px' }}>
        {MODELS.map((m) => (
          <button key={m} onClick={() => setModel(m)} style={{
            fontSize: 12, padding: '5px 12px', borderRadius: 20, border: `1px solid ${model === m ? MODEL_INFO[m].color : C.border2}`,
            background: model === m ? '#eef3fb' : 'transparent', color: model === m ? C.text : C.muted, cursor: 'pointer',
          }}>{m}</button>
        ))}
      </div>

      <div style={{ margin: '0 16px', border: `1px solid ${C.border}`, borderRadius: 6, background: '#eef1f4', overflow: 'hidden' }}>
        <svg viewBox="0 0 320 340" width="100%" style={{ display: 'block' }}>
          {grid.map((p, i) => {
            const { x, y } = project(p.lat, p.lon);
            if (p.intensity <= 0.05) return null;
            const alpha = Math.min(0.85, p.intensity);
            const color = p.intensity > 0.6 ? `rgba(193,45,75,${alpha})` : p.intensity > 0.3 ? `rgba(47,143,206,${alpha})` : `rgba(79,143,232,${alpha * 0.7})`;
            return <rect key={i} x={x - 11} y={y - 11} width={23} height={23} fill={color} rx={3} />;
          })}
          {locations.map((loc) => {
            const { x, y } = project(loc.lat, loc.lon);
            if (x < 0 || x > 320 || y < 0 || y > 340) return null;
            return (
              <g key={loc.id}>
                <circle cx={x} cy={y} r={3.5} fill="#1a1f26" stroke="#fff" strokeWidth={1.5} />
                <text x={x + 6} y={y + 3} fontSize="9" fill="#1a1f26" fontFamily="'JetBrains Mono', monospace">{loc.name}</text>
              </g>
            );
          })}
        </svg>
      </div>

      <div style={{ margin: '10px 16px 4px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => setPlaying((p) => !p)} style={{
          background: C.panel, border: `1px solid ${C.border2}`, borderRadius: 6, padding: 8, color: C.text, cursor: 'pointer',
        }}>{playing ? <Pause size={15} /> : <Play size={15} />}</button>
        <input type="range" min={0} max={24} value={hourAhead} onChange={(e) => { setPlaying(false); setHourAhead(parseInt(e.target.value)); }}
          style={{ flex: 1, accentColor: MODEL_INFO[model].color }} />
        <div className="mono" style={{ fontSize: 11.5, color: C.muted, width: 96, textAlign: 'right' }}>
          {targetTime.toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, padding: '6px 16px 20px', fontSize: 10.5, color: C.muted }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><i style={{ width: 9, height: 9, background: 'rgba(79,143,232,.7)', display: 'inline-block', borderRadius: 2 }} /> Faible</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><i style={{ width: 9, height: 9, background: 'rgba(47,143,206,.85)', display: 'inline-block', borderRadius: 2 }} /> Modéré</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><i style={{ width: 9, height: 9, background: 'rgba(193,45,75,.85)', display: 'inline-block', borderRadius: 2 }} /> Fort</span>
      </div>
    </div>
  );
}

/* ---------------- Page Réglages ---------------- */
function SettingsPage({ locations, setLocations }) {
  return (
    <div>
      <div style={{ padding: '16px 16px 8px' }}>
        <div style={{ fontSize: 20, fontWeight: 600 }}>Réglages</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Gérez les villes suivies et la ville principale</div>
      </div>

      <div style={{ margin: '4px 16px 16px', border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden' }}>
        {locations.map((loc, i) => (
          <div key={loc.id} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
            borderTop: i === 0 ? 'none' : `1px solid ${C.border}`,
          }}>
            <button onClick={() => setLocations(locations.map((l) => ({ ...l, main: l.id === loc.id })))} title="Définir comme ville principale"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
              <Star size={16} fill={loc.main ? '#e8a83f' : 'none'} color={loc.main ? '#e8a83f' : C.muted} />
            </button>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5 }}>{loc.name}</div>
              <div className="mono" style={{ fontSize: 10.5, color: C.muted }}>{loc.lat.toFixed(2)}°, {loc.lon.toFixed(2)}°</div>
            </div>
            <button onClick={() => setLocations(locations.filter((l) => l.id !== loc.id))} style={{
              background: 'none', border: 'none', color: C.muted, cursor: 'pointer', padding: 4,
            }}><Trash2 size={15} /></button>
          </div>
        ))}
        {locations.length === 0 && <div style={{ padding: 16, fontSize: 12.5, color: C.muted }}>Aucune ville pour l'instant.</div>}
      </div>

      <div style={{ margin: '0 16px 20px' }}>
        <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 8 }}>Ajouter une ville</div>
        <CitySearch
          placeholder="Nom de ville…"
          onPick={(c) => {
            if (locations.some((l) => l.name === c.name)) return;
            setLocations([...locations, { ...c, id: c.name.toLowerCase().replace(/\s+/g, '-'), main: locations.length === 0 }]);
          }}
        />
      </div>

      <div style={{ margin: '0 16px 24px', border: `1px solid ${C.border}`, borderRadius: 6, padding: 12 }}>
        <div style={{ fontSize: 12.5, fontWeight: 500, marginBottom: 8 }}>À propos des modèles (données Open-Meteo)</div>
        {MODELS.map((m) => (
          <div key={m} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: MODEL_INFO[m].color, marginTop: 4, flexShrink: 0 }} />
            <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.4 }}>
              <span className="mono" style={{ color: C.text }}>{m}</span> — {MODEL_INFO[m].desc}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
