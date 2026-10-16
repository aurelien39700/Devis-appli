# Suivi d'affaires SOMEPRE

Application web de suivi des affaires, des heures pointées par poste et des
devis client.

**Production** : https://somepre-suivi.onrender.com/

## Démarrage

Il faut une base PostgreSQL (voir [DEPLOIEMENT-RENDER.md](DEPLOIEMENT-RENDER.md)
pour une base locale avec Docker).

```bash
npm install
export DATABASE_URL=postgres://postgres:devis@localhost:5432/devis
npm run migrate   # première fois : importe data.json
npm start         # http://localhost:10000
```

Le schéma est créé automatiquement au démarrage du serveur.

## Structure

```
├── server.js                         # API REST (Express)
├── db/
│   ├── schema.sql                    # Schéma PostgreSQL
│   ├── index.js                      # Connexion, transactions
│   └── repo.js                       # Lectures et mise en forme JSON de l'API
├── scripts/migrate-json-to-postgres.js   # Import de data.json
├── index.html + atelier.js           # Application principale
├── devis_app.html + devis-app.js     # Éditeur de devis
├── client.html                       # Page publique du devis (lien par token)
└── data.json                         # Archive des données avant PostgreSQL
```

## Données

| Table | Contenu |
|---|---|
| `users` | Comptes (le compte `Admin` est obligatoire) |
| `clients`, `contacts` | Clients et leurs interlocuteurs |
| `affaires` | Affaires, statut `brouillon` → `envoye` → `en_cours` → `terminee` → `archivee` |
| `postes` | Postes de travail : taux facturé, coût, machine, ordre |
| `entries` | Heures pointées (affaire, poste, utilisateur) |
| `devis`, `devis_lignes` | Un devis par affaire, lignes travail / machine / achat |
| `fournisseurs`, `achats_biblio` | Libellés proposés dans le devis |
| `entreprise` | Coordonnées imprimées sur les devis |

Supprimer une affaire supprime ses heures et son devis (clés étrangères en
cascade).

## Authentification

- **Admin** : code `ADMIN` par défaut
- **Utilisateurs** : créés via l'interface ; ils ne peuvent supprimer que
  leurs propres saisies

## Déploiement

Render.com (application) + Neon (base PostgreSQL gratuite) : voir [DEPLOIEMENT-RENDER.md](DEPLOIEMENT-RENDER.md).
