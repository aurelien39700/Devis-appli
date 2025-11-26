#!/bin/bash

# Script de synchronisation LECTURE SEULE
# Récupère les données depuis le serveur Render vers VS Code
# NE PUSH JAMAIS vers GitHub (évite les redéploiements)

SITE_URL="${1:-https://somepre-suivi.onrender.com}"

echo "🔄 Synchronisation Lecture Seule Activée"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📥 Serveur Render → VS Code (LECTURE SEULE)"
echo "🌐 API: $SITE_URL"
echo "⚠️  NE PUSH JAMAIS vers GitHub"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

LAST_SERVER_HASH=""

while true; do
    TIMESTAMP=$(date '+%H:%M:%S')

    # Récupérer les données complètes du serveur
    SERVER_RESPONSE=$(curl -s -f "$SITE_URL/api/entries" 2>/dev/null)

    if [ $? -eq 0 ] && [ -n "$SERVER_RESPONSE" ]; then
        # Calculer le hash pour détecter les changements
        CURRENT_SERVER_HASH=$(echo "$SERVER_RESPONSE" | md5sum | cut -d' ' -f1)

        if [ "$CURRENT_SERVER_HASH" != "$LAST_SERVER_HASH" ] && [ -n "$LAST_SERVER_HASH" ]; then
            echo "[$TIMESTAMP] 📥 Changement détecté sur le serveur"

            # Compter les entrées
            ENTRIES_COUNT=$(echo "$SERVER_RESPONSE" | python3 -c "import sys, json; d=json.load(sys.stdin); print(len(d.get('entries', [])))" 2>/dev/null || echo "?")

            echo "[$TIMESTAMP] ➜ Récupération des données ($ENTRIES_COUNT entrées)..."

            # Sauvegarder les données localement
            echo "$SERVER_RESPONSE" | python3 -m json.tool > data.json.temp 2>/dev/null

            if [ -s data.json.temp ]; then
                mv data.json.temp data.json
                echo "[$TIMESTAMP] ✅ Données mises à jour dans VS Code"
                echo "[$TIMESTAMP] ℹ️  Aucun push vers GitHub (mode lecture seule)"
                echo ""
            else
                rm -f data.json.temp
                echo "[$TIMESTAMP] ❌ Erreur lors du formatage des données"
            fi
        fi

        LAST_SERVER_HASH="$CURRENT_SERVER_HASH"
    else
        if [ -z "$LAST_SERVER_HASH" ]; then
            echo "[$TIMESTAMP] ⏳ En attente du serveur..."
        fi
    fi

    # Attendre 5 secondes avant la prochaine vérification
    sleep 5
done
