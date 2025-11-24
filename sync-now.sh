#!/bin/bash

# Script de synchronisation manuelle ONE-SHOT
# Récupère immédiatement les dernières données depuis le serveur

SITE_URL="${1:-https://somepre-suivi.onrender.com}"

echo "🔄 Synchronisation manuelle..."
echo ""

# Récupérer les données du serveur
echo "📥 Récupération depuis $SITE_URL..."
SERVER_DATA=$(curl -s -f "$SITE_URL/api/entries" 2>/dev/null)

if [ $? -ne 0 ] || [ -z "$SERVER_DATA" ]; then
    echo "❌ Impossible de contacter le serveur"
    exit 1
fi

# Sauvegarder l'ancien fichier
if [ -f "data.json" ]; then
    cp data.json data.json.backup
    echo "💾 Backup créé : data.json.backup"
fi

# Formater et écrire
echo "$SERVER_DATA" | python3 -m json.tool > data.json 2>/dev/null

if [ $? -eq 0 ]; then
    echo "✅ data.json mis à jour"
    echo ""

    # Afficher un résumé
    USERS_COUNT=$(cat data.json | python3 -c "import sys, json; print(len(json.load(sys.stdin)['users']))" 2>/dev/null)
    ENTRIES_COUNT=$(cat data.json | python3 -c "import sys, json; print(len(json.load(sys.stdin)['entries']))" 2>/dev/null)
    CLIENTS_COUNT=$(cat data.json | python3 -c "import sys, json; print(len(json.load(sys.stdin)['clients']))" 2>/dev/null)

    echo "📊 Résumé des données :"
    echo "   - Utilisateurs : $USERS_COUNT"
    echo "   - Entrées : $ENTRIES_COUNT"
    echo "   - Clients : $CLIENTS_COUNT"
    echo ""

    # Proposer de commit
    if git diff --quiet data.json 2>/dev/null; then
        echo "ℹ️  Aucun changement détecté"
    else
        echo "📝 Changements détectés. Voulez-vous commit et push ? [y/N]"
        read -t 5 -n 1 REPLY
        echo ""

        if [[ $REPLY =~ ^[Yy]$ ]]; then
            git add data.json
            git commit -m "Sync: Mise à jour manuelle depuis le serveur ($(date '+%Y-%m-%d %H:%M:%S'))"
            git push origin main
            echo "✅ Changements envoyés à GitHub"
        else
            echo "ℹ️  Changements non commitées. Utilisez 'git add data.json && git commit' pour les sauvegarder."
        fi
    fi
else
    echo "❌ Erreur lors du formatage JSON"
    if [ -f "data.json.backup" ]; then
        mv data.json.backup data.json
        echo "🔄 Restauration du backup"
    fi
    exit 1
fi

echo ""
echo "✨ Synchronisation terminée !"
