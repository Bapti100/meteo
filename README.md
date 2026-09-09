
# Météo multi-modèles

Site météo personnel centré sur la France : prévisions détaillées croisant
plusieurs modèles numériques (AROME, ICON-EU, GFS), diagramme d'ensemble façon
PE-AROME, comparatif de plusieurs villes suivies, et radar de précipitations
en temps réel sur une carte interactive.

Ce README documente en détail ce qui a été fait, pourquoi, et comment le
site fonctionne — pour que le projet reste compréhensible et modifiable
dans le temps.

---

## Comment ce site a été fait

Ce site a été conçu et codé par **Claude** (Anthropic), en suivant pas à pas
les directives de l'auteur : chaque fonctionnalité, chaque choix de design,
chaque source de données a été discuté puis implémenté itérativement,
testé (build Vite vérifié à chaque étape), corrigé quand des bugs
apparaissaient une fois le site en ligne, jusqu'à obtenir le résultat
actuel. Rien n'a été généré en une seule fois : le site est le produit
d'une trentaine d'allers-retours successifs entre demandes, tests réels sur
GitHub Pages, retours de bugs (captures d'écran à l'appui) et corrections.

---

## Fonctionnalités

### 1. Prévisions (page d'accueil)
- Ville principale configurable, recherche d'une autre ville à la volée.
- Trois onglets de modèle : **AROME**, **ICON-EU**, **GFS** (voir plus bas
  pourquoi ICON-EU remplace le WRF demandé au départ).
- Courbe température/précipitations sur l'amplitude **maximale réellement
  disponible** pour le modèle choisi (ex : AROME s'arrête où ses données
  s'arrêtent réellement, GFS s'étend sur 10 jours avec un point toutes les
  6h pour rester lisible).
- **Diagramme d'ensemble** (façon PE-AROME de Météo-France) : traits fins =
  membres individuels de l'ensemble, trait bleu = run de contrôle, trait
  rouge = moyenne arithmétique (pas un écart-type), et un vrai **box-plot**
  (boîte = 25e-75e percentile, trait fin = min-max) pour les précipitations.
- **Frise détaillée multi-modèle** façon Météociel : AROME heure par heure
  jusqu'à 42h, relais ICON-EU jusqu'à 84h, puis GFS toutes les 6h au-delà,
  avec cellules colorées (température, rafales, humidité) et icônes météo.

### 2. Comparatif
Tableau condensé de toutes les villes suivies (température, ciel,
précipitations, vent). Cliquer sur une ville déroule un aperçu rapide, au
choix par pas de 3h ou par jour (3 prochains jours).

### 3. Radar
Carte interactive (MapLibre GL) centrée sur la ville principale, avec les
vraies images radar RainViewer (historique 2h + prévision/nowcast 30 min,
rafraîchies toutes les 5 min) superposées à un fond OpenStreetMap. Les
villes suivies apparaissent en marqueurs.

### 4. Réglages
Gestion des villes suivies et de la ville principale, avec sauvegarde
persistante (voir plus bas) et recherche de ville via la BAN (Base Adresse
Nationale) ou par coordonnées GPS avec nom personnalisé.

---

## Sources de données et pourquoi ces choix

Aucune de ces sources ne nécessite de clé API payante — c'était une
contrainte de départ du projet.

| Donnée | Source | Pourquoi |
|---|---|---|
| Prévisions AROME / ICON-EU / GFS, diagramme d'ensemble | [Open-Meteo](https://open-meteo.com/) | Gratuite, sans clé, autorise les appels directs depuis le navigateur (CORS), couvre plusieurs modèles dont AROME (Météo-France) |
| Recherche de ville | [BAN — Base Adresse Nationale](https://adresse.data.gouv.fr/) | Gratuite, sans clé, données officielles françaises, autorise le CORS |
| Radar de précipitations | [RainViewer](https://www.rainviewer.com/) | Seule offre gratuite trouvée donnant de vraies images radar mondiales en tuiles directement utilisables dans une carte web, sans clé |
| Fond de carte | [OpenStreetMap](https://www.openstreetmap.org/) | Standard gratuit, aucune inscription |

**Pourquoi ICON-EU et pas WRF ?** Le WRF n'est proposé par aucune API
gratuite trouvée (Météo-France ne le diffuse pas en open data). ICON-EU
(modèle régional allemand, DWD) est utilisé comme relais entre AROME
(courte échéance) et GFS (longue échéance) car il couvre une portée et une
résolution comparables — c'est explicité directement dans l'app (onglet du
modèle).

**Pourquoi le diagramme d'ensemble n'est pas le vrai PE-AROME ?** Le produit
d'ensemble de Météo-France n'est pas public gratuitement. Open-Meteo expose
un ensemble équivalent (GEFS/ICON selon le modèle choisi) avec la même
logique (plusieurs membres perturbés + run de contrôle + moyenne), utilisé
comme substitut assumé et indiqué comme tel dans l'app.

**Pourquoi le radar reste "schématique" nulle part et 100% réel maintenant ?**
Les toutes premières versions du site simulaient des données aléatoires en
l'absence de source réelle identifiée ; RainViewer a ensuite été intégré
pour afficher de vraies images radar.

---

## Choix techniques

- **React + Vite** : site 100% statique, buildable en quelques secondes,
  compatible GitHub Pages sans aucun serveur à maintenir.
- **Recharts** pour les graphiques classiques (courbes, barres), **SVG
  dessiné à la main** pour le box-plot de précipitations (Recharts n'a pas
  de composant box-plot natif).
- **MapLibre GL** pour la carte radar (gratuit, sans clé, contrairement à
  Mapbox GL qui nécessite un compte).
- **lucide-react** pour les icônes.
- Palette claire, dense, inspirée des tableaux Météociel (cellules
  colorées par valeur) plutôt qu'un design "carte SaaS" générique.
- Mobile d'abord : toute l'interface est pensée pour un écran en format
  portrait (navigation par onglets en bas d'écran).

---

## Sauvegarde des villes suivies (sans base de données externe)

Les villes suivies et la ville principale sont sauvegardées directement
dans ce dépôt, dans `data/settings.json`, via l'API GitHub. Un mot de passe
côté site évite les modifications accidentelles — **ce n'est pas une vraie
sécurité** (le code du site est public, donc lisible par n'importe qui),
juste un garde-fou pratique pour un usage personnel à un seul utilisateur.

### 1. Créer le jeton GitHub

1. Va directement sur **https://github.com/settings/personal-access-tokens/new**.
2. Nom : `meteo-site`.
3. Expiration : à ton choix.
4. **Repository access** → *Only select repositories* → choisis uniquement `meteo`.
5. **Permissions → Repository permissions → Contents** → **Read and write**. Rien d'autre.
6. Génère le jeton et copie-le immédiatement (il ne sera plus jamais affiché).

### 2. Ajouter les secrets du dépôt

**Settings → Secrets and variables → Actions → New repository secret** :

| Nom du secret | Valeur |
|---|---|
| `GH_OWNER` | `Bapti100` |
| `GH_REPO` | `meteo` |
| `GH_TOKEN` | le jeton copié à l'étape précédente |
| `APP_PASSWORD` | le mot de passe pour déverrouiller l'édition des réglages |

Au prochain push, le workflow reconstruit le site avec ces valeurs
injectées. Si le dépôt est public, n'importe qui peut lire le jeton dans le
JS livré au navigateur — le risque est borné à "quelqu'un modifie ce
dépôt" (grâce au scope limité à *Contents* sur ce seul dépôt), jamais à
l'ensemble du compte GitHub. En cas de doute, révoque le jeton et
régénères-en un nouveau.

---

## Développer en local

```bash
npm install
cp .env.example .env   # puis renseigne les 4 valeurs ci-dessus
npm run dev
```

## Déployer sur GitHub Pages

1. Fichiers à la racine du dépôt (pas dans un sous-dossier).
2. Dans `vite.config.js`, `base` doit correspondre au nom exact du dépôt.
3. **Settings → Pages → Build and deployment → Source : GitHub Actions**.
4. Configurer les 4 secrets ci-dessus, puis push sur `main` : le workflow
   `.github/workflows/deploy.yml` installe les dépendances, construit le
   site et le publie automatiquement.

---

## Structure des fichiers

```
index.html                point d'entrée HTML
src/main.jsx                montage React
src/App.jsx                  toute l'application (4 pages)
src/githubStore.js            lecture/écriture de data/settings.json via l'API GitHub
data/settings.json            villes suivies (modifié automatiquement par l'app)
vite.config.js                config Vite (base = chemin GitHub Pages)
.github/workflows/deploy.yml  build + déploiement automatique, injection des secrets
```

## Limites connues

- Radar : image réelle mais **prévision (nowcast) limitée à 30 minutes**
  dans l'offre gratuite RainViewer (1-2h nécessiterait un abonnement payant
  chez eux).
- AROME (via Open-Meteo) ne fournit ni pression au niveau mer ni code
  météo texte natif : le temps affiché est déduit de la couverture
  nuageuse par couche.
- Le mot de passe des réglages n'est pas une sécurité réelle (voir plus haut).
- BAN ne couvre que la France.

---

## Auteur

**Baptiste Fantou** — Projet personnel (2026)

---

## Licence

Ce projet est un projet personnel. Les données collectées concernent données météo publics et ne contiennent aucune information sensible. Pour toute question ou réutilisation, merci de contacter l'auteur.

---

## Contact

- Email : [baptiste.de.livry@gmail.com](mailto:baptiste.de.livry@gmail.com)
- GitHub : [Bapti100](https://github.com/Bapti100)

---

**© 2026 - Baptiste Fantou**
