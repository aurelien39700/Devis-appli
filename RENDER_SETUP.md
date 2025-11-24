# Configuration Render pour synchronisation GitHub

## 🎯 Objectif
Permettre à Render de commit automatiquement les données sur GitHub, créant ainsi une synchronisation bidirectionnelle complète.

## 📋 Étapes de configuration

### 1. Créer un GitHub Personal Access Token

1. Va sur GitHub: https://github.com/settings/tokens
2. Clique sur **"Generate new token"** → **"Generate new token (classic)"**
3. Donne un nom: `Render Devis-Appli`
4. Sélectionne les permissions:
   - ✅ `repo` (Full control of private repositories)
   - ✅ `workflow` (Update GitHub Action workflows)
5. Clique sur **"Generate token"**
6. **COPIE LE TOKEN** (tu ne le reverras plus!)
   - Format: `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### 2. Configurer Render

1. Va sur https://dashboard.render.com
2. Sélectionne ton service **"somepre-suivi"**
3. Va dans **"Environment"** (menu gauche)
4. Ajoute ces variables d'environnement:

   **Variable 1:**
   - Key: `GITHUB_TOKEN`
   - Value: `ghp_xxxxxxxxxxxx` (ton token copié)

   **Variable 2:**
   - Key: `GITHUB_REPO`
   - Value: `aurelien39700/Devis-appli`

5. Clique sur **"Save Changes"**

### 3. Redéployer

1. Va dans **"Manual Deploy"**
2. Clique sur **"Deploy latest commit"**
3. Attends que le déploiement se termine (2-3 minutes)

## ✅ Vérification

Une fois déployé, vérifie les logs:
```
🔑 GitHub token configuré pour Render
✅ Données sauvegardées sur GitHub
```

## 🚀 Résultat

**Maintenant tu peux:**
- Saisir des données depuis ton portable sur `https://somepre-suivi.onrender.com`
- Les données sont automatiquement commit sur GitHub
- Tous les autres appareils récupèrent les données au démarrage
- Synchronisation complète et bidirectionnelle! 🎉

## 🔒 Sécurité

- Le token est stocké en variable d'environnement (sécurisé)
- Jamais exposé dans le code
- Accès uniquement à ton repo
- Tu peux révoquer le token à tout moment sur GitHub

## 🐛 Dépannage

**Si les commits ne fonctionnent pas:**
1. Vérifie que le token est bien configuré sur Render
2. Vérifie les logs Render pour voir les erreurs Git
3. Assure-toi que le token a les bonnes permissions
4. Vérifie que `GITHUB_REPO` est correct

**Si les données ne se synchronisent pas:**
- Vérifie que le serveur pull bien au démarrage (logs: `✅ Git pull réussi`)
- Force un redéploiement sur Render
