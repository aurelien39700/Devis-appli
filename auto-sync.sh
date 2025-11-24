#!/bin/bash

# Script de synchronisation automatique avec GitHub
# Pull les modifications toutes les 10 secondes

echo "🔄 Démarrage de la synchronisation automatique..."
echo "📥 Pull automatique depuis GitHub toutes les 10 secondes"
echo "⚠️  Appuyez sur Ctrl+C pour arrêter"
echo ""

while true; do
    # Afficher l'heure
    echo -n "[$(date '+%H:%M:%S')] "

    # Vérifier s'il y a des modifications locales non commitées
    if [[ -n $(git status --porcelain) ]]; then
        echo "⚠️  Modifications locales détectées, commit ignoré (auto-sync)"
    fi

    # Pull depuis GitHub
    git pull --quiet 2>&1 | grep -v "Already up to date" || echo "✅ Données synchronisées"

    # Attendre 10 secondes
    sleep 10
done
