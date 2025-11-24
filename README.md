# Suivi d'Affaires - Application de gestion des heures

## 🚀 Démarrage rapide

### Démarrage du serveur

**IMPORTANT**: Le serveur synchronise automatiquement avec GitHub!

```bash
# Méthode recommandée (avec backup automatique)
./start.sh

# OU directement avec Node
node server.js
```

**Au démarrage, le serveur:**
1. 📥 **Pull automatiquement** les dernières données depuis GitHub
2. 🔄 Synchronise tous les appareils
3. 🚀 Démarre sur le port 10000

### Accès à l'application

Une fois le serveur démarré, ouvrez votre navigateur:
- **Local**: http://localhost:10000
- **Production**: URL de votre serveur déployé

## 🌐 Synchronisation multi-appareils

### Comment ça marche

**Synchronisation automatique via GitHub:**

1. **Écriture de données** (n'importe quel appareil):
   - Sauvegarde dans localStorage ✅
   - Commit automatique sur GitHub ✅
   - Push instantané ✅

2. **Lecture depuis un autre appareil**:
   - Démarrer le serveur → Pull auto depuis GitHub ✅
   - Données à jour instantanément! ✅
   - **100% automatique, aucune action requise!**

### Utilisation multi-appareils

**Appareil A (Bureau):**
```bash
# 1. Saisir des heures
# 2. Les données sont automatiquement commit sur GitHub
```

**Appareil B (Portable):**
```bash
# Démarrer le serveur
node server.js
# → Pull automatique depuis GitHub au démarrage!
# → Données de l'appareil A disponibles instantanément!
```

**Résultat:** Tous les appareils ont les mêmes données en temps réel!

## 📦 Système de sauvegarde (Triple protection!)

### 1. **GitHub (PRINCIPAL)** ⭐
- **Commit automatique** après chaque modification
- **Historique complet** via Git
- **Synchronisation** entre appareils
- **Restauration** possible à n'importe quel moment
- Commande: `git log` pour voir l'historique
- Commande: `git checkout <commit>` pour restaurer

### 2. Backup automatique (data.backup.json)
- Créé **automatiquement avant chaque écriture** dans data.json
- Permet de restaurer la dernière version en cas de corruption

### 3. Snapshot automatique (snapshot.json sur GitHub) ⭐
- Créé **toutes les 15 minutes** si la base contient des données
- **Commit et push automatiquement sur GitHub**
- Fichier unique `snapshot.json` qui écrase le précédent
- Permet de récupérer l'état complet toutes les 15 min
- Commande: `git checkout snapshot.json` pour restaurer

### 4. Backups manuels (dossier backups/)
- Créés au **démarrage du serveur** via `./start.sh`
- Format: `data_YYYYMMDD_HHMMSS.json`

### 5. localStorage (navigateur)
- Sauvegarde instantanée dans le navigateur
- Fonctionne hors-ligne
- Export manuel disponible

## 🔧 Structure des données

Le fichier `data.json` contient:
```json
{
  "entries": [],      // Heures saisies
  "clients": [],      // Liste des clients
  "affaires": [],     // Liste des affaires
  "postes": [],       // Liste des postes de travail
  "users": []         // Utilisateurs (dont Admin)
}
```

## 👨‍💼 Compte administrateur

Par défaut, un compte admin est créé:
- **Nom**: Admin
- **Code**: ADMIN

## 🔄 Restauration des données

### En cas de perte de données

1. **Depuis data.backup.json** (dernière sauvegarde):
   ```bash
   cp data.backup.json data.json
   ```

2. **Depuis un snapshot**:
   ```bash
   cp snapshots/snapshot_YYYY-MM-DDTHH-MM-SS.json data.json
   ```

3. **Depuis un backup manuel**:
   ```bash
   cp backups/data_YYYYMMDD_HHMMSS.json data.json
   ```

## 📱 Fonctionnalités

### Pour les utilisateurs:
- Saisie des heures de travail
- Création d'affaires de soudure
- Consultation de leurs propres saisies
- Modification/suppression de leurs entrées

### Pour les administrateurs:
- Toutes les fonctionnalités utilisateur
- Gestion des clients, affaires, postes
- Gestion des utilisateurs
- Vue globale de toutes les saisies
- Génération de PDF récapitulatifs

## 🛠️ Maintenance

### Keep-alive
Le serveur effectue un ping automatique toutes les 5 minutes pour éviter la mise en veille (utile sur les hébergements gratuits comme Render).

### Nettoyage des snapshots
Les snapshots sont automatiquement limités aux 10 plus récents. Les anciens sont supprimés automatiquement.

## 🐛 Dépannage

### Le serveur ne démarre pas
```bash
# Vérifier que les dépendances sont installées
npm install

# Redémarrer le serveur
./start.sh
```

### Les données ne se sauvegardent pas
- **Vérifiez que le serveur est démarré**: `ps aux | grep "node server"`
- Le serveur DOIT tourner en permanence pour sauvegarder les modifications

### Base de données corrompue
1. Arrêter le serveur
2. Restaurer depuis un backup (voir section Restauration)
3. Redémarrer le serveur

## 📊 Statistiques

- **Synchronisation auto**: Toutes les 30 secondes
- **Keep-alive**: Toutes les 5 minutes
- **Snapshots**: Toutes les 15 minutes
- **Snapshots conservés**: 10 derniers
