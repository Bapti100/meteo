import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Sun, Cloud, CloudRain, CloudDrizzle, CloudSnow, CloudFog, CloudLightning,
  Search, Settings as SettingsIcon, Map as MapIcon, Table as TableIcon,
  Home, Plus, Trash2, Star, ChevronRight, ChevronDown, Play, Pause, Info, AlertTriangle, Lock
} from 'lucide-react';
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Bar
} from 'recharts';
import { fetchSettings, saveSettings, githubConfigured, checkPassword, passwordConfigured } from './githubStore';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

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
const MODEL_DAYS = { AROME: 2, 'ICON-EU': 5, GFS: 10 };
const ENSEMBLE_DAYS = { AROME: 2, 'ICON-EU': 5, GFS: 10 };
const GFS_STEP_HOURS = 6;

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
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&hourly=temperature_2m,precipitation,weathercode,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,windspeed_10m,winddirection_10m,windgusts_10m,relativehumidity_2m,pressure_msl&models=${modelParam}&forecast_days=${days}&timezone=auto`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.error) throw new Error(json.reason || `${modelKey} indisponible pour cette zone`);
  const h = json.hourly;
  const rows = [];
  for (let i = 0; i < h.time.length; i++) {
    const t = new Date(h.time[i]);
    const precip = h.precipitation ? (h.precipitation[i] ?? 0) : 0;
    const cloudLayers = [h.cloud_cover_low?.[i], h.cloud_cover_mid?.[i], h.cloud_cover_high?.[i]].filter((v) => v != null);
    const cloud = h.cloud_cover ? (h.cloud_cover[i] ?? (cloudLayers.length ? Math.max(...cloudLayers) : null))
      : (cloudLayers.length ? Math.max(...cloudLayers) : null);
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

function percentile(sortedArr, p) {
  if (sortedArr.length === 0) return 0;
  if (sortedArr.length === 1) return sortedArr[0];
  const idx = (p / 100) * (sortedArr.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return Math.round(sortedArr[lo] * 10) / 10;
  return Math.round((sortedArr[lo] + (sortedArr[hi] - sortedArr[lo]) * (idx - lo)) * 10) / 10;
}

async function fetchEnsemble(loc, modelKey) {
  const modelParam = ENSEMBLE_API[modelKey];
  const days = ENSEMBLE_DAYS[modelKey] || 3;
  const url = `https://ensemble-api.open-meteo.com/v1/ensemble?latitude=${loc.lat}&longitude=${loc.lon}&hourly=temperature_850hPa,temperature_500hPa,precipitation&models=${modelParam}&forecast_days=${days}&timezone=auto`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.error) throw new Error(json.reason || 'Ensemble indisponible pour cette zone');
  const h = json.hourly;
  const time = h.time;
  const membersFor = (base) => Object.keys(h).filter((k) => k.startsWith(base)).sort();
  const keys850 = membersFor('temperature_850hPa');
  const keys500 = membersFor('temperature_500hPa');
  const keysPrecip = membersFor('precipitation');
  if (keys850.length === 0 || keys500.length === 0) {
    throw new Error(`Les niveaux de pression 850/500 hPa ne sont pas fournis par l'ensemble ${modelParam}. Essaie un autre modèle.`);
  }
  const now = new Date(); now.setMinutes(0, 0, 0);
  let startIdx = time.findIndex((tStr) => new Date(tStr).getTime() >= now.getTime());
  if (startIdx < 0) startIdx = 0;
  const hoursToShow = Math.min(days * 24, time.length - startIdx);
  const step = modelKey === 'GFS' ? GFS_STEP_HOURS : 1;
  const rows = [];
  for (let off = 0; off < hoursToShow; off += step) {
    const i = startIdx + off;
    const vals850 = keys850.map((k) => h[k][i]).filter((v) => v != null);
    const vals500 = keys500.map((k) => h[k][i]).filter((v) => v != null);
    const valsPrecip = keysPrecip.map((k) => h[k][i]).filter((v) => v != null).sort((a, b) => a - b);
    const mean850 = vals850.reduce((a, b) => a + b, 0) / (vals850.length || 1);
    const mean500 = vals500.reduce((a, b) => a + b, 0) / (vals500.length || 1);
    const row = {
      hour: off, control850: vals850[0], control500: vals500[0],
      mean850: Math.round(mean850 * 10) / 10, mean500: Math.round(mean500 * 10) / 10,
      precipMin: percentile(valsPrecip, 0), precipP25: percentile(valsPrecip, 25),
      precipMedian: percentile(valsPrecip, 50), precipP75: percentile(valsPrecip, 75),
      precipMax: percentile(valsPrecip, 100),
      snow: mean850 < 1,
    };
    vals850.slice(0, 8).forEach((v, idx) => { row['m850_' + idx] = v; });
    vals500.slice(0, 8).forEach((v, idx) => { row['m500_' + idx] = v; });
    rows.push(row);
  }
  // Le nom des variables existe parfois côté API même quand ce modèle ne calcule
  // pas réellement les niveaux 850/500 hPa : dans ce cas toutes les valeurs sont
  // nulles, la moyenne retombe artificiellement à 0 (d'où le trait plat à 0 et
  // le "risque neige" affiché en continu). On détecte ce cas et on prévient
  // clairement plutôt que d'afficher un graphique vide.
  if (!rows.some((r) => r.control850 != null && r.control500 != null)) {
    throw new Error(`Les niveaux 850/500 hPa ne sont pas réellement calculés par l'ensemble ${modelParam} pour cette zone. Essaie un autre modèle.`);
  }
  return rows;
}

function chartSeries(hourly, model) {
  if (model === 'GFS') {
    return hourly.filter((r) => r.hour % GFS_STEP_HOURS === 0)
      .map((r) => ({ ...r, xLabel: `${r.t.getDate()}/${r.t.getMonth() + 1} ${String(r.hour).padStart(2, '0')}h` }));
  }
  return hourly.map((r) => ({ ...r, xLabel: `${String(r.hour).padStart(2, '0')}h` }));
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

const DEFAULT_LOCATIONS = [
  { id: 'strasbourg', name: 'Strasbourg', lat: 48.58, lon: 7.75, main: true },
  { id: 'annecy', name: 'Annecy', lat: 45.90, lon: 6.13, main: false },
  { id: 'chamonix', name: 'Chamonix', lat: 45.92, lon: 6.87, main: false },
];

export default function App() {
  const [locations, setLocationsState] = useState(DEFAULT_LOCATIONS);
  const [view, setView] = useState('dashboard');
  const mainLoc = locations.find((l) => l.main) || locations[0];
  const [dashLoc, setDashLoc] = useState(mainLoc);
  const [unlocked, setUnlocked] = useState(() => localStorage.getItem('meteo_unlocked') === '1');
  const [syncStatus, setSyncStatus] = useState({ state: 'idle', message: '' }); // idle | loading | saving | ok | error
  const loadedRef = useRef(false);

  // Chargement initial des villes sauvegardées sur GitHub
  useEffect(() => {
    let cancelled = false;
    if (!githubConfigured()) { loadedRef.current = true; return; }
    setSyncStatus({ state: 'loading', message: 'Chargement des réglages…' });
    fetchSettings()
      .then((data) => {
        if (cancelled) return;
        if (data && Array.isArray(data.locations) && data.locations.length > 0) setLocationsState(data.locations);
        setSyncStatus({ state: 'ok', message: 'Synchronisé' });
      })
      .catch((e) => { if (!cancelled) setSyncStatus({ state: 'error', message: e.message }); })
      .finally(() => { loadedRef.current = true; });
    return () => { cancelled = true; };
  }, []);

  // Sauvegarde sur GitHub à chaque changement (uniquement après déverrouillage et chargement initial)
  function setLocations(next) {
    setLocationsState(next);
    if (!unlocked || !loadedRef.current || !githubConfigured()) return;
    setSyncStatus({ state: 'saving', message: 'Sauvegarde…' });
    saveSettings({ locations: next })
      .then(() => setSyncStatus({ state: 'ok', message: 'Sauvegardé sur GitHub' }))
      .catch((e) => setSyncStatus({ state: 'error', message: e.message }));
  }

  function handleUnlock(pwd) {
    if (checkPassword(pwd)) { setUnlocked(true); localStorage.setItem('meteo_unlocked', '1'); return true; }
    return false;
  }
  function handleLock() { setUnlocked(false); localStorage.removeItem('meteo_unlocked'); }

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
          {view === 'radar' && <RadarPage locations={locations} mainLoc={mainLoc} />}
          {view === 'settings' && (
            <SettingsPage
              locations={locations} setLocations={setLocations}
              unlocked={unlocked} onUnlock={handleUnlock} onLock={handleLock}
              syncStatus={syncStatus}
            />
          )}
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
// Recherche en direct via la BAN (Base Adresse Nationale, data.gouv.fr — gratuite, sans clé)
async function searchBAN(query) {
  if (query.trim().length < 2) return [];
  const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&type=municipality&limit=6`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = await res.json();
  return (json.features || []).map((f) => ({
    name: f.properties.city || f.properties.label,
    lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0],
  }));
}

function CitySearch({ onPick, placeholder }) {
  const [q, setQ] = useState('');
  const [lat, setLat] = useState(''); const [lon, setLon] = useState(''); const [customName, setCustomName] = useState('');
  const [mode, setMode] = useState('ville');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (mode !== 'ville' || q.trim().length < 2) { setResults([]); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      searchBAN(q).then((r) => { if (!cancelled) { setResults(r); setSearching(false); } })
        .catch(() => { if (!cancelled) setSearching(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, mode]);

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
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder || 'Rechercher une ville de France…'}
              style={{ background: 'none', border: 'none', outline: 'none', color: C.text, fontSize: 13, width: '100%' }} />
          </div>
          {searching && <div style={{ fontSize: 11, color: C.muted, padding: '6px 4px 0' }}>Recherche…</div>}
          {results.length > 0 && (
            <div style={{ marginTop: 6 }}>
              {results.map((c, i) => (
                <button key={c.name + i} onClick={() => { onPick(c); setQ(''); setResults([]); }} style={{
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
        <div>
          <input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Nom du lieu (optionnel — ex : Sélestat)"
            style={{ width: '100%', background: '#fff', border: `1px solid ${C.border2}`, borderRadius: 4, padding: '6px 8px', color: C.text, fontSize: 12.5, marginBottom: 6 }} />
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="Latitude" className="mono"
              style={{ flex: 1, background: '#fff', border: `1px solid ${C.border2}`, borderRadius: 4, padding: '6px 8px', color: C.text, fontSize: 12.5 }} />
            <input value={lon} onChange={(e) => setLon(e.target.value)} placeholder="Longitude" className="mono"
              style={{ flex: 1, background: '#fff', border: `1px solid ${C.border2}`, borderRadius: 4, padding: '6px 8px', color: C.text, fontSize: 12.5 }} />
            <button onClick={() => {
              const la = parseFloat(lat), lo = parseFloat(lon);
              if (!isNaN(la) && !isNaN(lo)) {
                onPick({ name: customName.trim() || `${la.toFixed(2)}, ${lo.toFixed(2)}`, lat: la, lon: lo });
                setLat(''); setLon(''); setCustomName('');
              }
            }} style={{ background: '#e9edf3', border: `1px solid ${C.border2}`, borderRadius: 4, padding: '0 12px', color: C.text, fontSize: 12.5, cursor: 'pointer' }}>OK</button>
          </div>
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

      {/* Graphique température / précipitations — amplitude maximale du modèle */}
      <div style={{ padding: '14px 8px 4px 0', marginLeft: 8 }}>
        <div style={{ fontSize: 12.5, fontWeight: 500, marginLeft: 8, marginBottom: 2 }}>
          Courbe {model} — {hourly.length > 0 ? `${hourly.length} h de données` : '…'}{model === 'GFS' ? ` (pas de ${GFS_STEP_HOURS}h)` : ''}
        </div>
        {chartState.loading && <Loading />}
        {chartState.error && <ErrorBox message={`${model} : ${chartState.error}`} />}
        {!chartState.loading && !chartState.error && (
          <ResponsiveContainer width="100%" height={190}>
            <ComposedChart data={chartSeries(hourly, model)} margin={{ top: 4, right: 12, left: -18, bottom: 0 }}>
              <CartesianGrid stroke={C.border} vertical={false} />
              <XAxis dataKey="xLabel" tick={{ fontSize: 9, fill: C.muted }} interval={model === 'GFS' ? 3 : Math.ceil(hourly.length / 12)} tickLine={false} axisLine={{ stroke: C.border2 }} />
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
            <Info size={14} color={C.muted} /> Diagramme d'ensemble — {model} ({ENSEMBLE_DAYS[model]} j{model === 'GFS' ? `, pas ${GFS_STEP_HOURS}h` : ''})
          </span>
          <ChevronRight size={15} style={{ transform: showEnsemble ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} color={C.muted} />
        </button>
        {showEnsemble && (
          <div style={{ padding: '0 10px 14px' }}>
            <div style={{ fontSize: 11, color: C.muted, padding: '0 4px 8px', lineHeight: 1.4 }}>
              Ensemble {ENSEMBLE_API[model]} (Open-Meteo) — le produit PE-AROME de Météo-France n'étant pas
              disponible gratuitement, ceci est l'équivalent le plus proche. Chaque trait fin coloré est un
              <b> membre</b> de l'ensemble (une simulation avec de légères perturbations initiales) ; le trait
              bleu foncé est le <b>run de contrôle</b> (simulation de référence sans perturbation) ; le trait
              rouge est la <b>moyenne arithmétique</b> de tous les membres — ce n'est pas un écart-type,
              juste une moyenne. Plus les membres sont écartés les uns des autres à une échéance donnée, plus
              l'incertitude est grande à ce moment-là (pas d'écart-type chiffré affiché, seulement la
              dispersion visuelle). Les points violets sur le graphique du bas marquent les échéances où la
              moyenne des membres à 850 hPa passe sous 1°C, un indice — pas une certitude — que les
              précipitations pourraient tomber sous forme de neige.
            </div>
            {ensembleState.loading && <Loading />}
            {ensembleState.error && <ErrorBox message={ensembleState.error} />}
            {!ensembleState.loading && !ensembleState.error && ensemble.length > 0 && (
              <>
                <div style={{ fontSize: 10.5, color: C.muted, margin: '0 4px 2px' }}>Temp. 850 hPa (°C)</div>
                <ResponsiveContainer width="100%" height={130}>
                  <ComposedChart data={ensemble} margin={{ top: 4, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke={C.border} vertical={false} />
                    <XAxis dataKey="hour" tick={{ fontSize: 9, fill: C.muted }} interval={Math.max(1, Math.ceil(ensemble.length / 8))} tickLine={false} axisLine={{ stroke: C.border2 }} />
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
                    <XAxis dataKey="hour" tick={{ fontSize: 9, fill: C.muted }} interval={Math.max(1, Math.ceil(ensemble.length / 8))} tickLine={false} axisLine={{ stroke: C.border2 }} />
                    <YAxis tick={{ fontSize: 9, fill: C.muted }} tickLine={false} axisLine={false} width={24} />
                    <Tooltip contentStyle={{ background: '#fff', border: `1px solid ${C.border2}`, fontSize: 10.5, borderRadius: 4 }} />
                    {Array.from({ length: 8 }, (_, i) => (
                      <Line key={i} type="monotone" dataKey={'m500_' + i} stroke={MEMBER_COLORS[i]} strokeWidth={1} dot={false} opacity={0.55} connectNulls />
                    ))}
                    <Line type="monotone" dataKey="control500" stroke="#1e3a8a" strokeWidth={2.4} dot={false} connectNulls />
                    <Line type="monotone" dataKey="mean500" stroke="#dc2626" strokeWidth={2.4} dot={false} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
                <div style={{ fontSize: 10.5, color: C.muted, margin: '6px 4px 2px' }}>
                  Précipitations — boîte à moustaches par heure (façon Météociel)
                </div>
                <PrecipBoxPlot data={ensemble} color="#2f6fd1" />
                <div style={{ display: 'flex', gap: 14, padding: '6px 4px 0', fontSize: 10.5, flexWrap: 'wrap' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: C.muted }}><span style={{ width: 8, height: 8, background: '#2f6fd1', opacity: 0.6, display: 'inline-block', borderRadius: 1 }} /> Boîte = 25e–75e percentile (50% des membres)</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: C.muted }}><span style={{ width: 10, height: 1.5, background: '#2f6fd1', display: 'inline-block' }} /> Trait fin = min–max</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: C.muted }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: '#7c3aed', display: 'inline-block' }} /> Risque neige</span>
                </div>
                <div style={{ display: 'flex', gap: 14, padding: '6px 4px 0', fontSize: 10.5, flexWrap: 'wrap' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: C.muted }}><span style={{ width: 10, height: 2.5, background: '#1e3a8a', display: 'inline-block' }} /> Run de contrôle</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: C.muted }}><span style={{ width: 10, height: 2.5, background: '#dc2626', display: 'inline-block' }} /> Moyenne des scénarios (temp. 850/500 hPa)</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Frise combinée multi-modèles — façon Météociel */}
      <div style={{ padding: '0 16px 4px', fontSize: 13, fontWeight: 600 }}>Prévision détaillée (modèle selon l'échéance)</div>
      <div style={{ padding: '0 16px 6px', fontSize: 11, color: C.muted, lineHeight: 1.4 }}>
        AROME jusqu'à 42h, puis ICON-EU jusqu'à 84h, puis GFS toutes les 6h au-delà.
      </div>
      {timelineErrors.length > 0 && <ErrorBox message={`Certaines sources ont échoué : ${timelineErrors.join(' · ')}`} />}
      {timelineState.loading && <Loading label="Chargement de la frise…" />}
      {!timelineState.loading && timeline.length > 0 && (
        <div style={{ overflowX: 'auto', margin: '4px 16px 24px', border: `1px solid ${C.border}`, borderRadius: 6 }}>
          <table className="mono" style={{ borderCollapse: 'collapse', width: '100%', minWidth: 660, fontSize: 11.5 }}>
            <thead>
              <tr style={{ background: C.panel }}>
                <Th>Jour</Th><Th>Heure</Th><Th>Temp.</Th><Th colSpan={3}>Vent km/h</Th>
                <Th>Pluie 1h</Th><Th>Humid.</Th><Th>Pression</Th><Th>Temps</Th><Th>Modèle</Th>
              </tr>
              <tr style={{ background: C.panel }}>
                <Th /><Th /><Th /><Th style={{ textAlign: 'center' }}>dir.</Th><Th style={{ textAlign: 'center' }}>moy.</Th><Th style={{ textAlign: 'center' }}>raf.</Th>
                <Th /><Th /><Th /><Th /><Th />
              </tr>
            </thead>
            <tbody>
              {withDaySpansSplit(timeline, firstDailyIdx).map((r, i) => {
                const { text, Icon } = wmoInfo(r.weathercode);
                const tColor = tempColor(r.temp);
                const rColor = windColor(r.windRaf);
                const hColor = humColor(r.humidity);
                return (
                  <React.Fragment key={i}>
                    {i === firstDailyIdx && (
                      <tr><td colSpan={11} style={{ background: '#eef1f5', padding: '6px 10px', color: C.muted, fontSize: 10.5, borderTop: `1px solid ${C.border}` }}>Météo par jour — résolution 6h</td></tr>
                    )}
                    <tr style={{ borderTop: `1px solid ${C.border}` }}>
                      {r.daySpan > 0 && (
                        <td rowSpan={r.daySpan} style={{ background: '#dff3fa', color: C.text, fontWeight: 600, textAlign: 'center', padding: '4px 8px', verticalAlign: 'middle', borderRight: `1px solid ${C.border}` }}>{r.dayLabel}</td>
                      )}
                      <Td style={{ textAlign: 'center' }}>{String(r.hour).padStart(2, '0')}:00</Td>
                      <td style={{ padding: '4px 8px', textAlign: 'center', fontWeight: 700, background: tColor, color: textColorFor(tColor) }}>{r.temp}°C</td>
                      <td style={{ padding: '4px 6px', textAlign: 'center', background: '#e3f2f8' }} title={windDirFull(r.windDir)}>
                        <span style={{ display: 'inline-block', transform: `rotate(${r.windDir}deg)`, fontSize: 13 }}>↑</span>
                      </td>
                      <Td style={{ textAlign: 'center' }}>{r.windMoy}</Td>
                      <td style={{ padding: '4px 8px', textAlign: 'center', fontWeight: 600, background: rColor, color: textColorFor(rColor) }}>{r.windRaf}</td>
                      <Td style={{ textAlign: 'center' }}>{r.precip > 0 ? `${r.precip} mm` : '--'}</Td>
                      <td style={{ padding: '4px 8px', textAlign: 'center', background: hColor, color: textColorFor(hColor) }}>{r.humidity}%</td>
                      <td style={{ padding: '4px 8px', textAlign: 'center', background: '#ece9f7' }}>{r.pressure != null ? `${r.pressure} hPa` : '--'}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'center', background: '#eaf6fb' }} title={text}><Icon size={16} color={iconColor(r.weathercode)} /></td>
                      <Td style={{ textAlign: 'center', color: r.model ? (MODEL_INFO[r.model]?.color || C.text) : C.muted, fontWeight: r.model ? 700 : 400 }}>{r.model || ''}</Td>
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

/* --- Box-plot des précipitations d'ensemble (façon Météociel) --- */
function PrecipBoxPlot({ data, color }) {
  const W = 640, H = 130, padL = 34, padR = 8, padT = 8, padB = 20;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const n = data.length;
  if (n === 0) return null;
  const maxVal = Math.max(1, ...data.map((d) => d.precipMax || 0)) * 1.15;
  const x = (i) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v) => padT + innerH - (Math.min(v, maxVal) / maxVal) * innerH;
  const boxW = Math.max(2.5, Math.min(12, (innerW / n) * 0.55));
  const xInterval = Math.max(1, Math.ceil(n / 9));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
      {[0, 0.5, 1].map((f, idx) => {
        const v = maxVal * f;
        return (
          <g key={idx}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke={C.border} strokeWidth={1} />
            <text x={padL - 5} y={y(v) + 3} fontSize="9" fill={C.muted} textAnchor="end">{Math.round(v * 10) / 10}</text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const cx = x(i);
        if (!d.precipMax) return d.snow ? <circle key={i} cx={cx} cy={H - 6} r={2.3} fill="#7c3aed" /> : null;
        return (
          <g key={i}>
            <line x1={cx} x2={cx} y1={y(d.precipMin)} y2={y(d.precipMax)} stroke={color} strokeWidth={1.3} />
            <rect x={cx - boxW / 2} y={y(d.precipP75)} width={boxW} height={Math.max(1, y(d.precipP25) - y(d.precipP75))} fill={color} opacity={0.6} rx={1} />
            {d.snow && <circle cx={cx} cy={H - 6} r={2.3} fill="#7c3aed" />}
          </g>
        );
      })}
      {data.map((d, i) => (i % xInterval === 0 ? (
        <text key={'t' + i} x={x(i)} y={H - 4} fontSize="8.5" fill={C.muted} textAnchor="middle">{d.hour}</text>
      ) : null))}
    </svg>
  );
}
function Th({ children, style, colSpan }) { return <th colSpan={colSpan} style={{ textAlign: 'left', padding: '7px 8px', color: C.muted, fontWeight: 500, fontSize: 10, ...style }}>{children}</th>; }
function Td({ children, style }) { return <td style={{ padding: '4px 8px', color: C.text, whiteSpace: 'nowrap', ...style }}>{children}</td>; }

/* --- groupement par jour pour la fusion de cellules (rowSpan) --- */
function withDaySpans(rows) {
  const out = rows.map((r) => ({ ...r, daySpan: 0 }));
  let i = 0;
  while (i < out.length) {
    let j = i;
    while (j < out.length && out[j].dayKey === out[i].dayKey) j++;
    out[i].daySpan = j - i;
    i = j;
  }
  return out;
}
// Comme un bandeau "Météo par jour" est inséré au milieu de la frise, la fusion
// de cellules "Jour" ne doit jamais chevaucher cette ligne (sinon la largeur du
// tableau se décale) : on force une coupure de groupe à cet endroit.
function withDaySpansSplit(rows, splitIdx) {
  if (splitIdx <= 0 || splitIdx >= rows.length) return withDaySpans(rows);
  return [...withDaySpans(rows.slice(0, splitIdx)), ...withDaySpans(rows.slice(splitIdx))];
}

/* --- échelles de couleurs façon Météociel --- */
function hexToRgb(hex) { hex = hex.replace('#', ''); return [parseInt(hex.substring(0, 2), 16), parseInt(hex.substring(2, 4), 16), parseInt(hex.substring(4, 6), 16)]; }
function rgbToHex(r, g, b) { return '#' + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join(''); }
function scaleColor(value, stops) {
  if (value == null || Number.isNaN(value)) return '#f2f3f4';
  if (value <= stops[0][0]) return stops[0][1];
  if (value >= stops[stops.length - 1][0]) return stops[stops.length - 1][1];
  for (let i = 0; i < stops.length - 1; i++) {
    const [v0, c0] = stops[i], [v1, c1] = stops[i + 1];
    if (value >= v0 && value <= v1) {
      const t = (value - v0) / (v1 - v0);
      const [r0, g0, b0] = hexToRgb(c0), [r1, g1, b1] = hexToRgb(c1);
      return rgbToHex(r0 + (r1 - r0) * t, g0 + (g1 - g0) * t, b0 + (b1 - b0) * t);
    }
  }
  return stops[stops.length - 1][1];
}
function textColorFor(hex) {
  const [r, g, b] = hexToRgb(hex);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? '#1a1f26' : '#ffffff';
}
const TEMP_STOPS = [[-10, '#1a3f8f'], [0, '#3b7fd1'], [8, '#63b3e0'], [14, '#8fd0c4'], [18, '#c8e07a'], [22, '#f5d76e'], [26, '#f5a94e'], [30, '#e2542b'], [35, '#b5121b'], [42, '#6b0d12']];
const WIND_STOPS = [[0, '#eef2f5'], [10, '#bfe3ee'], [20, '#7fd1e0'], [30, '#5bc98a'], [40, '#f0b94e'], [55, '#d1483b']];
const HUM_STOPS = [[20, '#f2f3f4'], [50, '#c7cbd1'], [80, '#8b929c'], [100, '#5b616b']];
function tempColor(v) { return scaleColor(v, TEMP_STOPS); }
function windColor(v) { return scaleColor(v, WIND_STOPS); }
function humColor(v) { return scaleColor(v, HUM_STOPS); }
function iconColor(code) {
  if (code == null) return '#9aa3ad';
  if (code === 0 || code === 1) return '#f0b429';
  if (code === 2 || code === 3) return '#8a95a3';
  if (code === 45 || code === 48) return '#9aa3ad';
  if (code >= 51 && code <= 57) return '#4f8fe8';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return '#2f6fd1';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return '#7dd3fc';
  if (code >= 95) return '#7c3aed';
  return '#8a95a3';
}

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
function RadarPage({ locations, mainLoc }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [frames, setFrames] = useState([]); // [{ time, path, isForecast }]
  const [frameIdx, setFrameIdx] = useState(0);
  const [host, setHost] = useState('');
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef(null);

  // 1) Créer la carte MapLibre une seule fois
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png', 'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png', 'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
          },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
      attributionControl: false,
    });
    map.addControl(new maplibregl.AttributionControl({ compact: true }));
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => setReady(true));
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // 2) Centrer sur la ville principale avec une largeur d'environ 50 km
  useEffect(() => {
    if (!ready || !mapRef.current || !mainLoc) return;
    const km = 125; // demi-largeur -> ~250 km de large au total
    const dLat = km / 111;
    const dLon = km / (111 * Math.cos((mainLoc.lat * Math.PI) / 180));
    mapRef.current.fitBounds(
      [[mainLoc.lon - dLon, mainLoc.lat - dLat], [mainLoc.lon + dLon, mainLoc.lat + dLat]],
      { padding: 20, animate: false }
    );
  }, [ready, mainLoc?.lat, mainLoc?.lon]);

  // 3) Marqueurs des villes suivies
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const markers = locations.map((loc) => {
      const el = document.createElement('div');
      el.style.width = '10px'; el.style.height = '10px'; el.style.borderRadius = '50%';
      el.style.background = loc.main ? '#e8a83f' : '#1a1f26';
      el.style.border = '2px solid #fff'; el.style.boxShadow = '0 0 2px rgba(0,0,0,.4)';
      return new maplibregl.Marker({ element: el })
        .setLngLat([loc.lon, loc.lat])
        .setPopup(new maplibregl.Popup({ offset: 10, closeButton: false }).setText(loc.name))
        .addTo(mapRef.current);
    });
    return () => markers.forEach((m) => m.remove());
  }, [ready, locations]);

  // 4) Récupérer les frames radar RainViewer (gratuit, sans clé)
  useEffect(() => {
    let cancelled = false;
    fetch('https://api.rainviewer.com/public/weather-maps.json')
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const past = (json.radar?.past || []).map((f) => ({ ...f, isForecast: false }));
        const nowcast = (json.radar?.nowcast || []).map((f) => ({ ...f, isForecast: true }));
        setHost(json.host);
        setFrames([...past, ...nowcast]);
        setFrameIdx(Math.max(0, past.length - 1)); // frame la plus récente observée = "maintenant"
      })
      .catch((e) => { if (!cancelled) setLoadError(e.message || 'Radar indisponible'); });
    return () => { cancelled = true; };
  }, []);

  // 5) Afficher la frame courante sur la carte
  useEffect(() => {
    if (!ready || !mapRef.current || !host || frames.length === 0) return;
    const map = mapRef.current;
    const frame = frames[frameIdx];
    if (!frame) return;
    const url = `${host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;
    if (map.getLayer('radar-layer')) map.removeLayer('radar-layer');
    if (map.getSource('radar-src')) map.removeSource('radar-src');
    map.addSource('radar-src', { type: 'raster', tiles: [url], tileSize: 256 });
    map.addLayer({ id: 'radar-layer', type: 'raster', source: 'radar-src', paint: { 'raster-opacity': 0.75 } });
  }, [ready, host, frames, frameIdx]);

  // 6) Lecture automatique
  useEffect(() => {
    if (playing && frames.length > 0) {
      timerRef.current = setInterval(() => setFrameIdx((i) => (i + 1) % frames.length), 800);
    } else clearInterval(timerRef.current);
    return () => clearInterval(timerRef.current);
  }, [playing, frames.length]);

  const currentFrame = frames[frameIdx];
  const frameLabel = currentFrame
    ? new Date(currentFrame.time * 1000).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div>
      <div style={{ padding: '16px 16px 8px' }}>
        <div style={{ fontSize: 20, fontWeight: 600 }}>Radar précipitations</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
          Radar réel (RainViewer) — historique 2h + prévision (nowcast) 30 min. Centré sur {mainLoc?.name || '…'}, ~50 km de large.
        </div>
      </div>

      {loadError && <ErrorBox message={`Radar indisponible : ${loadError}`} />}

      <div style={{ margin: '0 16px', border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden', height: 360, position: 'relative' }}>
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
        {currentFrame?.isForecast && (
          <div style={{ position: 'absolute', top: 8, left: 8, background: '#7c3aed', color: '#fff', fontSize: 10.5, fontWeight: 600, padding: '3px 8px', borderRadius: 12, zIndex: 5 }}>
            Prévision (nowcast)
          </div>
        )}
      </div>

      <div style={{ margin: '10px 16px 4px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => setPlaying((p) => !p)} disabled={frames.length === 0} style={{
          background: C.panel, border: `1px solid ${C.border2}`, borderRadius: 6, padding: 8, color: C.text, cursor: frames.length ? 'pointer' : 'default', opacity: frames.length ? 1 : 0.5,
        }}>{playing ? <Pause size={15} /> : <Play size={15} />}</button>
        <input type="range" min={0} max={Math.max(0, frames.length - 1)} value={frameIdx}
          onChange={(e) => { setPlaying(false); setFrameIdx(parseInt(e.target.value)); }}
          disabled={frames.length === 0} style={{ flex: 1, accentColor: '#2f6fd1' }} />
        <div className="mono" style={{ fontSize: 11.5, color: C.muted, width: 100, textAlign: 'right' }}>{frameLabel}</div>
      </div>
      <div style={{ padding: '2px 16px 20px', fontSize: 10.5, color: C.muted }}>
        Données radar par <a href="https://www.rainviewer.com" target="_blank" rel="noreferrer" style={{ color: C.muted }}>RainViewer</a> · fond de carte © OpenStreetMap contributors
      </div>
    </div>
  );
}

/* ---------------- Page Réglages ---------------- */
function SyncBadge({ syncStatus }) {
  const colors = { idle: C.muted, loading: '#2f6fd1', saving: '#e8a83f', ok: '#1f9d6b', error: '#c23b56' };
  if (syncStatus.state === 'idle') return null;
  return (
    <div style={{ fontSize: 11, color: colors[syncStatus.state], marginTop: 4 }}>{syncStatus.message}</div>
  );
}

function SettingsPage({ locations, setLocations, unlocked, onUnlock, onLock, syncStatus }) {
  const [pwd, setPwd] = useState('');
  const [pwdError, setPwdError] = useState(false);

  return (
    <div>
      <div style={{ padding: '16px 16px 8px' }}>
        <div style={{ fontSize: 20, fontWeight: 600 }}>Réglages</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Gérez les villes suivies et la ville principale</div>
        <SyncBadge syncStatus={syncStatus} />
      </div>

      {!githubConfigured() && (
        <ErrorBox message="Sauvegarde GitHub non configurée (VITE_GH_OWNER / VITE_GH_REPO / VITE_GH_TOKEN manquants) — les modifications resteront locales à ce navigateur. Voir le README." />
      )}

      {!unlocked ? (
        <div style={{ margin: '4px 16px 20px', border: `1px solid ${C.border}`, borderRadius: 6, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Lock size={16} color={C.muted} />
            <div style={{ fontSize: 13.5, fontWeight: 500 }}>Réglages verrouillés</div>
          </div>
          <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 10, lineHeight: 1.4 }}>
            Entre le mot de passe pour modifier les villes suivies. Ce mot de passe n'est pas une vraie
            sécurité (le code du site est public) — il sert juste à éviter les modifications accidentelles.
          </div>
          {!passwordConfigured() && (
            <ErrorBox message="VITE_APP_PASSWORD n'est pas configuré — le déverrouillage est désactivé." />
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <input type="password" value={pwd} onChange={(e) => { setPwd(e.target.value); setPwdError(false); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { if (!onUnlock(pwd)) setPwdError(true); else setPwd(''); } }}
              placeholder="Mot de passe" style={{ flex: 1, background: '#fff', border: `1px solid ${pwdError ? '#c23b56' : C.border2}`, borderRadius: 4, padding: '7px 8px', color: C.text, fontSize: 13 }} />
            <button onClick={() => { if (!onUnlock(pwd)) setPwdError(true); else setPwd(''); }} style={{
              background: '#e9edf3', border: `1px solid ${C.border2}`, borderRadius: 4, padding: '0 14px', color: C.text, fontSize: 13, cursor: 'pointer',
            }}>Déverrouiller</button>
          </div>
          {pwdError && <div style={{ fontSize: 11, color: '#c23b56', marginTop: 6 }}>Mot de passe incorrect.</div>}
        </div>
      ) : (
        <div style={{ margin: '4px 16px 4px', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onLock} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: C.muted, fontSize: 11.5, cursor: 'pointer' }}>
            <Lock size={12} /> Reverrouiller
          </button>
        </div>
      )}

      <div style={{ margin: '4px 16px 16px', border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden' }}>
        {locations.map((loc, i) => (
          <div key={loc.id} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
            borderTop: i === 0 ? 'none' : `1px solid ${C.border}`,
          }}>
            <button onClick={() => unlocked && setLocations(locations.map((l) => ({ ...l, main: l.id === loc.id })))} title="Définir comme ville principale" disabled={!unlocked}
              style={{ background: 'none', border: 'none', cursor: unlocked ? 'pointer' : 'default', padding: 2, opacity: unlocked ? 1 : 0.6 }}>
              <Star size={16} fill={loc.main ? '#e8a83f' : 'none'} color={loc.main ? '#e8a83f' : C.muted} />
            </button>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5 }}>{loc.name}</div>
              <div className="mono" style={{ fontSize: 10.5, color: C.muted }}>{loc.lat.toFixed(2)}°, {loc.lon.toFixed(2)}°</div>
            </div>
            {unlocked && (
              <button onClick={() => setLocations(locations.filter((l) => l.id !== loc.id))} style={{
                background: 'none', border: 'none', color: C.muted, cursor: 'pointer', padding: 4,
              }}><Trash2 size={15} /></button>
            )}
          </div>
        ))}
        {locations.length === 0 && <div style={{ padding: 16, fontSize: 12.5, color: C.muted }}>Aucune ville pour l'instant.</div>}
      </div>

      {unlocked && (
        <div style={{ margin: '0 16px 20px' }}>
          <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 8 }}>Ajouter une ville</div>
          <CitySearch
            placeholder="Nom de ville…"
            onPick={(c) => {
              if (locations.some((l) => l.name === c.name)) return;
              setLocations([...locations, { ...c, id: c.name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now(), main: locations.length === 0 }]);
            }}
          />
        </div>
      )}

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
