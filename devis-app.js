/* =============================================================
   DEVIS - SOMEPRE - logique metier
   Extrait VERBATIM du <script> de devis_app.html.
   Aucune ligne modifiee : seul le contenant change, pour que
   linterface puisse evoluer sans toucher aux calculs.
   ============================================================= */
        // Charger les postes depuis le serveur et synchroniser le localStorage
        async function chargerPostesDepuisServeur() {
            try {
                console.log('📥 Chargement des postes depuis le serveur...');
                const response = await fetch('/api/postes');
                const data = await response.json();
                const postes = data.postes || [];
                console.log('✅ Postes chargés depuis le serveur:', postes.length, 'postes');

                // Sauvegarder dans localStorage pour synchronisation
                localStorage.setItem('devis_postes_bibliothèque', JSON.stringify(postes));
                console.log('💾 Postes sauvegardés dans localStorage');

                return postes;
            } catch (error) {
                console.error('❌ Erreur chargement postes depuis serveur:', error);
                return [];
            }
        }

        // Charger les postes depuis la bibliothèque synchronisée avec l'application principale
        function chargerPostesBibliotheque() {
            const postesSync = localStorage.getItem('devis_postes_bibliothèque');
            if (postesSync) {
                try {
                    const postes = JSON.parse(postesSync);
                    // Filtrer uniquement les postes qui ne sont PAS des machines
                    const postesFiltres = postes
                        .filter(p => !p.isMachine)
                        .map(p => ({
                            nom: p.name,
                            taux: p.tauxHoraire || 75,
                            order: p.order !== undefined ? p.order : 999
                        }));

                    // Trier par ordre
                    postesFiltres.sort((a, b) => a.order - b.order);

                    return postesFiltres;
                } catch (error) {
                    console.error('Erreur chargement postes synchronisés:', error);
                }
            }

            // Postes par défaut si pas de synchronisation
            return [
                { nom: 'Étude', taux: 65 },
                { nom: 'Ébauche', taux: 75 },
                { nom: 'Carcasse', taux: 75 },
                { nom: 'Rectification', taux: 75 },
                { nom: 'Microperçage', taux: 55 },
                { nom: 'Électrode', taux: 80 },
                { nom: 'Ajustage', taux: 75 },
                { nom: 'Montage', taux: 55 },
                { nom: 'Soudure', taux: 80 }
            ];
        }

        // Charger les machines depuis la bibliothèque synchronisée
        function chargerMachinesBibliotheque() {
            const postesSync = localStorage.getItem('devis_postes_bibliothèque');
            if (postesSync) {
                try {
                    const postes = JSON.parse(postesSync);
                    // Filtrer uniquement les postes marqués comme machines
                    const machines = postes
                        .filter(p => p.isMachine)
                        .map(p => ({
                            nom: p.name,
                            taux: p.tauxHoraire || 46,
                            order: p.order !== undefined ? p.order : 999
                        }));

                    // Si des machines sont trouvées, les trier par ordre et retourner
                    if (machines.length > 0) {
                        machines.sort((a, b) => a.order - b.order);
                        return machines;
                    }
                } catch (error) {
                    console.error('Erreur chargement machines synchronisées:', error);
                }
            }

            // Machines par défaut si pas de synchronisation
            return [
                { nom: 'Fraisage CN', taux: 46 },
                { nom: 'Découpe Fil', taux: 46 },
                { nom: 'Érosion', taux: 46 }
            ];
        }

        // Données - charger depuis localStorage ou utiliser les postes/machines par défaut
        const postesTravail = chargerPostesBibliotheque();
        const machines = chargerMachinesBibliotheque();

        let achatsItems = [
            'Carcasse',
            'Éléments carcasse',
            'Matière première',
            'Traitement thermique',
            'Bloc chaud',
            'Sous-traitance',
            'Transport'
        ];

        // Bibliothèque de fournisseurs
        let fournisseurs = [
            'Fournisseur A',
            'Fournisseur B',
            'Fournisseur C',
            'Sous-traitant X',
            'Sous-traitant Y'
        ];

        // Charger les fournisseurs depuis le serveur
        async function chargerFournisseursDepuisServeur() {
            try {
                console.log('📥 Chargement des fournisseurs depuis le serveur...');
                const response = await fetch('/api/fournisseurs');
                if (!response.ok) {
                    console.log('⚠️ Endpoint fournisseurs non disponible, utilisation des fournisseurs par défaut');
                    return fournisseurs;
                }
                const data = await response.json();
                const fournisseursServeur = data.fournisseurs || [];
                console.log('✅ Fournisseurs chargés depuis le serveur:', fournisseursServeur.length, 'fournisseurs');
                return fournisseursServeur;
            } catch (error) {
                console.error('❌ Erreur chargement fournisseurs depuis serveur:', error);
                return fournisseurs;
            }
        }

        // Sauvegarder les fournisseurs vers le serveur
        async function sauvegarderFournisseursVersServeur() {
            try {
                console.log('💾 Sauvegarde des fournisseurs vers le serveur...');
                const response = await fetch('/api/fournisseurs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fournisseurs: fournisseurs })
                });
                if (!response.ok) {
                    throw new Error(`Erreur HTTP ${response.status}`);
                }
                console.log('✅ Fournisseurs sauvegardés sur le serveur');
            } catch (error) {
                console.error('❌ Erreur sauvegarde fournisseurs vers serveur:', error);
            }
        }

        // Charger les achats depuis le serveur
        async function chargerAchatsDepuisServeur() {
            try {
                console.log('📥 Chargement des achats depuis le serveur...');
                const response = await fetch('/api/achats');
                if (!response.ok) {
                    console.log('⚠️ Endpoint achats non disponible, utilisation des achats par défaut');
                    return achatsItems;
                }
                const data = await response.json();
                const achatsServeur = data.achats || [];
                console.log('✅ Achats chargés depuis le serveur:', achatsServeur.length, 'achats');
                return achatsServeur.length > 0 ? achatsServeur : achatsItems;
            } catch (error) {
                console.error('❌ Erreur chargement achats depuis serveur:', error);
                return achatsItems;
            }
        }

        // Sauvegarder les achats vers le serveur
        async function sauvegarderAchatsVersServeur() {
            try {
                console.log('💾 Sauvegarde des achats vers le serveur...');
                const response = await fetch('/api/achats', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ achats: achatsItems })
                });
                if (!response.ok) {
                    throw new Error(`Erreur HTTP ${response.status}`);
                }
                console.log('✅ Achats sauvegardés sur le serveur');
            } catch (error) {
                console.error('❌ Erreur sauvegarde achats vers serveur:', error);
            }
        }

        let data = {
            travail: postesTravail.map(p => ({ 
                ...p, 
                semaines: [0, 0, 0, 0, 0, 0, 0, 0] 
            })),
            machine: machines.map(m => ({ ...m, temps: 0 })),
            achats: achatsItems.map(a => ({
                nom: a,
                fournisseur: '',
                quantite: 1,
                prixUnit: 0
            }))
        };

        // Initialisation
        function init() {
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('date').value = today;
            
            renderTravail();
            renderMachine();
            renderAchats();
            calculer();
        }

        // Afficher les onglets
        function showTab(tab) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
            
            event.target.classList.add('active');
            document.getElementById('section-' + tab).classList.add('active');
        }

        // Render Travail
        function renderTravail() {
            const tbody = document.getElementById('bodyTravail');
            tbody.innerHTML = '';
            
            let totalHeures = 0;
            let totalMontant = 0;

            data.travail.forEach((poste, idx) => {
                const tr = document.createElement('tr');
                const totalH = poste.semaines.reduce((a, b) => a + b, 0);
                const montant = totalH * poste.taux;
                
                totalHeures += totalH;
                totalMontant += montant;

                tr.innerHTML = `
                    <td class="poste-name">${poste.nom}</td>
                    ${poste.semaines.map((s, i) => `
                        <td><input type="number" value="${s}" min="0" step="0.5"
                            onfocus="this.select()"
                            onchange="updateSemaine(${idx}, ${i}, this.value)"></td>
                    `).join('')}
                    <td style="text-align: center; font-weight: 600;">${totalH.toFixed(2)}</td>
                    <td class="taux-cell" style="text-align: center;">
                        <input type="number" value="${poste.taux}" min="0" step="1"
                            style="width: 70px; text-align: center;"
                            onfocus="this.select()"
                            onchange="updateTauxTravail(${idx}, this.value)">
                    </td>
                    <td class="montant-cell" style="text-align: right;">${montant.toFixed(2)} €</td>
                `;
                tbody.appendChild(tr);
            });

            // Total
            const trTotal = document.createElement('tr');
            trTotal.className = 'total-row';
            trTotal.innerHTML = `
                <td colspan="9" style="text-align: right;">TOTAL TRAVAIL</td>
                <td style="text-align: center;">${totalHeures.toFixed(2)}</td>
                <td></td>
                <td style="text-align: right;">${totalMontant.toFixed(2)} €</td>
            `;
            tbody.appendChild(trTotal);
        }

        function updateSemaine(posteIdx, semaineIdx, value) {
            data.travail[posteIdx].semaines[semaineIdx] = parseFloat(value) || 0;
            renderTravail();
            calculer();
            sauvegarderAuto();
        }

        async function updateTauxTravail(posteIdx, value) {
            const nouveauTaux = parseFloat(value) || 0;
            data.travail[posteIdx].taux = nouveauTaux;
            renderTravail();
            calculer();
            sauvegarderAuto();

            // Récupérer tous les postes depuis le serveur et mettre à jour
            try {
                const response = await fetch('/api/postes');
                const responseData = await response.json();
                const postes = responseData.postes || [];
                const poste = postes.find(p => p.name === data.travail[posteIdx].nom && !p.isMachine);

                if (poste && poste.id) {
                    console.log(`📝 Mise à jour taux de "${poste.name}": ${nouveauTaux}€/h`);
                    await fetch(`/api/postes/${poste.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            name: poste.name,
                            tauxHoraire: nouveauTaux,
                            isMachine: false
                        })
                    });
                    console.log(`✅ Taux mis à jour pour "${poste.name}"`);
                }
            } catch (error) {
                console.error('❌ Erreur mise à jour taux:', error);
            }
        }


        // Render Machine
        function renderMachine() {
            const tbody = document.getElementById('bodyMachine');
            tbody.innerHTML = '';
            
            let totalTemps = 0;
            let totalMontant = 0;

            data.machine.forEach((machine, idx) => {
                const tr = document.createElement('tr');
                const montant = machine.temps * machine.taux;
                
                totalTemps += machine.temps;
                totalMontant += montant;

                tr.innerHTML = `
                    <td class="poste-name">${machine.nom}</td>
                    <td><input type="number" value="${machine.temps}" min="0" step="0.5"
                        onfocus="this.select()"
                        onchange="updateMachine(${idx}, this.value)"></td>
                    <td class="taux-cell" style="text-align: center;">
                        <input type="number" value="${machine.taux}" min="0" step="1"
                            style="width: 70px; text-align: center;"
                            onfocus="this.select()"
                            onchange="updateTauxMachine(${idx}, this.value)">
                    </td>
                    <td class="montant-cell" style="text-align: right;">${montant.toFixed(2)} €</td>
                `;
                tbody.appendChild(tr);
            });

            // Total
            const trTotal = document.createElement('tr');
            trTotal.className = 'total-row';
            trTotal.innerHTML = `
                <td style="text-align: right;">TOTAL MACHINE</td>
                <td style="text-align: center;">${totalTemps.toFixed(2)}</td>
                <td></td>
                <td style="text-align: right;">${totalMontant.toFixed(2)} €</td>
            `;
            tbody.appendChild(trTotal);
        }

        function updateMachine(idx, value) {
            data.machine[idx].temps = parseFloat(value) || 0;
            renderMachine();
            calculer();
            sauvegarderAuto();
        }

        async function updateTauxMachine(idx, value) {
            const nouveauTaux = parseFloat(value) || 0;
            data.machine[idx].taux = nouveauTaux;
            renderMachine();
            calculer();
            sauvegarderAuto();

            // Récupérer tous les postes depuis le serveur et mettre à jour
            try {
                const response = await fetch('/api/postes');
                const responseData = await response.json();
                const postes = responseData.postes || [];
                const machine = postes.find(p => p.name === data.machine[idx].nom && p.isMachine);

                if (machine && machine.id) {
                    console.log(`📝 Mise à jour taux de "${machine.name}": ${nouveauTaux}€/h`);
                    await fetch(`/api/postes/${machine.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            name: machine.name,
                            tauxHoraire: nouveauTaux,
                            isMachine: true
                        })
                    });
                    console.log(`✅ Taux mis à jour pour "${machine.name}"`);
                }
            } catch (error) {
                console.error('❌ Erreur mise à jour taux machine:', error);
            }
        }

        // Render Achats
        function renderAchats() {
            const tbody = document.getElementById('bodyAchats');
            tbody.innerHTML = '';
            
            let totalMontant = 0;

            data.achats.forEach((achat, idx) => {
                const tr = document.createElement('tr');
                const montant = achat.quantite * achat.prixUnit;
                totalMontant += montant;

                // Créer les options pour le datalist
                const optionsFournisseurs = fournisseurs.map(f => `<option value="${f}">`).join('');

                tr.innerHTML = `
                    <td class="poste-name">${achat.nom}</td>
                    <td>
                        <input type="text" list="fournisseurs-${idx}" value="${achat.fournisseur}" 
                            onfocus="this.select()"
                            onchange="updateAchatFournisseur(${idx}, this.value)"
                            placeholder="Choisir ou saisir...">
                        <datalist id="fournisseurs-${idx}">
                            ${optionsFournisseurs}
                        </datalist>
                    </td>
                    <td><input type="number" value="${achat.quantite}" min="0"
                        onfocus="this.select()" 
                        onchange="updateAchatQuantite(${idx}, this.value)"></td>
                    <td><input type="number" value="${achat.prixUnit}" min="0" step="0.01"
                        onfocus="this.select()" 
                        onchange="updateAchatPrix(${idx}, this.value)"></td>
                    <td class="montant-cell" style="text-align: right;">${montant.toFixed(2)} €</td>
                `;
                tbody.appendChild(tr);
            });

            // Total
            const trTotal = document.createElement('tr');
            trTotal.className = 'total-row';
            trTotal.innerHTML = `
                <td colspan="4" style="text-align: right;">TOTAL ACHATS</td>
                <td style="text-align: right;">${totalMontant.toFixed(2)} €</td>
            `;
            tbody.appendChild(trTotal);
        }

        function updateAchatFournisseur(idx, value) {
            data.achats[idx].fournisseur = value;
            sauvegarderAuto();
        }

        function updateAchatQuantite(idx, value) {
            data.achats[idx].quantite = parseFloat(value) || 0;
            renderAchats();
            calculer();
            sauvegarderAuto();
        }

        function updateAchatPrix(idx, value) {
            data.achats[idx].prixUnit = parseFloat(value) || 0;
            renderAchats();
            calculer();
            sauvegarderAuto();
        }

        // Calculer
        function calculer() {
            // Total Travail
            const totalTravail = data.travail.reduce((sum, poste) => {
                const totalH = poste.semaines.reduce((a, b) => a + b, 0);
                return sum + (totalH * poste.taux);
            }, 0);

            // Total Machine
            const totalMachine = data.machine.reduce((sum, m) => {
                return sum + (m.temps * m.taux);
            }, 0);

            // Total Achats
            const totalAchats = data.achats.reduce((sum, a) => {
                return sum + (a.quantite * a.prixUnit);
            }, 0);

            // Coût total
            const coutTotal = totalTravail + totalMachine + totalAchats;

            // Prix de vente
            const coeffMarge = parseFloat(document.getElementById('coeffMarge').value) || 1.3;
            const prixVente = coutTotal * coeffMarge;

            // Marge
            const margeEuro = prixVente - coutTotal;
            const margePourcent = coutTotal > 0 ? (margeEuro / coutTotal) * 100 : 0;

            // Afficher
            document.getElementById('sumTravail').textContent = totalTravail.toFixed(2) + ' €';
            document.getElementById('sumMachine').textContent = totalMachine.toFixed(2) + ' €';
            document.getElementById('sumAchats').textContent = totalAchats.toFixed(2) + ' €';
            document.getElementById('coutTotal').textContent = coutTotal.toFixed(2) + ' €';
            document.getElementById('prixVente').textContent = prixVente.toFixed(2) + ' €';
            document.getElementById('margeEuro').textContent = margeEuro.toFixed(2) + ' €';
            document.getElementById('margePourcent').textContent = margePourcent.toFixed(1) + '%';

            // Préparer les données pour l'impression
            preparerImpression(totalTravail, totalMachine, totalAchats, coutTotal, prixVente, coeffMarge, margeEuro, margePourcent);
        }

        // Préparer les données pour l'impression PDF
        function preparerImpression(totalTravail, totalMachine, totalAchats, coutTotal, prixVente, coeffMarge, margeEuro, margePourcent) {
            // Travail
            const printTravail = document.getElementById('printTravail');
            printTravail.innerHTML = '';
            data.travail.forEach(poste => {
                const totalH = poste.semaines.reduce((a, b) => a + b, 0);
                if (totalH > 0) { // N'afficher que les lignes avec des heures
                    const montant = totalH * poste.taux;
                    printTravail.innerHTML += `
                        <tr>
                            <td>${poste.nom}</td>
                            <td style="text-align: center;">${totalH.toFixed(2)}</td>
                            <td style="text-align: center;">${poste.taux}</td>
                            <td style="text-align: right;">${montant.toFixed(2)} €</td>
                        </tr>
                    `;
                }
            });
            printTravail.innerHTML += `
                <tr style="background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); font-weight: 600; color: white;">
                    <td colspan="3" style="text-align: right; color: white;">TOTAL</td>
                    <td style="text-align: right; color: white;">${totalTravail.toFixed(2)} €</td>
                </tr>
            `;

            // Machine
            const printMachine = document.getElementById('printMachine');
            printMachine.innerHTML = '';
            data.machine.forEach(machine => {
                if (machine.temps > 0) {
                    const montant = machine.temps * machine.taux;
                    printMachine.innerHTML += `
                        <tr>
                            <td>${machine.nom}</td>
                            <td style="text-align: center;">${machine.temps.toFixed(2)}</td>
                            <td style="text-align: center;">${machine.taux}</td>
                            <td style="text-align: right;">${montant.toFixed(2)} €</td>
                        </tr>
                    `;
                }
            });
            printMachine.innerHTML += `
                <tr style="background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); font-weight: 600; color: white;">
                    <td colspan="3" style="text-align: right; color: white;">TOTAL</td>
                    <td style="text-align: right; color: white;">${totalMachine.toFixed(2)} €</td>
                </tr>
            `;

            // Achats
            const printAchats = document.getElementById('printAchats');
            printAchats.innerHTML = '';
            data.achats.forEach(achat => {
                const montant = achat.quantite * achat.prixUnit;
                if (montant > 0) {
                    printAchats.innerHTML += `
                        <tr>
                            <td>${achat.nom}</td>
                            <td>${achat.fournisseur}</td>
                            <td style="text-align: center;">${achat.quantite}</td>
                            <td style="text-align: right;">${montant.toFixed(2)} €</td>
                        </tr>
                    `;
                }
            });
            printAchats.innerHTML += `
                <tr style="background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); font-weight: 600; color: white;">
                    <td colspan="3" style="text-align: right; color: white;">TOTAL</td>
                    <td style="text-align: right; color: white;">${totalAchats.toFixed(2)} €</td>
                </tr>
            `;

            // Totaux finaux
            document.getElementById('printCoutTotal').textContent = coutTotal.toFixed(2) + ' €';
            document.getElementById('printCoeff').textContent = 'x ' + coeffMarge.toFixed(2);
            document.getElementById('printPrixVente').textContent = prixVente.toFixed(2) + ' €';
            document.getElementById('printMarge').textContent = margeEuro.toFixed(2) + ' € (' + margePourcent.toFixed(1) + '%)';
        }

        // Sauvegarde automatique
        function sauvegarderAuto() {
            const devisData = {
                client: document.getElementById('client').value,
                numCommande: document.getElementById('numCommande').value,
                affaire: document.getElementById('affaire').value,
                date: document.getElementById('date').value,
                coeffMarge: document.getElementById('coeffMarge').value,
                data: data
                // Note: fournisseurs et achats ne sont PAS sauvegardés ici
                // car ce sont des bibliothèques globales gérées par le serveur
            };

            localStorage.setItem('devis_somepre', JSON.stringify(devisData));
        }

        // Variables globales pour la bibliothèque
        let typeBibliotheque = '';
        let indexEdition = -1;

        // Nouveau devis
        function nouveauDevis() {
            if (confirm('⚠️ Voulez-vous vraiment créer un nouveau devis ?\n\nToutes les données du devis actuel seront effacées.\nLes postes, machines et achats de la bibliothèque seront conservés.')) {
                // Réinitialiser les champs du header
                document.getElementById('client').value = '';
                document.getElementById('numCommande').value = '';
                document.getElementById('affaire').value = '';
                document.getElementById('date').value = new Date().toISOString().split('T')[0];
                document.getElementById('coeffMarge').value = 1.20;
                
                // Réinitialiser les heures/quantités mais garder la structure
                data.travail.forEach(poste => {
                    poste.semaines = [0, 0, 0, 0, 0, 0, 0, 0];
                });
                data.machine.forEach(machine => {
                    machine.temps = 0;
                });
                data.achats.forEach(achat => {
                    achat.fournisseur = '';
                    achat.quantite = 1;
                    achat.prixUnit = 0;
                });
                
                renderTravail();
                renderMachine();
                renderAchats();
                calculer();
                sauvegarderAuto();
                
                alert('✅ Nouveau devis créé avec succès !');
            }
        }

        // Gestion de la bibliothèque
        function ouvrirBibliotheque(type) {
            typeBibliotheque = type;
            const modal = document.getElementById('modalBibliotheque');
            const title = document.getElementById('modalTitle');
            
            if (type === 'travail') {
                title.textContent = '⚙️ Bibliothèque des Postes de Travail';
            } else if (type === 'machine') {
                title.textContent = '🏭 Bibliothèque des Machines';
            } else if (type === 'achats') {
                title.textContent = '🛒 Bibliothèque des Achats';
            } else if (type === 'fournisseurs') {
                title.textContent = '📋 Bibliothèque des Fournisseurs';
            }
            
            afficherListeBibliotheque();
            modal.style.display = 'block';
        }

        function fermerBibliotheque() {
            document.getElementById('modalBibliotheque').style.display = 'none';
        }

        function afficherListeBibliotheque() {
            const liste = document.getElementById('listeBibliotheque');
            liste.innerHTML = '';

            let items = [];
            if (typeBibliotheque === 'travail') {
                items = data.travail;
            } else if (typeBibliotheque === 'machine') {
                items = data.machine;
            } else if (typeBibliotheque === 'achats') {
                items = data.achats;
            } else if (typeBibliotheque === 'fournisseurs') {
                items = fournisseurs.map(f => ({ nom: f }));
            }

            items.forEach((item, idx) => {
                const div = document.createElement('div');
                div.className = 'bibliotheque-item';

                let tauxText = '';
                if (typeBibliotheque === 'travail' || typeBibliotheque === 'machine') {
                    tauxText = `<div class="item-taux">Taux: ${item.taux} €/h</div>`;
                }

                div.innerHTML = `
                    <div class="item-info">
                        <div class="item-name">${item.nom}</div>
                        ${tauxText}
                    </div>
                    <div class="item-actions">
                        <button class="btn-icon btn-edit" onclick="editerItem(${idx})">
                            ✏️ Modifier
                        </button>
                        <button class="btn-icon btn-delete" onclick="supprimerItem(${idx})">
                            🗑️ Supprimer
                        </button>
                    </div>
                `;
                liste.appendChild(div);
            });
        }

        function ajouterItemBibliotheque() {
            indexEdition = -1;
            const modal = document.getElementById('modalEdition');
            const title = document.getElementById('modalEditionTitle');
            const labelTaux = document.getElementById('labelTaux');
            
            if (typeBibliotheque === 'travail') {
                title.textContent = 'Ajouter un Poste de Travail';
                labelTaux.textContent = 'Taux horaire (€/h)';
                labelTaux.style.display = 'block';
                document.getElementById('editTaux').style.display = 'block';
            } else if (typeBibliotheque === 'machine') {
                title.textContent = 'Ajouter une Machine';
                labelTaux.textContent = 'Taux horaire (€/h)';
                labelTaux.style.display = 'block';
                document.getElementById('editTaux').style.display = 'block';
            } else if (typeBibliotheque === 'achats') {
                title.textContent = 'Ajouter un Achat';
                labelTaux.style.display = 'none';
                document.getElementById('editTaux').style.display = 'none';
            } else if (typeBibliotheque === 'fournisseurs') {
                title.textContent = 'Ajouter un Fournisseur';
                labelTaux.style.display = 'none';
                document.getElementById('editTaux').style.display = 'none';
            }
            
            document.getElementById('editNom').value = '';
            document.getElementById('editTaux').value = typeBibliotheque === 'machine' ? 46 : 75;
            
            modal.style.display = 'block';
        }

        function editerItem(idx) {
            indexEdition = idx;
            const modal = document.getElementById('modalEdition');
            const title = document.getElementById('modalEditionTitle');
            const labelTaux = document.getElementById('labelTaux');
            
            let item;
            if (typeBibliotheque === 'travail') {
                item = data.travail[idx];
                title.textContent = 'Modifier le Poste de Travail';
                labelTaux.textContent = 'Taux horaire (€/h)';
                labelTaux.style.display = 'block';
                document.getElementById('editTaux').style.display = 'block';
                document.getElementById('editTaux').value = item.taux;
            } else if (typeBibliotheque === 'machine') {
                item = data.machine[idx];
                title.textContent = 'Modifier la Machine';
                labelTaux.textContent = 'Taux horaire (€/h)';
                labelTaux.style.display = 'block';
                document.getElementById('editTaux').style.display = 'block';
                document.getElementById('editTaux').value = item.taux;
            } else if (typeBibliotheque === 'achats') {
                item = data.achats[idx];
                title.textContent = 'Modifier l\'Achat';
                labelTaux.style.display = 'none';
                document.getElementById('editTaux').style.display = 'none';
            } else if (typeBibliotheque === 'fournisseurs') {
                item = { nom: fournisseurs[idx] };
                title.textContent = 'Modifier le Fournisseur';
                labelTaux.style.display = 'none';
                document.getElementById('editTaux').style.display = 'none';
            }
            
            document.getElementById('editNom').value = item.nom;
            modal.style.display = 'block';
        }

        function fermerEdition() {
            document.getElementById('modalEdition').style.display = 'none';
        }

        async function sauvegarderEdition() {
            const nom = document.getElementById('editNom').value.trim();
            if (!nom) {
                alert('⚠️ Le nom est obligatoire');
                return;
            }

            const taux = parseInt(document.getElementById('editTaux').value) || 0;

            if (indexEdition === -1) {
                // Ajout
                if (typeBibliotheque === 'travail') {
                    data.travail.push({
                        nom: nom,
                        taux: taux,
                        semaines: [0, 0, 0, 0, 0, 0, 0, 0]
                    });
                } else if (typeBibliotheque === 'machine') {
                    data.machine.push({
                        nom: nom,
                        taux: taux,
                        temps: 0
                    });
                } else if (typeBibliotheque === 'achats') {
                    achatsItems.push(nom);
                    await sauvegarderAchatsVersServeur();
                    data.achats.push({
                        nom: nom,
                        fournisseur: '',
                        quantite: 1,
                        prixUnit: 0
                    });
                } else if (typeBibliotheque === 'fournisseurs') {
                    fournisseurs.push(nom);
                    await sauvegarderFournisseursVersServeur();
                }
            } else {
                // Modification
                if (typeBibliotheque === 'travail') {
                    data.travail[indexEdition].nom = nom;
                    data.travail[indexEdition].taux = taux;

                    // Envoyer la modification au serveur
                    await envoyerTauxAuServeur(nom, taux, false);
                } else if (typeBibliotheque === 'machine') {
                    data.machine[indexEdition].nom = nom;
                    data.machine[indexEdition].taux = taux;

                    // Envoyer la modification au serveur
                    await envoyerTauxAuServeur(nom, taux, true);
                } else if (typeBibliotheque === 'achats') {
                    achatsItems[indexEdition] = nom;
                    await sauvegarderAchatsVersServeur();
                    data.achats[indexEdition].nom = nom;
                } else if (typeBibliotheque === 'fournisseurs') {
                    fournisseurs[indexEdition] = nom;
                    await sauvegarderFournisseursVersServeur();
                }
            }

            // Mettre à jour l'affichage
            if (typeBibliotheque === 'travail') {
                renderTravail();
            } else if (typeBibliotheque === 'machine') {
                renderMachine();
            } else if (typeBibliotheque === 'achats') {
                renderAchats();
            } else if (typeBibliotheque === 'fournisseurs') {
                renderAchats(); // Rafraîchir les achats pour mettre à jour les datalists
            }

            calculer();
            sauvegarderAuto();
            afficherListeBibliotheque();
            fermerEdition();
        }

        // Fonction utilitaire pour envoyer le taux au serveur
        async function envoyerTauxAuServeur(nomPoste, nouveauTaux, isMachine) {
            try {
                const response = await fetch('/api/postes');
                const responseData = await response.json();
                const postes = responseData.postes || [];
                const poste = postes.find(p => p.name === nomPoste && p.isMachine === isMachine);

                if (poste && poste.id) {
                    console.log(`📝 Mise à jour taux de "${poste.name}": ${nouveauTaux}€/h`);
                    await fetch(`/api/postes/${poste.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            name: poste.name,
                            tauxHoraire: nouveauTaux,
                            isMachine: isMachine
                        })
                    });
                    console.log(`✅ Taux mis à jour pour "${poste.name}"`);
                }
            } catch (error) {
                console.error('❌ Erreur mise à jour taux:', error);
            }
        }

        function supprimerItem(idx) {
            let item, message;
            if (typeBibliotheque === 'travail') {
                item = data.travail[idx];
                message = `Voulez-vous vraiment supprimer "${item.nom}" ?\n\n⚠️ Attention: cette action supprimera également toutes les données associées dans le devis actuel.`;
            } else if (typeBibliotheque === 'machine') {
                item = data.machine[idx];
                message = `Voulez-vous vraiment supprimer "${item.nom}" ?\n\n⚠️ Attention: cette action supprimera également toutes les données associées dans le devis actuel.`;
            } else if (typeBibliotheque === 'achats') {
                item = data.achats[idx];
                message = `Voulez-vous vraiment supprimer "${item.nom}" ?\n\n⚠️ Attention: cette action supprimera également toutes les données associées dans le devis actuel.`;
            } else if (typeBibliotheque === 'fournisseurs') {
                item = { nom: fournisseurs[idx] };
                message = `Voulez-vous vraiment supprimer "${item.nom}" de la liste des fournisseurs ?`;
            }

            if (confirm(message)) {
                if (typeBibliotheque === 'travail') {
                    data.travail.splice(idx, 1);
                    renderTravail();
                } else if (typeBibliotheque === 'machine') {
                    data.machine.splice(idx, 1);
                    renderMachine();
                } else if (typeBibliotheque === 'achats') {
                    achatsItems.splice(idx, 1);
                    sauvegarderAchatsVersServeur(); // Sauvegarder sur le serveur
                    data.achats.splice(idx, 1);
                    renderAchats();
                } else if (typeBibliotheque === 'fournisseurs') {
                    fournisseurs.splice(idx, 1);
                    sauvegarderFournisseursVersServeur(); // Sauvegarder sur le serveur
                    renderAchats(); // Rafraîchir les achats
                }

                calculer();
                sauvegarderAuto();
                afficherListeBibliotheque();
            }
        }

        // Fermer les modals en cliquant en dehors
        window.onclick = function(event) {
            const modalBib = document.getElementById('modalBibliotheque');
            const modalEdit = document.getElementById('modalEdition');
            if (event.target == modalBib) {
                fermerBibliotheque();
            }
            if (event.target == modalEdit) {
                fermerEdition();
            }
        }

        // Actions
        async function exporterPDF() {
            try {
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF();

                // Charger le logo
                let logoData = null;
                try {
                    const response = await fetch('Somepre_Logo_Print_Black.png');
                    const blob = await response.blob();
                    logoData = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.readAsDataURL(blob);
                    });
                } catch (error) {
                    console.log('Logo non chargé:', error);
                }

                // En-tête avec logo
                if (logoData) {
                    doc.addImage(logoData, 'PNG', 15, 10, 40, 15);
                }

                doc.setFontSize(20);
                doc.setTextColor(102, 126, 234);
                doc.text('DEVIS', 105, 20, { align: 'center' });

                // Informations devis
                doc.setFontSize(11);
                doc.setTextColor(0, 0, 0);
                const client = document.getElementById('client').value || 'Non renseigné';
                const numCommande = document.getElementById('numCommande').value || 'N/A';
                const affaire = document.getElementById('affaire').value || 'Non renseigné';
                const date = document.getElementById('date').value || new Date().toISOString().split('T')[0];

                doc.text(`Date: ${new Date(date).toLocaleDateString('fr-FR')}`, 15, 35);
                doc.text(`Client: ${client}`, 15, 42);
                doc.text(`N° Commande: ${numCommande}`, 15, 49);
                doc.text(`Affaire: ${affaire}`, 15, 56);

                // Ligne de séparation
                doc.setDrawColor(200, 200, 200);
                doc.line(15, 62, 195, 62);

                let yPos = 70;

                // MAIN D'ŒUVRE
                doc.setFontSize(14);
                doc.setTextColor(102, 126, 234);
                doc.text('MAIN D\'ŒUVRE', 15, yPos);
                yPos += 8;

                doc.setFontSize(10);
                doc.setTextColor(100, 100, 100);
                doc.text('Poste', 15, yPos);
                doc.text('Heures', 100, yPos, { align: 'center' });
                doc.text('Taux', 135, yPos, { align: 'center' });
                doc.text('Montant', 195, yPos, { align: 'right' });
                yPos += 5;

                doc.setTextColor(0, 0, 0);
                let totalTravail = 0;
                data.travail.forEach(poste => {
                    const totalH = poste.semaines.reduce((a, b) => a + b, 0);
                    if (totalH > 0) {
                        const montant = totalH * poste.taux;
                        totalTravail += montant;
                        doc.text(poste.nom, 15, yPos);
                        doc.text(totalH.toFixed(1) + ' h', 100, yPos, { align: 'center' });
                        doc.text(poste.taux + ' €/h', 135, yPos, { align: 'center' });
                        doc.text(montant.toFixed(2) + ' €', 195, yPos, { align: 'right' });
                        yPos += 6;
                    }
                });

                doc.setFontSize(11);
                doc.setTextColor(102, 126, 234);
                doc.text('Total Main d\'œuvre:', 150, yPos, { align: 'right' });
                doc.text(totalTravail.toFixed(2) + ' €', 195, yPos, { align: 'right' });
                yPos += 10;

                // MACHINES
                doc.setFontSize(14);
                doc.text('MACHINES', 15, yPos);
                yPos += 8;

                doc.setFontSize(10);
                doc.setTextColor(100, 100, 100);
                doc.text('Machine', 15, yPos);
                doc.text('Temps', 100, yPos, { align: 'center' });
                doc.text('Taux', 135, yPos, { align: 'center' });
                doc.text('Montant', 195, yPos, { align: 'right' });
                yPos += 5;

                doc.setTextColor(0, 0, 0);
                let totalMachine = 0;
                data.machine.forEach(machine => {
                    if (machine.temps > 0) {
                        const montant = machine.temps * machine.taux;
                        totalMachine += montant;
                        doc.text(machine.nom, 15, yPos);
                        doc.text(machine.temps.toFixed(1) + ' h', 100, yPos, { align: 'center' });
                        doc.text(machine.taux + ' €/h', 135, yPos, { align: 'center' });
                        doc.text(montant.toFixed(2) + ' €', 195, yPos, { align: 'right' });
                        yPos += 6;
                    }
                });

                doc.setFontSize(11);
                doc.setTextColor(102, 126, 234);
                doc.text('Total Machines:', 150, yPos, { align: 'right' });
                doc.text(totalMachine.toFixed(2) + ' €', 195, yPos, { align: 'right' });
                yPos += 10;

                // ACHATS
                if (yPos > 240) {
                    doc.addPage();
                    yPos = 20;
                }

                doc.setFontSize(14);
                doc.text('ACHATS / FOURNITURES', 15, yPos);
                yPos += 8;

                doc.setFontSize(10);
                doc.setTextColor(100, 100, 100);
                doc.text('Article', 15, yPos);
                doc.text('Fournisseur', 80, yPos);
                doc.text('Qté', 130, yPos, { align: 'center' });
                doc.text('P.U.', 155, yPos, { align: 'center' });
                doc.text('Montant', 195, yPos, { align: 'right' });
                yPos += 5;

                doc.setTextColor(0, 0, 0);
                let totalAchats = 0;
                data.achats.forEach(achat => {
                    const montant = achat.quantite * achat.prixUnit;
                    if (montant > 0) {
                        totalAchats += montant;
                        doc.text(achat.nom, 15, yPos);
                        doc.text(achat.fournisseur || '-', 80, yPos);
                        doc.text(achat.quantite.toString(), 130, yPos, { align: 'center' });
                        doc.text(achat.prixUnit.toFixed(2) + ' €', 155, yPos, { align: 'center' });
                        doc.text(montant.toFixed(2) + ' €', 195, yPos, { align: 'right' });
                        yPos += 6;
                    }
                });

                doc.setFontSize(11);
                doc.setTextColor(102, 126, 234);
                doc.text('Total Achats:', 150, yPos, { align: 'right' });
                doc.text(totalAchats.toFixed(2) + ' €', 195, yPos, { align: 'right' });
                yPos += 15;

                // RÉCAPITULATIF
                doc.setDrawColor(102, 126, 234);
                doc.setLineWidth(0.5);
                doc.line(15, yPos, 195, yPos);
                yPos += 8;

                const coutTotal = totalTravail + totalMachine + totalAchats;
                const coeffMarge = parseFloat(document.getElementById('coeffMarge').value) || 1.3;
                const prixVente = coutTotal * coeffMarge;
                const margeEuro = prixVente - coutTotal;
                const margePourcent = coutTotal > 0 ? (margeEuro / coutTotal) * 100 : 0;

                doc.setFontSize(12);
                doc.setTextColor(0, 0, 0);
                doc.text('Coût Total:', 140, yPos, { align: 'right' });
                doc.text(coutTotal.toFixed(2) + ' €', 195, yPos, { align: 'right' });
                yPos += 8;

                doc.text('Coefficient:', 140, yPos, { align: 'right' });
                doc.text(coeffMarge.toFixed(2), 195, yPos, { align: 'right' });
                yPos += 10;

                doc.setFontSize(14);
                doc.setTextColor(102, 126, 234);
                doc.text('Prix de Vente HT:', 140, yPos, { align: 'right' });
                doc.text(prixVente.toFixed(2) + ' €', 195, yPos, { align: 'right' });
                yPos += 8;

                doc.setFontSize(11);
                doc.setTextColor(76, 175, 80);
                doc.text(`Marge: ${margeEuro.toFixed(2)} € (${margePourcent.toFixed(1)}%)`, 195, yPos, { align: 'right' });

                // Pied de page
                doc.setFontSize(9);
                doc.setTextColor(150, 150, 150);
                doc.text('SOMEPRE - Document généré automatiquement', 105, 285, { align: 'center' });

                // Sauvegarder avec choix de l'emplacement
                const fileName = `Devis_${client.replace(/[^a-z0-9]/gi, '_')}_${date}.pdf`;
                doc.save(fileName);

            } catch (error) {
                console.error('Erreur génération PDF:', error);
                alert('❌ Erreur lors de la génération du PDF. Vérifiez la console pour plus de détails.');
            }
        }

        function sauvegarder() {
            sauvegarderAuto();
            alert('💾 Devis sauvegardé avec succès!');
        }

        function reinitialiser() {
            if (confirm('🔄 Voulez-vous vraiment réinitialiser tous les champs?')) {
                localStorage.removeItem('devis_somepre');
                location.reload();
            }
        }

        // Charger les données sauvegardées
        function chargerSauvegarde() {
            const saved = localStorage.getItem('devis_somepre');
            if (saved) {
                const devisData = JSON.parse(saved);
                document.getElementById('client').value = devisData.client || '';
                document.getElementById('numCommande').value = devisData.numCommande || '';
                document.getElementById('affaire').value = devisData.affaire || '';
                document.getElementById('date').value = devisData.date || '';
                document.getElementById('coeffMarge').value = devisData.coeffMarge || 1.20;
                if (devisData.data) {
                    data = devisData.data;
                }
                // Note: fournisseurs et achats ne sont PAS chargés depuis localStorage
                // car ils proviennent toujours du serveur (source de vérité)
            }
        }

        // Synchroniser les taux depuis le serveur vers les données chargées
        async function synchroniserTauxDepuisServeur() {
            try {
                console.log('🔄 Synchronisation des taux depuis le serveur...');
                const response = await fetch('/api/postes');
                const responseData = await response.json();
                const postesServeur = responseData.postes || [];

                // Mettre à jour les taux des postes de travail
                data.travail.forEach(poste => {
                    const posteServeur = postesServeur.find(p => p.name === poste.nom && !p.isMachine);
                    if (posteServeur) {
                        console.log(`✅ Mise à jour taux "${poste.nom}": ${poste.taux} → ${posteServeur.tauxHoraire}€/h`);
                        poste.taux = posteServeur.tauxHoraire;
                    }
                });

                // Mettre à jour les taux des machines
                data.machine.forEach(machine => {
                    const machineServeur = postesServeur.find(p => p.name === machine.nom && p.isMachine);
                    if (machineServeur) {
                        console.log(`✅ Mise à jour taux "${machine.nom}": ${machine.taux} → ${machineServeur.tauxHoraire}€/h`);
                        machine.taux = machineServeur.tauxHoraire;
                    }
                });

                console.log('✅ Synchronisation des taux terminée');
            } catch (error) {
                console.error('❌ Erreur synchronisation taux:', error);
            }
        }

        // Ajouter les événements de sauvegarde automatique aux champs
        function ajouterEvenementsSauvegarde() {
            document.getElementById('client').addEventListener('input', sauvegarderAuto);
            document.getElementById('numCommande').addEventListener('input', sauvegarderAuto);
            document.getElementById('affaire').addEventListener('input', sauvegarderAuto);
            document.getElementById('date').addEventListener('change', sauvegarderAuto);
            document.getElementById('coeffMarge').addEventListener('change', () => {
                calculer();
                sauvegarderAuto();
            });
        }

        // Lancement
        window.onload = async function() {
            console.log('🚀 Démarrage de l\'application devis_app...');

            // 1. Charger les postes et machines depuis data.json (source de vérité)
            const postesTravail = await chargerPostesBibliotheque();
            const machines = await chargerMachinesBibliotheque();

            console.log('📊 Postes chargés:', postesTravail.length);
            console.log('🏭 Machines chargées:', machines.length);

            // 2. Charger les fournisseurs et achats depuis le serveur
            fournisseurs = await chargerFournisseursDepuisServeur();
            console.log('📋 Fournisseurs chargés:', fournisseurs.length);

            achatsItems = await chargerAchatsDepuisServeur();
            console.log('🛒 Achats chargés:', achatsItems.length);

            // 3. Initialiser les données avec les postes/machines depuis data.json
            data.travail = postesTravail.map(p => ({
                ...p,
                semaines: [0, 0, 0, 0, 0, 0, 0, 0]
            }));

            data.machine = machines.map(m => ({
                ...m,
                temps: 0
            }));

            // 4. Charger la sauvegarde du devis (heures, quantités, infos client)
            chargerSauvegarde();

            // 5. Synchroniser les taux depuis data.json (écrase les anciens taux)
            await synchroniserTauxDepuisServeur();

            console.log('✅ Application initialisée avec les données de data.json');

            // 6. Initialiser l'interface
            init();
            ajouterEvenementsSauvegarde();
        };
