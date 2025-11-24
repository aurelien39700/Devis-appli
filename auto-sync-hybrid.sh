#!/bin/bash

# Script de synchronisation hybride intelligent
# Combine la sync via GitHub ET l'API directe du serveur
# Solution de secours si le serveur ne push pas vers GitHub

SITE_URL="${1:-https://somepre-suivi.onrender.com}"

echo "🔄 Synchronisation Hybride Activée"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📂 VS Code ⟷ GitHub ⟷ Serveur Render"
echo "🌐 API directe: $SITE_URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Configurer git
git config pull.rebase false 2>/dev/null

# Variables de tracking
LAST_LOCAL_HASH=""
LAST_REMOTE_COMMIT=""
LAST_SERVER_HASH=""

while true; do
    TIMESTAMP=$(date '+%H:%M:%S')

    # ═══════════════════════════════════════════════════════
    # ÉTAPE 1 : Vérifier changements LOCAUX (VS Code → GitHub)
    # ═══════════════════════════════════════════════════════
    if [ -f "data.json" ]; then
        CURRENT_LOCAL_HASH=$(md5sum data.json 2>/dev/null | cut -d' ' -f1)

        if [ "$CURRENT_LOCAL_HASH" != "$LAST_LOCAL_HASH" ] && [ -n "$LAST_LOCAL_HASH" ]; then
            if ! git diff --quiet data.json 2>/dev/null; then
                echo "[$TIMESTAMP] 📝 Changement local détecté"
                echo "[$TIMESTAMP] ➜ Push vers GitHub..."

                git add data.json 2>/dev/null

                if git commit -m "Sync: VS Code → GitHub ($(date '+%Y-%m-%d %H:%M:%S'))" --quiet 2>/dev/null; then
                    if git push origin main --quiet 2>&1; then
                        echo "[$TIMESTAMP] ✅ Envoyé à GitHub"
                        echo ""
                    fi
                fi
            fi
        fi
        LAST_LOCAL_HASH="$CURRENT_LOCAL_HASH"
    fi

    # ═══════════════════════════════════════════════════════
    # ÉTAPE 2 : Vérifier changements sur GITHUB
    # ═══════════════════════════════════════════════════════
    git fetch origin main --quiet 2>/dev/null
    CURRENT_REMOTE_COMMIT=$(git rev-parse origin/main 2>/dev/null)

    if [ "$CURRENT_REMOTE_COMMIT" != "$LAST_REMOTE_COMMIT" ] && [ -n "$LAST_REMOTE_COMMIT" ]; then
        echo "[$TIMESTAMP] 🌐 Changement sur GitHub détecté"
        echo "[$TIMESTAMP] ➜ Pull depuis GitHub..."

        if ! git diff --quiet data.json 2>/dev/null; then
            git add data.json 2>/dev/null
            git commit -m "Sync: Auto-commit avant pull" --quiet 2>/dev/null
        fi

        if git pull origin main --quiet 2>&1; then
            echo "[$TIMESTAMP] ✅ Synchronisé depuis GitHub"
            LAST_LOCAL_HASH=$(md5sum data.json 2>/dev/null | cut -d' ' -f1)
            echo ""
        fi
    fi
    LAST_REMOTE_COMMIT="$CURRENT_REMOTE_COMMIT"

    # ═══════════════════════════════════════════════════════
    # ÉTAPE 3 : Vérifier changements directs sur le SERVEUR
    # (Solution de secours si le serveur ne push pas vers GitHub)
    # ═══════════════════════════════════════════════════════
    SERVER_DATA=$(curl -s -f "$SITE_URL/api/entries" 2>/dev/null)

    if [ $? -eq 0 ] && [ -n "$SERVER_DATA" ]; then
        CURRENT_SERVER_HASH=$(echo "$SERVER_DATA" | md5sum | cut -d' ' -f1)

        if [ "$CURRENT_SERVER_HASH" != "$LAST_SERVER_HASH" ] && [ -n "$LAST_SERVER_HASH" ]; then
            echo "[$TIMESTAMP] 🌐 Changement DIRECT sur le serveur détecté"
            echo "[$TIMESTAMP] ➜ Récupération via API..."

            # Formater et sauvegarder
            echo "$SERVER_DATA" | python3 -m json.tool > data.json.temp 2>/dev/null

            if [ -s data.json.temp ]; then
                mv data.json.temp data.json
                echo "[$TIMESTAMP] ✅ Données récupérées du serveur"

                # Commit et push vers GitHub pour synchroniser
                git add data.json 2>/dev/null
                if git commit -m "Sync: Serveur → VS Code → GitHub ($(date '+%Y-%m-%d %H:%M:%S'))" --quiet 2>/dev/null; then
                    if git push origin main --quiet 2>&1; then
                        echo "[$TIMESTAMP] ✅ Changements envoyés à GitHub"
                    fi
                fi

                LAST_LOCAL_HASH=$(md5sum data.json 2>/dev/null | cut -d' ' -f1)
                echo ""
            fi
        fi
        LAST_SERVER_HASH="$CURRENT_SERVER_HASH"
    fi

    # Attendre 3 secondes
    sleep 3
done
