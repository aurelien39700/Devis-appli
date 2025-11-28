#!/bin/bash

# Script pour surveiller les modifications GitHub en temps réel
# Vérifie toutes les 10 secondes si des changements ont été pushés

echo "🔍 Surveillance des modifications GitHub activée..."
echo "Vérification toutes les 10 secondes"
echo ""

while true; do
    # Récupérer les changements depuis GitHub
    git fetch origin main:refs/remotes/origin/main 2>/dev/null

    # Comparer la branche locale avec origin/main
    LOCAL=$(git rev-parse HEAD)
    REMOTE=$(git rev-parse origin/main)

    if [ "$LOCAL" != "$REMOTE" ]; then
        echo "📥 Nouvelles modifications détectées sur GitHub!"
        echo "Récupération des changements..."

        # Pull les changements
        git pull origin main

        echo "✅ Modifications récupérées à $(date '+%H:%M:%S')"
        echo ""
    fi

    sleep 10
done
