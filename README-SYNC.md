# 🔄 Guide Rapide - Synchronisation

## 🎯 Objectif

Synchroniser automatiquement vos données entre :
- 📂 VS Code (votre environnement local)
- 🐙 GitHub (votre repository)
- 🌐 Site web (https://somepre-suivi.onrender.com/)

---

## ⚡ Démarrage Rapide

### Synchronisation Automatique (Recommandé)

Lancez ce script et laissez-le tourner en arrière-plan :

```bash
./auto-sync-hybrid.sh
```

**Ce qu'il fait :**
- ✅ Détecte vos modifications dans VS Code → Push vers GitHub
- ✅ Détecte les changements sur GitHub → Pull dans VS Code
- ✅ Détecte les changements sur le site → Récupère via API
- ✅ Synchronise tout automatiquement toutes les 3 secondes

### Synchronisation Manuelle (Ponctuelle)

Pour une synchronisation immédiate :

```bash
./sync-now.sh
```

**Affiche un résumé des données et propose de commit.**

---

## 🛠️ Tous les Scripts

| Script | Usage | Description |
|--------|-------|-------------|
| `auto-sync-hybrid.sh` | ⭐ Automatique | Sync intelligente (GitHub + API) |
| `sync-now.sh` | ⚡ Manuel | Sync immédiate depuis le serveur |
| `test-sync.sh` | 🧪 Diagnostic | Vérifie la configuration |
| `check-server-sync.sh` | 🔍 Debug | Diagnostic du serveur Render |
| `auto-sync-bidirectional.sh` | 📡 Automatique | Sync via GitHub uniquement |
| `watch-data.sh` | 👁️ Surveillance | Affiche les changements |

---

## 🔧 Problème Actuel Identifié

**Serveur Render ne push pas vers GitHub** ❌

**Symptômes :**
```
erreur : échec de l'envoi de certaines références
```

**Cause :** Conflit entre les commits locaux du serveur et GitHub

**Solution :** Le script `auto-sync-hybrid.sh` contourne ce problème en récupérant directement depuis l'API du serveur !

**Pour réparer Render définitivement :** Consultez [fix-render-sync.md](fix-render-sync.md)

---

## ✅ Vérification

### Test 1 : Configuration OK ?
```bash
./test-sync.sh
```

Doit afficher : ✅ Tous les tests sont passés !

### Test 2 : Serveur accessible ?
```bash
curl -s https://somepre-suivi.onrender.com/health | python3 -m json.tool
```

Doit retourner : `{"status": "ok", "timestamp": "..."}`

### Test 3 : Données actuelles ?
```bash
./sync-now.sh
```

Doit afficher le nombre d'utilisateurs, entrées, clients, etc.

---

## 📊 Architecture

```
┌─────────────────┐
│   🖥️ VS Code    │ ◄──┐
│   (Local)       │    │
└────────┬────────┘    │
         │             │
         ├─── Push ────┤
         │             │
         ▼             │
┌─────────────────────┴┐
│   🐙 GitHub          │
│   (Repository)       │
└────────┬─────────────┘
         │
         ├─── Pull (10s)
         │
         ▼
┌──────────────────────┐
│  🌐 Serveur Render   │◄── API directe (3s)
│  (Production)        │────────────────┐
└──────────────────────┘                │
                                        │
                         auto-sync-hybrid.sh
```

---

## 💡 Astuces

### Lancer la sync en arrière-plan dans VS Code

1. Ouvrez un nouveau terminal dans VS Code
2. Lancez `./auto-sync-hybrid.sh`
3. Laissez ce terminal ouvert
4. Travaillez normalement dans d'autres terminaux

### Voir les changements en temps réel

Dans un terminal séparé :
```bash
./watch-data.sh
```

### Forcer une resync complète

```bash
./sync-now.sh
```

---

## 🐛 Dépannage

### "Permission denied"
```bash
chmod +x *.sh
```

### "Cannot connect to server"
Vérifiez que https://somepre-suivi.onrender.com/ est accessible

### "Git conflict"
```bash
git reset --hard origin/main
./sync-now.sh
```

---

## 📚 Documentation Complète

Pour plus de détails, consultez :
- [SYNC-GUIDE.md](SYNC-GUIDE.md) - Documentation exhaustive
- [fix-render-sync.md](fix-render-sync.md) - Réparer les problèmes Render

---

**Créé avec Claude Code** 🤖
