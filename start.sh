#!/bin/bash
# Script de démarrage avec sauvegarde automatique

echo "🚀 Démarrage du serveur Suivi d'Affaires..."

# Créer un backup de data.json avant de démarrer
if [ -f "data.json" ]; then
    BACKUP_DIR="backups"
    mkdir -p $BACKUP_DIR
    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    cp data.json "$BACKUP_DIR/data_$TIMESTAMP.json"
    echo "📦 Backup créé: $BACKUP_DIR/data_$TIMESTAMP.json"
fi

# Démarrer le serveur Node.js
node server.js
