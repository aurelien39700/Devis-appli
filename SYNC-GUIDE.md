# 🔄 Guide de Synchronisation Bidirectionnelle

## Vue d'ensemble

Ce système permet une **synchronisation instantanée** entre 3 environnements :

```
📂 VS Code  ⟷  🐙 GitHub  ⟷  🌐 Site Render
```

Tout changement dans l'un des environnements est automatiquement propagé aux autres.

---

## 🚀 Démarrage Rapide

### Dans VS Code (pour synchroniser automatiquement)

Ouvrez un terminal et lancez :

```bash
./auto-sync-bidirectional.sh
```

**Ce script va :**
- ✅ Détecter automatiquement vos modifications dans VS Code
- ✅ Les pousser instantanément vers GitHub
- ✅ Récupérer les changements depuis le site Render (via GitHub)
- ✅ Synchroniser toutes les 3 secondes

**Laissez-le tourner en arrière-plan !**

---

## 📋 Fonctionnement Détaillé

### 1️⃣ Édition depuis VS Code → Site

```
1. Vous modifiez data.json dans VS Code
2. Le script détecte le changement (3 secondes max)
3. Commit + Push automatique vers GitHub
4. Le serveur Render pull depuis GitHub (~10 secondes)
5. Le site affiche les nouvelles données
```

**Temps total : ~13 secondes**

### 2️⃣ Édition depuis le Site → VS Code

```
1. Vous modifiez des données sur https://somepre-suivi.onrender.com/
2. Le serveur écrit dans data.json et push vers GitHub (instantané)
3. Le script détecte le nouveau commit sur GitHub (3 secondes max)
4. Pull automatique dans VS Code
5. VS Code affiche les nouvelles données
```

**Temps total : ~3 secondes**

---

## 🛠️ Scripts Disponibles

### `auto-sync-hybrid.sh` (⭐ RECOMMANDÉ)
Synchronisation hybride intelligente - combine GitHub + API directe

**Avantages :**
- Détecte les changements via GitHub ET via l'API du serveur
- Fonctionne même si le serveur ne push pas vers GitHub
- Synchronisation la plus rapide et fiable

```bash
./auto-sync-hybrid.sh
```

### `auto-sync-bidirectional.sh`
Synchronisation bidirectionnelle via GitHub uniquement

```bash
./auto-sync-bidirectional.sh
```

### `auto-sync.sh`
Ancien script - pull uniquement depuis GitHub

```bash
./auto-sync.sh
```

### `check-server-sync.sh`
Diagnostic du serveur Render pour identifier les problèmes

```bash
./check-server-sync.sh
```

### `watch-data.sh`
Surveillance simple - affiche les changements sans synchroniser

```bash
./watch-data.sh
```

---

## 🔧 Configuration

### Variables d'environnement (optionnelles)

```bash
export GIT_USER_EMAIL="votre@email.com"
export GIT_USER_NAME="Votre Nom"
```

Ou modifiez directement dans le script ligne 11-12.

---

## ⚠️ Gestion des Conflits

Si vous éditez **simultanément** dans VS Code ET sur le site :

**Le script privilégie toujours les changements distants (GitHub/Site)**

```bash
[12:34:56] ⚠️  CONFLIT détecté !
[12:34:56] 📋 Résolution automatique : garder les changements distants
```

Pour éviter cela : **Ne modifiez qu'à un seul endroit à la fois**

---

## 📊 Vérification du Statut

### Voir l'état actuel de Git

```bash
git status
```

### Voir les derniers commits

```bash
git log --oneline -5
```

### Forcer une synchronisation manuelle

```bash
# Pull depuis GitHub
git pull origin main

# Push vers GitHub
git add data.json
git commit -m "Sync manuel"
git push origin main
```

---

## 🎯 Architecture Complète

```
┌─────────────────┐
│   VS Code       │
│   (Local)       │
│                 │
│  data.json      │◄──┐
└────────┬────────┘   │
         │            │
         │ Push       │ Pull
         │            │
         ▼            │
┌─────────────────────┴───┐
│      GitHub             │
│   (Repository)          │
│                         │
│  data.json (source)     │
└────────┬────────────────┘
         │
         │ Pull (10s)
         │ Push (instant)
         ▼
┌─────────────────────────┐
│   Serveur Render        │
│   (Production)          │
│                         │
│  server.js + data.json  │
└────────┬────────────────┘
         │
         │ API REST
         ▼
┌─────────────────────────┐
│   Site Web              │
│  (Frontend)             │
│                         │
│  index.html + app.js    │
└─────────────────────────┘
```

---

## ✅ Checklist de Vérification

- [ ] Le script `auto-sync-bidirectional.sh` tourne dans un terminal
- [ ] Vous avez configuré votre Git (user.email et user.name)
- [ ] Le site Render est en ligne : https://somepre-suivi.onrender.com/
- [ ] Vous pouvez faire un commit/push vers GitHub

---

## 🐛 Dépannage

### "Permission denied"
```bash
chmod +x auto-sync-bidirectional.sh
```

### "Failed to push"
Vérifiez vos credentials Git :
```bash
git config user.name
git config user.email
```

### "CONFLICT - résolution manuelle nécessaire"
Le script résout automatiquement, mais si ça persiste :
```bash
git reset --hard origin/main
```

### Le site ne se met pas à jour
Vérifiez que le serveur Render est bien démarré et surveille GitHub.

---

## 📞 Support

- Script créé avec Claude Code
- Pour des questions : ouvrir une issue sur GitHub
