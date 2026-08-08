# EconoSchool

Reconstruction du projet **EconoSchool Pro** (ancien monolithe HTML/JS) avec la même
architecture que EcoleWeb : frontend React/Vite séparé du backend Express, base de données
Supabase partagée (celle déjà en production : projet `econoschool`).

## Structure

```
EconoSchool/
├── frontend/     → React + Vite + Tailwind, déployé sur Vercel (econoschool.vercel.app)
├── backend/      → Express, déployé sur Render (service "econoschool")
└── README.md
```

## Pourquoi cette reconstruction

L'ancien projet ("econoschool pro") était un seul fichier `app.js` de 3300+ lignes avec :
- Authentification vérifiée côté client (mot de passe en clair dans `config.js`)
- Clé Supabase et identifiants SMS Orange exposés dans le navigateur
- Aucune séparation composants / pages

Cette v2 corrige ça :
- Authentification vérifiée côté **backend** (Express), jamais de secret exposé au frontend
- Composants React réutilisables page par page
- Mêmes tables Supabase existantes (`eleves`, `paiements`, `caisses`, `banque`, `tarifs`,
  `sms_log`, `utilisateurs`, etc.) — **aucune donnée n'est perdue**, on branche juste une
  meilleure architecture dessus.

## Étape actuelle : squelette

Ce commit contient uniquement le squelette qui tourne (écran de connexion fonctionnel côté
UI, backend prêt à recevoir les routes). Chaque page de l'ancien projet (Élèves, Paiements,
Caisse, Rapports, etc.) sera reconstruite une par une dans les prochaines étapes.

## Déploiement

Voir les commandes en bas de chaque réponse — frontend sur Vercel, backend sur Render
(auto-déployé au push sur `main`).
