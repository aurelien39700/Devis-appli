# 🔧 Guide de Réparation - Serveur Render

## Problème Détecté

Le serveur Render a un conflit de synchronisation avec GitHub :
- Il essaie de push des changements
- Mais GitHub a des commits plus récents
- Résultat : "échec de l'envoi de certaines références"

## 🚨 Solution Immédiate

### Option 1 : Via le Shell Render (Recommandé)

1. Connectez-vous à Render Dashboard : https://dashboard.render.com
2. Ouvrez votre service "somepre-suivi"
3. Cliquez sur "Shell" dans le menu
4. Exécutez ces commandes :

```bash
# Forcer la synchronisation avec GitHub (garde les changements distants)
git fetch origin main
git reset --hard origin/main

# Redémarrer le serveur
exit
```

5. Render redémarrera automatiquement avec les bonnes données

### Option 2 : Via Variables d'Environnement

Ajoutez cette variable dans Render Dashboard :

```
FORCE_SYNC_ON_START=true
```

Puis redéployez le service.

### Option 3 : Redéploiement Manuel

1. Dans Render Dashboard, allez dans votre service
2. Cliquez sur "Manual Deploy" → "Deploy latest commit"
3. Le serveur se synchronisera automatiquement avec GitHub

## 🔍 Vérifier que c'est Résolu

Après avoir appliqué une solution, testez :

```bash
./check-server-sync.sh
```

Vous devriez voir :
- ✅ `hasLocalChanges: false`
- ✅ `githubConnection: "OK"`

## 🛡️ Prévention Future

Le script `auto-sync-hybrid.sh` contourne ce problème en récupérant les données directement via l'API, même si le serveur ne peut pas push vers GitHub.

Lancez-le dans VS Code :
```bash
./auto-sync-hybrid.sh
```

## ⚙️ Amélioration Permanente (Optionnel)

Pour éviter ce problème à l'avenir, modifiez la stratégie du serveur :

Dans `server.js`, la fonction `autoPullFromGit()` devrait faire :
1. Pull d'abord
2. Ensuite commit si nécessaire
3. Puis push

C'est déjà implémenté dans votre code actuel (lignes 502-526).

## 📞 Support

Si le problème persiste :
1. Vérifiez que `GITHUB_TOKEN` est bien configuré dans Render
2. Vérifiez que le token a les permissions `repo` (lecture + écriture)
3. Consultez les logs Render pour voir les messages d'erreur détaillés
