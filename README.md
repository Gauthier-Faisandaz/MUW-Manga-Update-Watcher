# MUW — Manga Update Watcher

Système d'automatisation qui surveille la sortie de nouveaux chapitres de mangas, synchronise ma progression de lecture, et m'envoie une notification push dès qu'un chapitre suivi est disponible. L'état de chaque série (dernier chapitre sorti, dernier chapitre lu, date du dernier contrôle, statut de lecture) est centralisé dans une base de données Notion.

Projet personnel développé avec [n8n](https://n8n.io/) dans le cadre de ma reconversion vers le développement / l'automatisation.

## Fonctionnalités

- Surveillance périodique (toutes les 2 minutes) des mangas suivis, avec vérification de la fraîcheur des données pour éviter de scraper trop souvent une même série.
- Extraction du dernier chapitre publié directement depuis la page du manga (scraping HTML ciblé par sélecteurs CSS).
- Comparaison automatique avec le dernier chapitre connu, et mise à jour de la base Notion uniquement si une nouveauté est détectée.
- Normalisation des dates relatives ("il y a 3 jours", "hier"...) en dates calendaires exploitables, via un LLM avec modèle de secours en cas d'échec du premier.
- Notification push instantanée (ntfy.sh) en cas de nouveau chapitre ou d'erreur technique.
- Deux webhooks pour interagir avec le système de l'extérieur : mise à jour du chapitre lu en un clic, et ajout d'un nouveau manga au suivi.
- Gestion des erreurs à chaque étape critique (requêtes HTTP, appels LLM, mises à jour Notion) pour ne jamais laisser le workflow planter silencieusement.

## Architecture

Le projet est composé de deux workflows n8n complémentaires :

**1. `Update_Watcher`** (déclenché toutes les 2 minutes)

```
Cron (2 min) → Notion: sélectionner un manga à vérifier
             → HTTP: charger la page du manga
             → Extraction HTML: dernier chapitre + date de sortie
             → Comparaison avec le chapitre connu
                 ├─ Pas de nouveauté → mise à jour de la date de dernier check
                 └─ Nouveau chapitre → normalisation de la date (LLM + fallback)
                                     → mise à jour Notion (chapitre, date, check)
                                     → notification push (ntfy.sh)
```

**2. `Webhook_URL_Monitor`** (déclenché par appel HTTP externe)

```
Webhook "chapitre lu" → extraction de l'URL de base du manga
                       → recherche de la fiche Notion correspondante
                       → mise à jour du dernier chapitre lu + statut de lecture

Webhook "nouveau manga" → extraction de l'URL de base du manga
                         → création d'une nouvelle fiche Notion
```

Cette séparation permet de découpler la veille automatique (côté serveur) de l'interaction utilisateur (déclenchée manuellement, par exemple depuis une extension de navigateur ou un raccourci mobile pendant la lecture).

## Stack technique

- **n8n** — orchestration des workflows et logique métier
- **Notion API** — base de données comme source de vérité (catalogue des mangas suivis, progression de lecture)
- **Scraping HTML** — extraction ciblée par sélecteurs CSS (pas d'API officielle disponible côté source)
- **LLM (OpenRouter / Groq — Llama 3.3 70B)** — interprétation de dates en langage naturel, avec bascule automatique vers un second fournisseur en cas d'échec
- **ntfy.sh** — notifications push sans backend dédié
- **Webhooks** — points d'entrée pour déclenchements externes

## Compétences mises en œuvre

- Conception d'un pipeline d'automatisation multi-étapes avec branchements conditionnels
- Intégration d'API tierces (Notion, LLM, service de notification)
- Web scraping et parsing de données semi-structurées
- Gestion de la résilience : retries, fallback entre fournisseurs LLM, sorties d'erreur dédiées
- Modélisation de données dans une base Notion
- Architecture événementielle via webhooks pour les interactions temps réel

## Structure du repo

```
MUW-Manga-Update-Watcher/
├── README.md
└── workflows/
    ├── Update_Watcher.json          # veille automatique + notifications
    └── Webhook_URL_Monitor.json     # webhooks (lecture / ajout de manga)
```

Les exports JSON sont directement importables dans n8n (`Workflows → Import from File`). Les identifiants sensibles (base Notion, webhooks, topic de notification) ont été remplacés par des placeholders (`YOUR_...`) : il faut les reconfigurer avec ses propres identifiants avant utilisation.

## Configuration nécessaire

- Une instance n8n (cloud ou self-hosted)
- Une base de données Notion avec les propriétés : `Nom` (titre), `URL`, `Type de média`, `État de l'œuvre`, `Chapitre`, `Dernier chapitre lu`, `Lecture`, `Date dernier check`, `Date dernier chapitre sorti`
- Un compte ntfy.sh (gratuit) et un topic personnel pour les notifications
- Des identifiants API pour OpenRouter et/ou Groq (LLM)
- Les credentials Notion configurés dans n8n

## Limites & pistes d'amélioration

- Le scraping est actuellement spécifique à un site source (mangaread.org) ; l'ajouter à d'autres sources demanderait un nœud d'extraction dédié par source.
- Pas de gestion de rate-limiting explicite côté scraping.
- Le système pourrait être étendu avec un dashboard de suivi ou une intégration directe avec une app de lecture.

## Licence

MIT — voir [LICENSE](LICENSE).
