# Déploiement : application sur Render, base gratuite chez Neon

L'application tourne sur Render. Les données sont dans une base PostgreSQL
**gratuite** hébergée chez [Neon](https://neon.tech). Le serveur ne fait plus
de commit Git : `data.json` reste dans le dépôt comme archive et comme source
de la migration initiale.

## 1. Créer la base gratuite chez Neon (une fois)

1. Aller sur https://neon.tech, cliquer **Sign up**. Se connecter avec GitHub
   ou Google, sans carte bancaire.
2. Choisir l'offre **Free**.
3. Créer un projet :
   - **Project name** : `somepre`
   - **Postgres version** : la version proposée par défaut
   - **Region** : la même que le service Render. Elle est indiquée sur la page
     du service `somepre-suivi` (ex. Frankfurt → *AWS Europe Central 1
     (Frankfurt)*, Oregon → *AWS US West 2 (Oregon)*).
4. Une fois le projet créé, cliquer **Connect** et copier la **connection
   string**. Elle ressemble à :
   ```
   postgresql://neondb_owner:xxxx@ep-xxxx-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require
   ```
   Garder l'option **Connection pooling** activée (l'adresse contient
   `-pooler`). Si la chaîne se termine par `&channel_binding=require`,
   supprimer ce morceau.

> **Limites de l'offre gratuite** (à vérifier sur https://neon.tech/pricing,
> elles évoluent) : 0,5 Go de stockage (la base SOMEPRE fait moins de 5 Mo),
> et la base se met en veille après quelques minutes sans activité. La
> première requête après une pause prend alors environ une seconde de plus.
> L'historique de restauration est court : faire une sauvegarde régulière
> (voir § 4).

## 2. Bascule depuis data.json (une fois)

À faire à un moment calme : les saisies faites pendant la bascule seraient
perdues.

1. **Prévenir l'équipe** de ne plus saisir pendant ~10 minutes.
2. **Récupérer le dernier `data.json`** (le serveur actuel le pousse sur GitHub
   à chaque modification) :
   ```bash
   git pull origin main
   ```
3. **Importer les données** dans Neon, depuis le Codespace :
   ```bash
   DATABASE_URL='postgresql://...neon.tech/neondb?sslmode=require' npm run migrate
   ```
   Le script affiche un tableau de contrôle (attendu / obtenu par table et
   total des heures) et annule tout en cas d'écart. Il signale aussi les
   références orphelines éventuelles (client, poste ou affaire supprimés).
4. **Brancher Render sur Neon** : Dashboard Render → service `somepre-suivi`
   → **Environment** :
   - ajouter `DATABASE_URL` = la connection string Neon
   - supprimer `GITHUB_TOKEN` et `GITHUB_REPO` (plus utilisés)
   - **Save Changes**
5. **Déployer** : **Manual Deploy** → **Deploy latest commit**.
6. **Vérifier** :
   ```bash
   curl https://somepre-suivi.onrender.com/health
   # {"status":"ok","db":"ok",...}
   ```
   puis ouvrir l'application et contrôler quelques affaires.

En cas de problème, redéployer le commit précédent remet l'ancienne version
sur data.json.

## 3. Coût

| Élément | Offre | Prix |
|---|---|---|
| Base PostgreSQL | Neon Free | 0 € |
| Application | Render (offre actuelle du service) | inchangé |

## 4. Sauvegardes

À faire de temps en temps (par exemple chaque semaine), depuis le Codespace :

```bash
pg_dump 'postgresql://...neon.tech/neondb?sslmode=require' > sauvegarde-$(date +%F).sql
```

Si `pg_dump` est absent : `sudo apt-get install -y postgresql-client`.

## Développement local

```bash
docker run -d --name devis-pg -e POSTGRES_PASSWORD=devis -e POSTGRES_DB=devis -p 5432:5432 postgres:16
export DATABASE_URL=postgres://postgres:devis@localhost:5432/devis
npm run migrate          # importe data.json (ajouter --reset pour réimporter)
npm start                # http://localhost:10000
```
