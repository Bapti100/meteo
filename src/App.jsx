import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Sun, Cloud, CloudRain, CloudDrizzle, CloudSnow, CloudFog, CloudLightning,
  Search, Settings as SettingsIcon, Map as MapIcon, Table as TableIcon,
  Home, Plus, Trash2, Star, ChevronRight, ChevronDown, Play, Pause, Info
} from 'lucide-react';
import {
  ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, Bar
} from 'recharts';

/* ============================================================
   DONNÉES DE DÉMONSTRATION
   ------------------------------------------------------------
   Il n'existe pas d'API officielle Météociel, ni d'accès
   navigateur direct (CORS) aux sorties AROME / WRF / GFS.
   Ce prototype génère donc des prévisions simulées mais
   cohérentes pour concevoir et tester l'interface. Tout est
   isolé dans generateForecast() / generateEnsemble() : à
   remplacer par un vrai appel à un backend proxy le jour venu.
   ============================================================ */

const MODELS = ['AROME', 'WRF', 'GFS'];

const MODEL_INFO = {
  AROME: {
    color: '#2f6fd1',
    resolution: '1.3 km',
    portee: '0–42 h',
    desc: "Modèle français à haute résolution (Météo-France). Très fiable à courte échéance, notamment pour le relief et les orages.",
  },
  WRF: {
    color: '#1f9d6b',
    resolution: '3–9 km',
    portee: '42–84 h',
    desc: "Modèle régional à méso-échelle. Prend le relais d'AROME au-delà de son horizon, bon compromis résolution / portée.",
  },
  GFS: {
    color: '#c2720c',
    resolution: '~25 km',
    portee: '84 h–10 j',
    desc: "Modèle global (NOAA). Portée longue mais résolution plus grossière : fiabilité décroissante après 3-4 jours.",
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

function generateForecast(location, model, hours) {
  const rand = mulberry32(hashSeed(location.name + '|' + model + '|' + Math.floor(Date.now() / 3600000 / 6)));
  const bias = { AROME: 0, WRF: (rand() - 0.5) * 1.6, GFS: (rand() - 0.5) * 2.6 }[model];
  const baseTemp = 14 + Math.sin((location.lat / 90) * Math.PI) * 8 - (location.lat - 44) * 0.15;
  const now = new Date();
  const data = [];
  let pressure = 1015 + (rand() - 0.5) * 6;
  for (let h = 0; h < hours; h++) {
    const t = new Date(now.getTime() + h * 3600 * 1000);
    const diurnal = Math.sin(((t.getHours() - 6) / 24) * 2 * Math.PI) * 6;
    const spread = 1 + (h / hours) * 1.8;
    const noise = (rand() - 0.5) * 2 * spread;
    const temp = Math.round((baseTemp + diurnal + bias + noise) * 10) / 10;
    const precipRoll = rand();
    const precipThreshold = model === 'GFS' ? 0.7 : 0.8;
    const precip = precipRoll > precipThreshold ? Math.round(rand() * 6 * spread * 10) / 10 : 0;
    const windMoy = Math.round(6 + rand() * 14 + (model === 'GFS' ? rand() * 6 : 0));
    const windRaf = windMoy + Math.round(rand() * 15);
    const windDir = Math.round(rand() * 360);
    const cloud = Math.min(100, Math.round(rand() * 100 * (precip > 0 ? 1.3 : 0.9)));
    pressure += (rand() - 0.5) * 1.2 + Math.sin(h / 30) * 0.15;
    const humidity = Math.max(20, Math.min(95, Math.round(78 - (temp - 12) * 1.6 + (rand() - 0.5) * 8)));
    data.push({
      iso: t.toISOString(), t, hour: t.getHours(),
      dayKey: t.toISOString().slice(0, 10),
      dayLabel: t.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }),
      temp, precip, windMoy, windRaf, windDir, cloud,
      pressure: Math.round(pressure), humidity,
    });
  }
  return data;
}

function aggregateDaily(hourly) {
  const byDay = {};
  hourly.forEach((r) => {
    if (!byDay[r.dayKey]) byDay[r.dayKey] = { dayKey: r.dayKey, dayLabel: r.dayLabel, temps: [], precip: 0, winds: [], clouds: [] };
    byDay[r.dayKey].temps.push(r.temp);
    byDay[r.dayKey].precip += r.precip;
    byDay[r.dayKey].winds.push(r.windMoy);
    byDay[r.dayKey].clouds.push(r.cloud);
  });
  return Object.values(byDay).map((d) => ({
    dayKey: d.dayKey, dayLabel: d.dayLabel,
    tmin: Math.round(Math.min(...d.temps)), tmax: Math.round(Math.max(...d.temps)),
    precip: Math.round(d.precip * 10) / 10,
    wind: Math.round(d.winds.reduce((a, b) => a + b, 0) / d.winds.length),
    cloud: Math.round(d.clouds.reduce((a, b) => a + b, 0) / d.clouds.length),
  }));
}

function skyOf(cloud, precip) {
  if (precip > 3) return { Icon: CloudLightning, label: 'Pluie forte' };
  if (precip > 0.5) return { Icon: CloudRain, label: 'Pluie modérée' };
  if (precip > 0) return { Icon: CloudDrizzle, label: 'Pluie faible' };
  if (cloud > 75) return { Icon: Cloud, label: 'Couvert' };
  if (cloud > 55) return { Icon: Cloud, label: 'Mitigé' };
  if (cloud > 35) return { Icon: CloudFog, label: 'Voilé' };
  if (cloud > 15) return { Icon: CloudFog, label: 'Peu nuageux' };
  return { Icon: Sun, label: 'Ciel clair' };
}
function weatherText(cloud, precip) {
  if (precip > 2) return 'Pluie forte';
  if (precip > 0.5) return 'Pluie modérée';
  if (precip > 0) return 'Pluie faible';
  if (cloud > 75) return 'Couvert';
  if (cloud > 55) return 'Mitigé';
  if (cloud > 35) return 'Voilé';
  if (cloud > 15) return 'Peu nuageux';
  return 'Ciel clair';
}

/* --- Frise combinée multi-modèles (gère les amplitudes différentes) --- */
function generateBlendedTimeline(location) {
  const arome = generateForecast(location, 'AROME', 84);
  const wrf = generateForecast(location, 'WRF', 84);
  const gfs = generateForecast(location, 'GFS', 240);
  const rows = [];
  for (let h = 0; h < 42; h++) rows.push({ ...arome[h], model: h === 0 ? 'AROME' : null, phase: 'arome' });
  for (let h = 42; h < 84; h++) rows.push({ ...wrf[h], model: h === 42 ? 'WRF' : null, phase: 'wrf' });
  let dailyStarted = false;
  for (let h = 84; h < 240; h++) {
    const r = gfs[h];
    if ([2, 8, 14, 20].includes(r.hour)) {
      rows.push({ ...r, model: !dailyStarted ? 'GFS' : null, phase: 'gfs-daily' });
      dailyStarted = true;
    }
  }
  let prevDay = null;
  rows.forEach((r) => { r.isNewDay = r.dayKey !== prevDay; prevDay = r.dayKey; });
  return rows;
}

/* --- Diagramme d'ensemble (façon PE-AROME) --- */
const MEMBER_COLORS = ['#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#84cc16', '#f43f5e', '#6366f1'];
function generateEnsemble(location, model, hours = 45, members = 8) {
  const rand = mulberry32(hashSeed(location.name + model + 'ens'));
  const rows = [];
  for (let h = 0; h < hours; h++) {
    const t850base = 8 + (h / hours) * 12 + Math.sin(h / 8) * 2;
    const t500base = -8 - Math.sin(h / 15) * 3 - (h > 30 ? (h - 30) * 0.12 : 0);
    const spread = 0.4 + (h / hours) * 3.2;
    const row = { hour: h };
    let sum850 = 0, sum500 = 0;
    for (let i = 0; i < members; i++) {
      const v850 = Math.round((t850base + (rand() - 0.5) * spread * 2) * 10) / 10;
      const v500 = Math.round((t500base + (rand() - 0.5) * spread * 1.4) * 10) / 10;
      row['m850_' + i] = v850; row['m500_' + i] = v500;
      sum850 += v850; sum500 += v500;
    }
    row.mean850 = Math.round((sum850 / members) * 10) / 10;
    row.mean500 = Math.round((sum500 / members) * 10) / 10;
    row.control850 = Math.round((t850base + (rand() - 0.5) * 0.5) * 10) / 10;
    row.control500 = Math.round((t500base + (rand() - 0.5) * 0.5) * 10) / 10;
    row.precip = rand() > 0.85 ? Math.round(rand() * 3 * 10) / 10 : 0;
    row.snow = row.mean850 < 1;
    rows.push(row);
  }
  return rows;
}

/* ============================================================ */

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

  const hourly = useMemo(() => generateForecast(dashLoc, model, 72), [dashLoc, model]);
  const timeline = useMemo(() => generateBlendedTimeline(dashLoc), [dashLoc]);
  const ensemble = useMemo(() => generateEnsemble(dashLoc, model), [dashLoc, model]);
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
        <div style={{ fontSize: 12.5, fontWeight: 500, marginLeft: 8, marginBottom: 2 }}>Courbe {model} (72h)</div>
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
      </div>

      {/* Diagramme d'ensemble façon PE-AROME */}
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
              Run de contrôle, moyenne des scénarios et perturbations de l'ensemble {model} sur 45h. Plus les traces fins divergent, moins la prévision est fiable.
            </div>
            <div style={{ fontSize: 10.5, color: C.muted, margin: '0 4px 2px' }}>Temp. 850 hPa (°C)</div>
            <ResponsiveContainer width="100%" height={130}>
              <ComposedChart data={ensemble} margin={{ top: 4, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid stroke={C.border} vertical={false} />
                <XAxis dataKey="hour" tick={{ fontSize: 9, fill: C.muted }} interval={7} tickLine={false} axisLine={{ stroke: C.border2 }} />
                <YAxis tick={{ fontSize: 9, fill: C.muted }} tickLine={false} axisLine={false} width={24} />
                <Tooltip contentStyle={{ background: '#fff', border: `1px solid ${C.border2}`, fontSize: 10.5, borderRadius: 4 }} />
                {Array.from({ length: 8 }, (_, i) => (
                  <Line key={i} type="monotone" dataKey={'m850_' + i} stroke={MEMBER_COLORS[i]} strokeWidth={1} dot={false} opacity={0.55} />
                ))}
                <Line type="monotone" dataKey="control850" stroke="#1e3a8a" strokeWidth={2.4} dot={false} />
                <Line type="monotone" dataKey="mean850" stroke="#dc2626" strokeWidth={2.4} dot={false} />
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
                  <Line key={i} type="monotone" dataKey={'m500_' + i} stroke={MEMBER_COLORS[i]} strokeWidth={1} dot={false} opacity={0.55} />
                ))}
                <Line type="monotone" dataKey="control500" stroke="#1e3a8a" strokeWidth={2.4} dot={false} />
                <Line type="monotone" dataKey="mean500" stroke="#dc2626" strokeWidth={2.4} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
            <div style={{ fontSize: 10.5, color: C.muted, margin: '6px 4px 2px' }}>Précipitations — points = risque neige (850hPa &lt; 1°C)</div>
            <ResponsiveContainer width="100%" height={70}>
              <ComposedChart data={ensemble} margin={{ top: 4, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="hour" hide />
                <YAxis tick={{ fontSize: 9, fill: C.muted }} tickLine={false} axisLine={false} width={24} />
                <Bar dataKey="precip" fill="#2f8fce" radius={[2, 2, 0, 0]}>
                </Bar>
                <Line type="monotone" dataKey={(d) => (d.snow ? 0.2 : null)} stroke="#7c3aed" strokeWidth={0} dot={{ r: 2.5, fill: '#7c3aed' }} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 14, padding: '6px 4px 0', fontSize: 10.5, flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: C.muted }}><span style={{ width: 10, height: 2.5, background: '#1e3a8a', display: 'inline-block' }} /> Run de contrôle</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: C.muted }}><span style={{ width: 10, height: 2.5, background: '#dc2626', display: 'inline-block' }} /> Moyenne des scénarios</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: C.muted }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: '#7c3aed', display: 'inline-block' }} /> Risque neige</span>
            </div>
          </div>
        )}
      </div>

      {/* Frise combinée multi-modèles */}
      <div style={{ padding: '0 16px 4px', fontSize: 13, fontWeight: 600 }}>Prévision détaillée (modèle selon l'échéance)</div>
      <div style={{ padding: '0 16px 6px', fontSize: 11, color: C.muted, lineHeight: 1.4 }}>
        AROME jusqu'à 42h, puis WRF jusqu'à 84h, puis GFS toutes les 6h au-delà — la colonne « Modèle » indique les changements de source.
      </div>
      <div style={{ overflowX: 'auto', margin: '4px 16px 24px', border: `1px solid ${C.border}`, borderRadius: 6 }}>
        <table className="mono" style={{ borderCollapse: 'collapse', width: '100%', minWidth: 720, fontSize: 11 }}>
          <thead>
            <tr style={{ background: C.panel }}>
              <Th>Jour</Th><Th>Heure</Th><Th>Temp.</Th><Th>Vent (dir · moy · raf.)</Th>
              <Th>Pluie 1h</Th><Th>Humid.</Th><Th>Pression</Th><Th>Temps</Th><Th>Modèle</Th>
            </tr>
          </thead>
          <tbody>
            {timeline.map((r, i) => (
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
                  <Td>{r.pressure} hPa</Td>
                  <Td>{weatherText(r.cloud, r.precip)}</Td>
                  <Td style={{ color: r.model ? MODEL_INFO[r.model].color : C.muted, fontWeight: r.model ? 700 : 400 }}>{r.model || ''}</Td>
                </tr>
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function Th({ children }) { return <th style={{ textAlign: 'left', padding: '7px 10px', color: C.muted, fontWeight: 500, fontSize: 10 }}>{children}</th>; }
function Td({ children, style }) { return <td style={{ padding: '6px 10px', color: C.text, whiteSpace: 'nowrap', ...style }}>{children}</td>; }

/* ---------------- Page Comparatif ---------------- */
function ComparePage({ locations }) {
  const [model, setModel] = useState('AROME');
  const [expandedId, setExpandedId] = useState(null);
  const [expandMode, setExpandMode] = useState('3h');

  const rows = locations.map((loc) => {
    const f = generateForecast(loc, model, 3)[0];
    const { Icon } = skyOf(f.cloud, f.precip);
    return { loc, f, Icon };
  });

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
      <div style={{ margin: '0 16px', border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden' }}>
        {rows.length === 0 && <div style={{ padding: 20, fontSize: 12.5, color: C.muted }}>Aucune ville suivie pour l'instant — ajoutez-en depuis l'onglet Réglages.</div>}
        {rows.map(({ loc, f, Icon }, i) => {
          const isOpen = expandedId === loc.id;
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
                <div className="mono" style={{ width: 40, textAlign: 'right', fontSize: 13, fontWeight: 600 }}>{f.temp}°</div>
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
  const hourly = useMemo(() => generateForecast(loc, model, 24), [loc, model]);
  const daily = useMemo(() => aggregateDaily(generateForecast(loc, model, 96)), [loc, model]);
  const items = mode === '3h'
    ? [0, 3, 6, 9].map((h) => hourly[h])
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
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
        {items.map((it, i) => {
          if (mode === '3h') {
            const { Icon } = skyOf(it.cloud, it.precip);
            return (
              <div key={i} style={{ flex: '0 0 auto', minWidth: 68, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 6px', textAlign: 'center', background: '#fff' }}>
                <div className="mono" style={{ fontSize: 10.5, color: C.muted }}>{String(it.hour).padStart(2, '0')}h</div>
                <Icon size={16} color="#4f8fe8" style={{ margin: '4px auto' }} />
                <div className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{it.temp}°</div>
                <div className="mono" style={{ fontSize: 9.5, color: '#2f8fce' }}>{it.precip > 0 ? `${it.precip}mm` : '–'}</div>
              </div>
            );
          }
          const { Icon } = skyOf(it.cloud, it.precip > 0 ? 1 : 0);
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
    </div>
  );
}

/* ---------------- Page Radar ---------------- */
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
        <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Estimation schématique — pas une image radar réelle</div>
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
        <div style={{ fontSize: 12.5, fontWeight: 500, marginBottom: 8 }}>À propos des modèles</div>
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
