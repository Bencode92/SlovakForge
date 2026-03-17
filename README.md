# 🇸🇰 SlovakForge

**Apprends le slovaque intelligemment** — Lis, capture, apprends.

App d'apprentissage du slovaque pour francophones, propulsée par l'IA (Claude via Cloudflare proxy).

## Fonctionnalités

- **📖 Lecteur IA** — Génère des textes sur n'importe quel thème (3 niveaux), lecture phrase par phrase avec traduction
- **📚 Capture de mots** — Clique sur les mots, l'IA les catégorise (verbe/nom/adj/conj/expression) et les enrichit
- **🎯 4 modes d'apprentissage** — Flashcards, Quiz QCM, Phrases à trous, Tableau conjugaison
- **🔄 Répétition espacée** — Système Leitner (box 0→5)
- **💾 Persistance** — Vocabulaire sauvegardé dans `data/vocab.json` via GitHub API

## Architecture

Même logique que [StudyForge](https://github.com/Bencode92/studyforge) :
- Cloudflare Worker proxy pour Claude API (pas de clé côté front)
- Token GitHub en session pour écrire les JSON
- Données dans `data/` (vocab.json qui évolue)
- Vanilla JS, pas de build step

## Utilisation

1. Ouvre [bencode92.github.io/SlovakForge](https://bencode92.github.io/SlovakForge)
2. Clique sur le tag GitHub → entre ton token (session only)
3. Génère un texte, capture des mots, apprends !

## Fichiers

```
index.html    — Shell HTML + CSS
api.js        — Claude proxy + GitHub API
app.js        — Logique app + rendu
data/vocab.json — Vocabulaire (évolue via l'app)
```
