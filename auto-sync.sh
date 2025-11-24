#!/bin/bash

# Script de synchronisation automatique avec GitHub
# Pull les modifications toutes les 10 secondes

echo "🔄 Démarrage de la synchronisation automatique..."
echo "📥 Pull automatique depuis GitHub toutes les 10 secondes"
echo "⚠️  Appuyez sur Ctrl+C pour arrêter"
echo ""

# Configurer git pour utiliser la stratégie de merge
git config pull.rebase false 2>/dev/null

while true; do
    # Afficher l'heure
    echo -n "[$(date '+%H:%M:%S')] "

    # Pull depuis GitHub (avec gestion des conflits)
    OUTPUT=$(git pull 2>&1)

    if echo "$OUTPUT" | grep -q "Already up to date"; then
        echo "✅ Synchronisé (pas de changements)"
    elif echo "$OUTPUT" | grep -q "Updating\|Fast-forward\|Merge made"; then
        echo "🔄 NOUVELLES DONNÉES REÇUES!"
    elif echo "$OUTPUT" | grep -q "fatal\|error"; then
        echo "❌ Erreur: $OUTPUT"
    else
        echo "✅ Synchronisé"
    fi

    # Attendre 10 secondes
    sleep 10
done
