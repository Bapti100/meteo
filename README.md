# Météo multi-modèles

Prototype de site météo (AROME / WRF / GFS) : prévisions détaillées, diagramme
d'ensemble, comparatif des villes suivies et radar de précipitations.

> ⚠️ Les données affichées sont **simulées** (voir le haut de `src/App.jsx`) :
> il n'existe pas d'API publique gratuite pour Météociel ni d'accès
> navigateur direct aux sorties AROME/WRF/GFS. Il faudra brancher un vrai
> backend (proxy) pour des données réelles — voir la section *Suite* plus bas.

## Développer en local

```bash
npm install
npm run dev
```

Ouvre l'URL affichée dans le terminal (par défaut http://localhost:5173).

## Mettre en ligne sur GitHub Pages

1. Crée un dépôt GitHub et pousse ce dossier dedans (`git init`, `git add .`,
   `git commit -m "init"`, `git remote add origin <url>`, `git push -u origin main`).
2. Dans `vite.config.js`, remplace `base: '/meteo-multimodele/'` par
   `'/<nom-exact-de-ton-depot>/'` (ou `'/'` si le dépôt s'appelle
   `<ton-user>.github.io`).
3. Sur GitHub : **Settings → Pages → Build and deployment → Source : GitHub Actions**.
4. À chaque `git push` sur `main`, le workflow `.github/workflows/deploy.yml`
   installe les dépendances, construit le site (`dist/`) et le publie
   automatiquement. Le site sera accessible à
   `https://<ton-user>.github.io/<nom-du-depot>/`.

Rien d'autre à committer : `node_modules` et `dist` sont ignorés
(`.gitignore`), donc le dépôt reste de quelques centaines de Ko — largement
sous la limite de 25 Mo.

## Structure

```
index.html            point d'entrée HTML
src/main.jsx           montage React
src/App.jsx             toute l'application (données simulées + 4 pages)
vite.config.js          config Vite (base = chemin GitHub Pages)
.github/workflows/      déploiement automatique
```

## Suite : brancher de vraies données

Toute la génération de données est isolée dans `src/App.jsx`
(`generateForecast`, `generateBlendedTimeline`, `generateEnsemble`). Pour
brancher de vraies données il faudra :

- un petit backend (Node/Python) qui interroge le portail API officiel de
  Météo-France, et/ou une source ouverte comme Open-Meteo (pas de clé
  requise) ;
- éventuellement le paquet Python `meteociel-api` pour Météociel, exécuté
  côté serveur (impossible depuis le navigateur à cause de CORS) ;
- remplacer les fonctions `generate*` par des appels `fetch()` vers ce
  backend.
