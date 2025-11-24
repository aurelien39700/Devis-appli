#!/bin/bash

# Script de synchronisation bidirectionnelle automatique
# VS Code ↔ GitHub ↔ Site Render
# Ce script synchronise automatiquement dans les deux sens

echo "🔄 Synchronisation bidirectionnelle activée"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📂 VS Code ⟷ GitHub ⟷ Site Render"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Configurer git
git config pull.rebase false 2>/dev/null
git config user.email "${GIT_USER_EMAIL:-user@vscode.local}" 2>/dev/null
git config user.name "${GIT_USER_NAME:-VS Code User}" 2>/dev/null

# Variables pour tracker les changements
LAST_LOCAL_HASH=""
LAST_REMOTE_COMMIT=""

while true; do
    TIMESTAMP=$(date '+%H:%M:%S')

    # ═══════════════════════════════════════════════════════
    # ÉTAPE 1 : Vérifier les changements LOCAUX (VS Code)
    # ═══════════════════════════════════════════════════════
    if [ -f "data.json" ]; then
        CURRENT_LOCAL_HASH=$(md5sum data.json 2>/dev/null | cut -d' ' -f1)

        # Détecter si le fichier a changé localement
        if [ "$CURRENT_LOCAL_HASH" != "$LAST_LOCAL_HASH" ] && [ -n "$LAST_LOCAL_HASH" ]; then
            # Vérifier que ce n'est pas juste un pull qu'on vient de faire
            if git diff --quiet data.json 2>/dev/null; then
                : # Pas de changement git, c'était probablement un pull
            else
                echo "[$TIMESTAMP] 📝 CHANGEMENT LOCAL détecté dans VS Code"
                echo "[$TIMESTAMP] ➜ Push vers GitHub..."

                git add data.json 2>/dev/null

                if git commit -m "Sync: Modif VS Code → GitHub ($(date '+%Y-%m-%d %H:%M:%S'))" --quiet 2>/dev/null; then
                    if git push origin main --quiet 2>&1; then
                        echo "[$TIMESTAMP] ✅ Données envoyées à GitHub"
                        echo "[$TIMESTAMP] 🌐 Le site Render récupérera dans ~10 sec"
                        echo ""
                    else
                        echo "[$TIMESTAMP] ⚠️  Erreur push - tentative de pull d'abord..."
                        git pull origin main --quiet 2>/dev/null && git push origin main --quiet 2>&1
                        echo ""
                    fi
                fi
            fi
        fi
        LAST_LOCAL_HASH="$CURRENT_LOCAL_HASH"
    fi

    # ═══════════════════════════════════════════════════════
    # ÉTAPE 2 : Vérifier les changements DISTANTS (GitHub)
    # ═══════════════════════════════════════════════════════
    git fetch origin main --quiet 2>/dev/null

    CURRENT_REMOTE_COMMIT=$(git rev-parse origin/main 2>/dev/null)

    if [ "$CURRENT_REMOTE_COMMIT" != "$LAST_REMOTE_COMMIT" ] && [ -n "$LAST_REMOTE_COMMIT" ]; then
        echo "[$TIMESTAMP] 🌐 CHANGEMENT DISTANT détecté sur GitHub"
        echo "[$TIMESTAMP] ➜ Pull depuis GitHub..."

        # Vérifier s'il y a des changements locaux non commités
        if ! git diff --quiet data.json 2>/dev/null; then
            echo "[$TIMESTAMP] 💾 Commit local d'abord..."
            git add data.json 2>/dev/null
            git commit -m "Sync: Auto-commit avant pull ($(date '+%Y-%m-%d %H:%M:%S'))" --quiet 2>/dev/null
        fi

        # Pull les changements
        PULL_OUTPUT=$(git pull origin main 2>&1)

        if echo "$PULL_OUTPUT" | grep -q "Already up to date"; then
            echo "[$TIMESTAMP] ℹ️  Déjà à jour"
        elif echo "$PULL_OUTPUT" | grep -q "Updating\|Fast-forward\|Merge made"; then
            echo "[$TIMESTAMP] ✅ Données synchronisées depuis le site"
            echo "[$TIMESTAMP] 📂 VS Code mis à jour"

            # Mettre à jour le hash local après le pull
            LAST_LOCAL_HASH=$(md5sum data.json 2>/dev/null | cut -d' ' -f1)
        elif echo "$PULL_OUTPUT" | grep -q "CONFLICT"; then
            echo "[$TIMESTAMP] ⚠️  CONFLIT détecté !"
            echo "[$TIMESTAMP] 📋 Résolution automatique : garder les changements distants"
            git checkout --theirs data.json 2>/dev/null
            git add data.json 2>/dev/null
            git commit -m "Sync: Résolution conflit - priorité distant" --quiet 2>/dev/null
            LAST_LOCAL_HASH=$(md5sum data.json 2>/dev/null | cut -d' ' -f1)
        fi
        echo ""
    fi
    LAST_REMOTE_COMMIT="$CURRENT_REMOTE_COMMIT"

    # Attendre 3 secondes avant la prochaine vérification
    sleep 3
done
