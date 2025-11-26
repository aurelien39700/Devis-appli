#!/bin/bash

# Script de synchronisation automatique VS Code → GitHub
# Surveille data.json et push automatiquement les changements

API_URL="https://somepre-suivi.onrender.com/api/entries"
DATA_FILE="data.json"
LAST_HASH=""

echo "🔄 Auto-Push GitHub Activé"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📥 Serveur Render → VS Code → GitHub"
echo "🌐 API: $API_URL"
echo "✅ Push automatique vers GitHub"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Fonction pour obtenir le hash du fichier data.json
get_file_hash() {
    if [ -f "$DATA_FILE" ]; then
        md5sum "$DATA_FILE" 2>/dev/null | cut -d' ' -f1
    else
        echo ""
    fi
}

# Fonction pour récupérer et sauvegarder
sync_and_push() {
    local timestamp=$(date +"%H:%M:%S")

    # 1. Récupérer les données du serveur
    curl -s "$API_URL" -o "$DATA_FILE.tmp"

    if [ $? -eq 0 ]; then
        # Vérifier que les données sont valides (JSON)
        if jq empty "$DATA_FILE.tmp" 2>/dev/null; then
            # Remplacer le fichier
            mv "$DATA_FILE.tmp" "$DATA_FILE"

            # 2. Vérifier s'il y a des changements
            if git diff --quiet "$DATA_FILE"; then
                echo "[$timestamp] ℹ️  Aucun changement"
            else
                echo "[$timestamp] 📥 Changement détecté"

                # 3. Commit et push vers GitHub
                git add "$DATA_FILE"
                git commit -m "Auto-save: Données mises à jour ($(date -Iseconds))" > /dev/null 2>&1

                if [ $? -eq 0 ]; then
                    # Push vers GitHub
                    git push origin main > /dev/null 2>&1

                    if [ $? -eq 0 ]; then
                        echo "[$timestamp] ✅ Sauvegardé sur GitHub"
                    else
                        echo "[$timestamp] ❌ Échec du push (retry...)"
                        # Retry avec pull rebase
                        git pull --rebase origin main > /dev/null 2>&1
                        git push origin main > /dev/null 2>&1
                        if [ $? -eq 0 ]; then
                            echo "[$timestamp] ✅ Sauvegardé après rebase"
                        else
                            echo "[$timestamp] ❌ Push échoué définitivement"
                        fi
                    fi
                else
                    echo "[$timestamp] ℹ️  Aucun changement à commiter"
                fi
            fi
        else
            echo "[$timestamp] ❌ Données invalides (JSON)"
            rm -f "$DATA_FILE.tmp"
        fi
    else
        echo "[$timestamp] ❌ Erreur de connexion au serveur"
    fi
}

# Initialisation
LAST_HASH=$(get_file_hash)

# Boucle infinie - Vérifier toutes les 5 secondes
while true; do
    sync_and_push
    sleep 5
done
