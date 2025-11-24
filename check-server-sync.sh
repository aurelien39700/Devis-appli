#!/bin/bash

# Script pour diagnostiquer les problèmes de synchronisation avec le serveur Render
# Interroge l'API de diagnostic pour voir pourquoi le push ne fonctionne pas

SITE_URL="${1:-https://somepre-suivi.onrender.com}"

echo "🔍 Diagnostic du serveur Render"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "URL: $SITE_URL"
echo ""

# Test 1 : Vérifier que le serveur répond
echo "📡 Test 1 : Connexion au serveur..."
if curl -s -f "$SITE_URL/health" > /dev/null 2>&1; then
    echo "✅ Serveur accessible"
else
    echo "❌ Serveur inaccessible"
    exit 1
fi
echo ""

# Test 2 : Récupérer le diagnostic Git
echo "🔍 Test 2 : Diagnostic Git du serveur..."
RESPONSE=$(curl -s "$SITE_URL/api/git-status")

if [ -z "$RESPONSE" ]; then
    echo "❌ Impossible de récupérer le diagnostic"
    exit 1
fi

# Afficher le diagnostic formaté
echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
echo ""

# Analyser les problèmes potentiels
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Analyse des problèmes potentiels :"
echo ""

HAS_TOKEN=$(echo "$RESPONSE" | grep -o '"hasToken":[^,}]*' | cut -d':' -f2)
GITHUB_CONN=$(echo "$RESPONSE" | grep -o '"githubConnection":"[^"]*"' | cut -d'"' -f4)

if [ "$HAS_TOKEN" = "false" ] || [ "$HAS_TOKEN" = " false" ]; then
    echo "❌ PROBLÈME : Token GitHub non configuré sur Render"
    echo "   Solution : Ajoutez la variable GITHUB_TOKEN dans Render Dashboard"
    echo ""
fi

if echo "$GITHUB_CONN" | grep -q "ERREUR"; then
    echo "❌ PROBLÈME : Connexion à GitHub impossible"
    echo "   Détails : $GITHUB_CONN"
    echo "   Solution : Vérifiez que le token a les permissions 'repo'"
    echo ""
fi

# Vérifier les changements locaux
HAS_CHANGES=$(echo "$RESPONSE" | grep -o '"hasLocalChanges":[^,}]*' | cut -d':' -f2)
if [ "$HAS_CHANGES" = "true" ] || [ "$HAS_CHANGES" = " true" ]; then
    echo "⚠️  Le serveur a des changements locaux non pushés"
    echo "   Cela signifie que vos modifications sont sur le serveur mais pas sur GitHub"
    echo ""
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 Actions recommandées :"
echo "1. Consultez les logs Render : https://dashboard.render.com"
echo "2. Vérifiez la variable GITHUB_TOKEN"
echo "3. Vérifiez que le token a les permissions 'repo'"
echo ""
