# Configuration VS Code - Auto-Sync

## 🔄 Synchronisation Automatique

Cette configuration lance automatiquement le script `auto-sync-hybrid.sh` à l'ouverture du projet dans VS Code.

### Fichiers de Configuration

- **tasks.json** : Définit la tâche de synchronisation automatique
- **settings.json** : Active l'exécution automatique des tâches

### Fonctionnement

1. À l'ouverture du dossier dans VS Code
2. VS Code lance automatiquement `auto-sync-hybrid.sh`
3. Un terminal dédié s'ouvre avec les logs de synchronisation
4. La synchronisation tourne en continu toutes les 3 secondes

### Première Utilisation

⚠️ **Important** : La première fois, VS Code demandera la permission d'exécuter des tâches automatiques.

Cliquez sur **"Autoriser"** ou **"Allow"** dans la notification qui apparaît.

### Désactiver la Synchronisation Auto

Si vous voulez désactiver temporairement :

1. Ouvrez `settings.json`
2. Changez `"task.allowAutomaticTasks": "on"` en `"off"`
3. Rechargez VS Code

### Logs de Synchronisation

Les logs apparaissent dans un terminal dédié nommé "Auto-Sync GitHub".

Vous verrez :
- ✅ Synchronisation réussie
- 📝 Modifications détectées
- 🔄 Push/Pull vers GitHub

---

**Créé avec Claude Code** 🤖
