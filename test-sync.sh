#!/bin/bash

# Script de test de la synchronisation
# Permet de vérifier que tout fonctionne correctement

echo "🧪 Test de synchronisation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Couleurs
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Fonction de test
test_item() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ $2${NC}"
    else
        echo -e "${RED}❌ $2${NC}"
        return 1
    fi
}

ERRORS=0

# Test 1 : Vérifier que data.json existe
echo "📋 Test 1 : Fichier data.json"
if [ -f "data.json" ]; then
    test_item 0 "data.json existe"
else
    test_item 1 "data.json n'existe pas"
    ((ERRORS++))
fi
echo ""

# Test 2 : Vérifier la configuration Git
echo "📋 Test 2 : Configuration Git"
GIT_USER=$(git config user.name)
GIT_EMAIL=$(git config user.email)

if [ -n "$GIT_USER" ]; then
    test_item 0 "Git user.name configuré : $GIT_USER"
else
    test_item 1 "Git user.name non configuré"
    ((ERRORS++))
fi

if [ -n "$GIT_EMAIL" ]; then
    test_item 0 "Git user.email configuré : $GIT_EMAIL"
else
    test_item 1 "Git user.email non configuré"
    ((ERRORS++))
fi
echo ""

# Test 3 : Vérifier la connexion à GitHub
echo "📋 Test 3 : Connexion GitHub"
if git ls-remote origin HEAD &>/dev/null; then
    test_item 0 "Connexion à GitHub opérationnelle"
else
    test_item 1 "Impossible de se connecter à GitHub"
    ((ERRORS++))
fi
echo ""

# Test 4 : Vérifier l'état Git
echo "📋 Test 4 : État du repository"
git fetch origin main --quiet 2>/dev/null

LOCAL=$(git rev-parse HEAD 2>/dev/null)
REMOTE=$(git rev-parse origin/main 2>/dev/null)

if [ "$LOCAL" = "$REMOTE" ]; then
    test_item 0 "Repository à jour avec GitHub"
else
    echo -e "${YELLOW}⚠️  Repository pas à jour avec GitHub${NC}"
    echo "   Local:  $LOCAL"
    echo "   Remote: $REMOTE"
    echo "   Conseil: Lancez ./auto-sync-bidirectional.sh"
fi
echo ""

# Test 5 : Vérifier les scripts de sync
echo "📋 Test 5 : Scripts de synchronisation"
if [ -x "auto-sync-bidirectional.sh" ]; then
    test_item 0 "auto-sync-bidirectional.sh est exécutable"
else
    test_item 1 "auto-sync-bidirectional.sh n'est pas exécutable"
    echo "   Correction: chmod +x auto-sync-bidirectional.sh"
    ((ERRORS++))
fi
echo ""

# Test 6 : Vérifier la validité du JSON
echo "📋 Test 6 : Validité du fichier JSON"
if command -v python3 &>/dev/null; then
    if python3 -m json.tool data.json > /dev/null 2>&1; then
        test_item 0 "data.json est un JSON valide"
    else
        test_item 1 "data.json contient des erreurs"
        ((ERRORS++))
    fi
else
    echo -e "${YELLOW}⚠️  Python3 non disponible, impossible de valider le JSON${NC}"
fi
echo ""

# Résumé
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✅ Tous les tests sont passés !${NC}"
    echo ""
    echo "🚀 Vous pouvez lancer la synchronisation :"
    echo "   ./auto-sync-bidirectional.sh"
else
    echo -e "${RED}❌ $ERRORS erreur(s) détectée(s)${NC}"
    echo ""
    echo "⚠️  Corrigez les erreurs avant de lancer la synchronisation"
fi
echo ""
