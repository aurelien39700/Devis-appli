# 📱 Système de Suivi d'Affaires

Application web de suivi de soudure et gestion d'affaires avec synchronisation temps réel.

## 🚀 Démarrage Rapide

### Site Web
**Production** : https://somepre-suivi.onrender.com/

### Développement Local
```bash
npm install
node server.js
```

Le serveur démarre sur http://localhost:10000

---

## 📁 Structure du Projet

### Fichiers Principaux
```
├── index.html          # Interface utilisateur
├── app.js             # Logique frontend (sync, cache-busting)
├── server.js          # API REST + sync Git
├── data.json          # Base de données JSON
├── package.json       # Dépendances Node.js
└── manifest.json      # Configuration PWA
```

### Scripts de Synchronisation
```
├── auto-sync-hybrid.sh    # ⭐ Sync automatique (GitHub + API)
├── sync-now.sh           # Sync manuelle instantanée
├── test-sync.sh          # Tests de configuration
├── check-server-sync.sh  # Diagnostic serveur
└── watch-data.sh         # Surveillance fichier
```

### Documentation
```
├── README-SYNC.md         # Guide synchronisation
├── SYNC-GUIDE.md         # Documentation détaillée
├── CHANGELOG-SYNC.md     # Historique améliorations
├── FIXES-APPLIED.md      # Corrections appliquées
├── fix-delete-issues.md  # Dépannage suppressions
├── fix-render-sync.md    # Réparer Render
└── force-sync-render.md  # Réparation urgente
```

---

## ✨ Fonctionnalités

### Gestion
- ✅ Clients
- ✅ Affaires (projets)
- ✅ Postes de travail
- ✅ Entrées/sorties de soudure
- ✅ Utilisateurs avec authentification

### Synchronisation Temps Réel
- ✅ Auto-sync toutes les 30 secondes
- ✅ Cache-busting automatique
- ✅ Notifications visuelles
- ✅ VS Code ↔ GitHub ↔ Site

### Export
- ✅ Export Excel des rapports
- ✅ Export PDF par affaire
- ✅ Backup automatique

---

## 🔄 Synchronisation

### Utilisation Automatique (Recommandé)
```bash
./auto-sync-hybrid.sh
```
Laissez tourner en arrière-plan pour sync continue.

### Utilisation Manuelle
```bash
./sync-now.sh
```
Pour une synchronisation immédiate.

### Architecture
```
📱 Site Web ──► 🐙 GitHub ──► 💻 VS Code
     │              ▲            │
     └── API (3s) ──┴────────────┘
```

---

## 🛠️ Configuration

### Variables d'Environnement (Render)
```bash
GITHUB_TOKEN=your_token_here      # Token GitHub avec permissions repo
GITHUB_REPO=user/repo             # Votre repository
PORT=10000                        # Port du serveur (défaut: 10000)
```

### Configuration Git Locale
```bash
git config pull.rebase false
git config user.name "Your Name"
git config user.email "your@email.com"
```

---

## 📊 Base de Données

### Structure data.json
```json
{
  "entries": [],    // Entrées de soudure
  "clients": [],    // Liste des clients
  "affaires": [],   // Projets/affaires
  "postes": [],     // Postes de travail
  "users": []       // Utilisateurs
}
```

### Reset Complet
Pour repartir sur une base propre :
```bash
# Vider toutes les données (garde uniquement Admin)
echo '{
  "entries": [],
  "clients": [],
  "affaires": [],
  "postes": [],
  "users": [{"id": "1", "name": "Admin", "password": "ADMIN"}]
}' > data.json

# Pousser vers GitHub
git add data.json
git commit -m "Clean: Reset base de données"
git push origin main
```

---

## 🔐 Authentification

### Comptes par Défaut
- **Admin** : Code `ADMIN`
- **Utilisateurs** : Créés via l'interface

### Permissions
- **Admin** : Toutes permissions (création, modification, suppression)
- **Utilisateur** : Peut voir et ajouter, peut supprimer uniquement ses propres entrées

---

## 🧪 Tests

### Test de Configuration
```bash
./test-sync.sh
```

### Test des API
```bash
# Health check
curl https://somepre-suivi.onrender.com/health

# Liste des clients
curl https://somepre-suivi.onrender.com/api/clients

# Diagnostic Git
curl https://somepre-suivi.onrender.com/api/git-status
```

---

## 📱 Déploiement

### Render.com
1. Connecter le repository GitHub
2. Configurer les variables d'environnement
3. Déployer automatiquement

### Variables Requises
- `GITHUB_TOKEN` : Token avec permissions `repo`
- `GITHUB_REPO` : Format `username/repository`

---

## 🐛 Dépannage

### Problèmes de Synchronisation
```bash
# Diagnostic complet
./check-server-sync.sh

# Forcer une synchronisation
./sync-now.sh

# Reset Git sur Render
git reset --hard origin/main
```

### Cache Navigateur
Le cache est automatiquement invalidé toutes les 30 secondes.
Pour forcer : `Ctrl+Shift+R` (ou `Cmd+Shift+R` sur Mac)

### Erreurs Git
Consultez [force-sync-render.md](force-sync-render.md) pour les solutions.

---

## 📚 Documentation Complète

- **[README-SYNC.md](README-SYNC.md)** - Guide synchronisation rapide
- **[SYNC-GUIDE.md](SYNC-GUIDE.md)** - Documentation exhaustive
- **[CHANGELOG-SYNC.md](CHANGELOG-SYNC.md)** - Historique des améliorations
- **[FIXES-APPLIED.md](FIXES-APPLIED.md)** - Corrections appliquées

---

## 🤝 Contribution

Ce projet utilise :
- **Frontend** : HTML5, CSS3, JavaScript vanilla
- **Backend** : Node.js, Express
- **Synchronisation** : Git, GitHub API
- **Déploiement** : Render.com

---

## 📝 Licence

Propriétaire - Usage interne

---

## 🆘 Support

Pour toute question ou problème :
1. Consultez la [documentation](SYNC-GUIDE.md)
2. Vérifiez les [corrections connues](FIXES-APPLIED.md)
3. Utilisez les [scripts de diagnostic](test-sync.sh)

---

**Dernière mise à jour** : 2025-11-24
**Version** : 2.0
**Créé avec** : Claude Code 🤖
