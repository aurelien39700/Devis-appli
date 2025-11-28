// Synchroniser un taux directement avec le serveur
async function syncTauxVersServeur(nomPoste, nouveauTaux, isMachine) {
    try {
        console.log(`🔍 Recherche du poste "${nomPoste}" sur le serveur (isMachine: ${isMachine})...`);

        // Récupérer tous les postes depuis le serveur
        const response = await fetch('/api/postes');
        if (!response.ok) {
            throw new Error(`Erreur HTTP ${response.status}`);
        }
        const postes = await response.json();
        console.log('📦 Postes reçus du serveur:', postes.length, 'postes');

        // Trouver le poste correspondant
        const poste = postes.find(p => p.name === nomPoste && p.isMachine === isMachine);

        if (poste && poste.id) {
            console.log(`📝 Poste trouvé: "${poste.name}" (ID: ${poste.id}), ancien taux: ${poste.tauxHoraire}, nouveau: ${nouveauTaux}`);

            // Mettre à jour le taux sur le serveur
            const putResponse = await fetch(`/api/postes/${poste.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: poste.name,
                    tauxHoraire: nouveauTaux,
                    isMachine: poste.isMachine
                })
            });

            if (!putResponse.ok) {
                throw new Error(`Erreur HTTP PUT ${putResponse.status}`);
            }

            const result = await putResponse.json();
            console.log(`✅ Taux mis à jour pour "${nomPoste}":`, result);
            return result;
        } else {
            console.warn(`⚠️ Poste "${nomPoste}" non trouvé sur le serveur (isMachine: ${isMachine})`);
            console.warn('Postes disponibles:', postes.map(p => ({ name: p.name, isMachine: p.isMachine })));
            return null;
        }
    } catch (error) {
        console.error(`❌ Erreur sync taux pour "${nomPoste}":`, error);
        throw error;
    }
}
