/**
 * Stockage des réglages (villes suivies) directement dans le dépôt GitHub,
 * via un fichier data/settings.json et l'API Contents de GitHub.
 *
 * ⚠️ Le jeton (VITE_GH_TOKEN) est visible dans le JS envoyé au navigateur —
 * ce n'est PAS un secret côté client. C'est pour ça qu'il doit être un jeton
 * "fine-grained" limité UNIQUEMENT à ce dépôt avec la permission
 * "Contents: Read and write" (rien d'autre). Voir le README pour la
 * procédure de création.
 */

const OWNER = import.meta.env.VITE_GH_OWNER;
const REPO = import.meta.env.VITE_GH_REPO;
const TOKEN = import.meta.env.VITE_GH_TOKEN;
const PATH = 'data/settings.json';

export function githubConfigured() {
  return Boolean(OWNER && REPO && TOKEN);
}

function b64EncodeUnicode(str) {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode('0x' + p1)));
}
function b64DecodeUnicode(str) {
  return decodeURIComponent(atob(str).split('').map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
}

export async function fetchSettings() {
  if (!githubConfigured()) return null;
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}`;
  const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
  if (res.status === 404) return null; // pas encore créé
  if (!res.ok) throw new Error(`Lecture GitHub échouée (${res.status})`);
  const json = await res.json();
  return JSON.parse(b64DecodeUnicode(json.content));
}

export async function saveSettings(data) {
  if (!githubConfigured()) throw new Error('Configuration GitHub manquante (VITE_GH_OWNER / VITE_GH_REPO / VITE_GH_TOKEN).');
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}`;
  let sha;
  const current = await fetch(url, { headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${TOKEN}` } });
  if (current.ok) { const j = await current.json(); sha = j.sha; }
  const body = {
    message: 'Mise à jour des villes suivies',
    content: b64EncodeUnicode(JSON.stringify(data, null, 2)),
    ...(sha ? { sha } : {}),
  };
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Écriture GitHub échouée (${res.status}) ${errText}`);
  }
  return res.json();
}

export function checkPassword(pwd) {
  const expected = import.meta.env.VITE_APP_PASSWORD;
  return Boolean(expected) && pwd === expected;
}
export function passwordConfigured() {
  return Boolean(import.meta.env.VITE_APP_PASSWORD);
}
