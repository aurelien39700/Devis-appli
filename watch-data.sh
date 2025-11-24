#!/bin/bash

# Script de surveillance des modifications de data.json
# Affiche le contenu à chaque fois qu'il change

echo "👁️  Surveillance de data.json en temps réel"
echo "📝 Le fichier sera affiché à chaque modification"
echo "⚠️  Appuyez sur Ctrl+C pour arrêter"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Afficher le contenu initial
echo "📄 Contenu initial:"
cat data.json
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Surveiller les modifications
inotifywait -m -e modify data.json 2>/dev/null | while read -r; do
    echo "[$(date '+%H:%M:%S')] 🔄 data.json a été modifié!"
    echo ""
    cat data.json
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
done
