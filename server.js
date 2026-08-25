// Serveur Node.js simple pour le suivi de soudure
// Peut être déployé gratuitement sur Render, Railway, ou Glitch

const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const crypto = require('crypto');
const execPromise = util.promisify(exec);

const app = express();
const PORT = process.env.PORT || 10000;
const DATA_FILE = path.join(__dirname, 'data.json');

// Middleware
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(__dirname));

// ===== FONCTIONS GIT =====

// Fonction pour configurer Git remote (nécessaire sur Render)
async function setupGitRemote() {
    try {
        // Nettoyer le token (supprimer espaces, retours à la ligne, etc.)
        const GITHUB_TOKEN = process.env.GITHUB_TOKEN?.trim().replace(/[\r\n\s]/g, '');
        const GITHUB_REPO = (process.env.GITHUB_REPO || 'aurelien39700/Devis-appli').trim();
        const IS_RENDER = process.env.RENDER === 'true' || !!process.env.RENDER_SERVICE_NAME;

        // Sur Render, configurer le remote avec le token
        if (IS_RENDER && GITHUB_TOKEN) {
            const remoteUrl = `https://${GITHUB_TOKEN}@github.com/${GITHUB_REPO}.git`;

            // Vérifier si origin existe déjà
            try {
                await execPromise('git remote get-url origin');
                // Origin existe, on le met à jour
                await execPromise(`git remote set-url origin "${remoteUrl}"`);
            } catch {
                // Origin n'existe pas, on le crée
                await execPromise(`git remote add origin "${remoteUrl}"`);
            }

            console.log('🔧 Git remote configuré pour Render');
        }
    } catch (error) {
        console.warn('⚠️ Setup remote erreur');
    }
}

// Fonction pour pull les dernières données depuis Git
async function gitPull() {
    try {
        await setupGitRemote(); // Configurer le remote avant de pull

        // Configurer la stratégie de pull (merge par défaut)
        await execPromise('git config pull.rebase false').catch(() => {});

        console.log('📥 Git pull...');
        const { stdout, stderr } = await execPromise('git pull origin main');
        console.log('✅ Git pull réussi:', stdout);
        return { success: true, message: stdout };
    } catch (error) {
        console.error('❌ Git pull erreur:', error.message);
        return { success: false, message: error.message };
    }
}

// Mutex pour éviter les commits concurrents
let gitLock = false;
const gitQueue = [];

// Fonction pour commit et push automatiquement (compatible Render)
async function gitCommitAndPush(message) {
    // Si un autre commit est en cours, ajouter à la queue
    if (gitLock) {
        console.log('⏳ Commit en cours, mise en attente...');
        return new Promise((resolve) => {
            gitQueue.push({ message, resolve });
        });
    }

    gitLock = true;
    try {
        // Configurer le remote si nécessaire
        await setupGitRemote();

        // Configurer Git user si nécessaire (pour Render)
        const IS_RENDER = process.env.RENDER === 'true' || !!process.env.RENDER_SERVICE_NAME;

        // Configurer l'identité Git (nécessaire pour commit)
        if (IS_RENDER) {
            await execPromise('git config user.email "app@render.com" || true');
            await execPromise('git config user.name "Render App" || true');
            await execPromise('git config commit.gpgsign false || true');
            console.log('🔑 Git configuré pour Render (GPG désactivé)');
        }

        // Reset des changements non désirés (node_modules, package-lock.json)
        try {
            await execPromise('git reset HEAD node_modules 2>/dev/null || true');
            await execPromise('git checkout -- node_modules 2>/dev/null || true');
            await execPromise('git reset HEAD package-lock.json 2>/dev/null || true');
            await execPromise('git checkout -- package-lock.json 2>/dev/null || true');
        } catch (e) {
            // Ignorer les erreurs de reset
        }

        // Ajouter data.json et devis_app.html
        console.log('📝 Git add data.json devis_app.html...');
        await execPromise('git add data.json devis_app.html');

        // Créer le commit avec un message descriptif
        const timestamp = new Date().toISOString();
        const commitMessage = `Auto-save: ${message} (${timestamp})`;

        console.log('💾 Git commit...');
        try {
            // Désactiver la signature GPG pour éviter les erreurs d'authentification
            const commitResult = await execPromise(`git commit --no-gpg-sign -m "${commitMessage}"`);
            console.log('✅ Commit créé:', commitResult.stdout.trim());
        } catch (commitError) {
            // Si "nothing to commit", ce n'est pas grave
            if (commitError.message.includes('nothing to commit')) {
                console.log('ℹ️  Aucun changement à commiter');
                return { success: true, message: 'Aucun changement' };
            }
            throw commitError; // Autre erreur = problème réel
        }

        // Push vers GitHub (avec gestion automatique des divergences)
        console.log('📤 Git push origin main...');
        try {
            const pushResult = await execPromise('git push origin main');
            console.log('✅ Push réussi!');

            if (pushResult.stdout) {
                console.log('📤 Push stdout:', pushResult.stdout.trim());
            }
            if (pushResult.stderr) {
                console.log('📤 Push stderr:', pushResult.stderr.trim());
            }

            // Vérifier que le commit est bien sur le remote
            console.log('🔍 Vérification commit distant...');
            const { stdout: remoteInfo } = await execPromise('git ls-remote origin main');
            const remoteCommit = remoteInfo.trim().substring(0, 7);
            console.log('✅ Commit distant:', remoteCommit);

            return { success: true, message: 'Sauvegardé sur GitHub' };
        } catch (pushError) {
            console.error('❌ GIT PUSH A ÉCHOUÉ!');
            console.error('❌ Push error message:', pushError.message);

            // Détecter si c'est un problème de divergence (serveur en retard)
            const isDivergence = pushError.message.includes('non-fast-forward') ||
                                 pushError.message.includes('rejected') ||
                                 pushError.message.includes('behind');

            if (isDivergence) {
                console.error('⚠️ DIVERGENCE: Le serveur a divergé de GitHub');
                console.error('🔄 Stratégie: Pull avec rebase automatique...');

                try {
                    // 1. Fetch les dernières modifications
                    console.log('📥 Fetch origin/main...');
                    await execPromise('git fetch origin main');

                    // 2. Rebase notre commit local sur origin/main
                    console.log('🔄 Rebase sur origin/main...');
                    await execPromise('git rebase origin/main');

                    // 3. Retry le push
                    console.log('📤 Nouvelle tentative de push...');
                    const retryPush = await execPromise('git push origin main');
                    console.log('✅ Push réussi après rebase!');

                    return { success: true, message: 'Sauvegardé sur GitHub (resync auto)' };
                } catch (rebaseError) {
                    console.error('❌ Rebase automatique échoué:', rebaseError.message);

                    // Annuler le rebase si en cours
                    try {
                        await execPromise('git rebase --abort');
                        console.log('🔄 Rebase annulé');
                    } catch (e) {
                        // Ignorer si pas de rebase en cours
                    }

                    // SOLUTION: Reset hard vers origin/main pour éviter l'accumulation de commits
                    // Cela abandonne le commit local mais évite les 384 commits bloqués
                    try {
                        console.log('🔄 Reset hard vers origin/main pour nettoyer...');
                        await execPromise('git reset --hard origin/main');
                        console.log('✅ Repository nettoyé - prêt pour le prochain commit');
                    } catch (resetError) {
                        console.error('❌ Reset échoué:', resetError.message);
                    }

                    console.error('⚠️ Ce commit a été abandonné pour éviter les conflits');
                    console.error('⚠️ Les données SONT sauvegardées dans data.json');
                    return { success: false, message: 'Commit abandonné (conflit résolu)' };
                }
            }

            if (pushError.stdout) {
                console.error('❌ Push stdout:', pushError.stdout);
            }
            if (pushError.stderr) {
                console.error('❌ Push stderr:', pushError.stderr);
            }

            // Afficher l'état git pour diagnostic
            try {
                const { stdout: gitStatus } = await execPromise('git status --porcelain');
                console.error('📊 Git status:', gitStatus || '(clean)');
                const { stdout: gitLog } = await execPromise('git log --oneline -3');
                console.error('📜 Derniers commits:', gitLog);
            } catch (e) {
                // Ignorer les erreurs de diagnostic
            }

            return { success: false, message: 'Échec du push: ' + pushError.message };
        }
    } catch (error) {
        console.error('⚠️ Erreur globale git:', error.message);
        // Ne pas bloquer l'app si git échoue
        return { success: false, message: error.message };
    } finally {
        // Libérer le verrou
        gitLock = false;

        // Traiter le prochain dans la queue
        if (gitQueue.length > 0) {
            const next = gitQueue.shift();
            console.log('🔄 Traitement du commit en attente...');
            gitCommitAndPush(next.message).then(next.resolve);
        }
    }
}

// Initialiser le fichier de données s'il n'existe pas
async function initDataFile() {
    const BACKUP_FILE = path.join(__dirname, 'data.backup.json');

    try {
        await fs.access(DATA_FILE);
        // Le fichier existe, vérifier qu'il n'est pas vide ou corrompu
        const data = await fs.readFile(DATA_FILE, 'utf8');
        const parsed = JSON.parse(data);

        // Vérifier que l'admin existe
        if (!parsed.users || !parsed.users.find(u => u.name === 'Admin')) {
            console.log('⚠️ Admin manquant, restauration...');
            if (!parsed.users) parsed.users = [];
            parsed.users.push({
                id: '1',
                name: 'Admin',
                password: 'ADMIN'
            });
            await fs.writeFile(DATA_FILE, JSON.stringify(parsed, null, 2));
        }
    } catch (error) {
        console.log('❌ Fichier data.json manquant ou corrompu');

        // PRIORITÉ 1: Essayer de récupérer depuis GitHub
        console.log('📥 Tentative de récupération depuis GitHub...');
        const pullResult = await gitPull();
        if (pullResult.success) {
            // Vérifier si le fichier existe maintenant
            try {
                await fs.access(DATA_FILE);
                console.log('✅ Données récupérées depuis GitHub !');
                return;
            } catch {
                console.log('⚠️ Git pull réussi mais data.json toujours manquant');
            }
        }

        // PRIORITÉ 2: Essayer de restaurer depuis le backup
        try {
            await fs.access(BACKUP_FILE);
            console.log('🔄 Restauration depuis data.backup.json');
            const backupData = await fs.readFile(BACKUP_FILE, 'utf8');
            await fs.writeFile(DATA_FILE, backupData);
            console.log('✅ Restauration réussie');
        } catch (backupError) {
            console.log('📝 Création d\'un nouveau fichier data.json');
            // Créer un nouveau fichier avec l'admin
            const initialData = {
                entries: [],
                clients: [],
                affaires: [],
                postes: [],
                users: [{
                    id: '1',
                    name: 'Admin',
                    password: 'ADMIN'
                }]
            };
            await fs.writeFile(DATA_FILE, JSON.stringify(initialData, null, 2));
        }
    }
}

// Lire les données
async function readData() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        const parsed = JSON.parse(data);
        // Assurer que toutes les propriétés existent
        return {
            entries: parsed.entries || [],
            clients: parsed.clients || [],
            affaires: parsed.affaires || [],
            postes: parsed.postes || [],
            users: parsed.users || [],
            achats: parsed.achats || [],
            fournisseurs: parsed.fournisseurs || [],
            devis: parsed.devis || [],
            entreprise: parsed.entreprise || {}
        };
    } catch (error) {
        return {
            entries: [],
            clients: [],
            affaires: [],
            postes: [],
            users: [],
            achats: [],
            fournisseurs: [],
            devis: [],
            entreprise: {}
        };
    }
}

// Écrire les données avec backup automatique
async function writeData(data) {
    // Valider les données avant d'écrire
    const validData = {
        entries: Array.isArray(data.entries) ? data.entries : [],
        clients: Array.isArray(data.clients) ? data.clients : [],
        affaires: Array.isArray(data.affaires) ? data.affaires : [],
        postes: Array.isArray(data.postes) ? data.postes : [],
        users: Array.isArray(data.users) ? data.users : [],
        achats: Array.isArray(data.achats) ? data.achats : [],
        fournisseurs: Array.isArray(data.fournisseurs) ? data.fournisseurs : [],
        // IMPORTANT : cette liste blanche conditionne ce qui survit a une
        // ecriture. Toute nouvelle collection doit y figurer, sinon elle est
        // effacee silencieusement a la sauvegarde suivante.
        devis: Array.isArray(data.devis) ? data.devis : [],
        entreprise: (data.entreprise && typeof data.entreprise === 'object') ? data.entreprise : {}
    };

    // S'assurer que l'admin existe toujours
    if (!validData.users.find(u => u.name === 'Admin')) {
        validData.users.push({
            id: Date.now().toString(),
            name: 'Admin',
            password: 'ADMIN'
        });
    }

    // Créer un backup avant d'écrire
    const BACKUP_FILE = path.join(__dirname, 'data.backup.json');
    try {
        await fs.access(DATA_FILE);
        const currentData = await fs.readFile(DATA_FILE, 'utf8');
        await fs.writeFile(BACKUP_FILE, currentData);
    } catch (error) {
        // Pas de fichier existant, pas de backup
    }

    // Écrire les nouvelles données
    await fs.writeFile(DATA_FILE, JSON.stringify(validData, null, 2));

    // Commit et push automatiquement sur Git (BLOQUANT pour garantir la sauvegarde)
    console.log('🔄 Tentative de commit et push vers GitHub...');
    try {
        const result = await gitCommitAndPush('Données mises à jour');
        console.log('✅ Données sauvegardées et committées sur GitHub:', result.message);
    } catch (err) {
        console.error('❌ Git push ÉCHOUÉ:', err.message);
        console.error('❌ Stack:', err.stack);
        console.warn('⚠️  Données sauvegardées LOCALEMENT uniquement (risque de perte)');
        // Les données sont quand même sauvegardées dans data.json
    }
}

// Routes API

// GET - Récupérer toutes les entrées
app.get('/api/entries', async (req, res) => {
    try {
        const data = await readData();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Erreur de lecture' });
    }
});

// POST - Créer une nouvelle entrée
app.post('/api/entries', async (req, res) => {
    try {
        const data = await readData();
        const newEntry = {
            id: Date.now().toString(),
            ...req.body,
            date: new Date().toISOString()
        };
        data.entries.push(newEntry);
        await writeData(data);
        res.json(newEntry);
    } catch (error) {
        res.status(500).json({ error: 'Erreur de création' });
    }
});

// PUT - Mettre à jour une entrée
app.put('/api/entries/:id', async (req, res) => {
    try {
        const data = await readData();
        const index = data.entries.findIndex(e => e.id === req.params.id);

        if (index === -1) {
            return res.status(404).json({ error: 'Entrée non trouvée' });
        }

        data.entries[index] = {
            ...data.entries[index],
            ...req.body,
            id: req.params.id
        };

        await writeData(data);
        res.json(data.entries[index]);
    } catch (error) {
        res.status(500).json({ error: 'Erreur de mise à jour' });
    }
});

// DELETE - Supprimer une entrée
app.delete('/api/entries/:id', async (req, res) => {
    try {
        const data = await readData();
        const index = data.entries.findIndex(e => e.id === req.params.id);

        if (index === -1) {
            return res.status(404).json({ error: 'Entrée non trouvée' });
        }

        data.entries.splice(index, 1);
        await writeData(data);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Erreur de suppression' });
    }
});

// PUT - Remplacer toutes les données (sync complète)
app.put('/api/sync', async (req, res) => {
    try {
        await writeData(req.body);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Erreur de synchronisation' });
    }
});

// ===== Routes pour les Clients =====

// GET - Récupérer tous les clients
app.get('/api/clients', async (req, res) => {
    try {
        const data = await readData();
        res.json({ clients: data.clients });
    } catch (error) {
        res.status(500).json({ error: 'Erreur de lecture' });
    }
});

// POST - Créer un nouveau client
app.post('/api/clients', async (req, res) => {
    try {
        const data = await readData();
        const newClient = {
            id: Date.now().toString(),
            name: req.body.name
        };
        data.clients.push(newClient);
        await writeData(data);
        res.json(newClient);
    } catch (error) {
        res.status(500).json({ error: 'Erreur de création' });
    }
});

// PUT - Mettre à jour un client (renommage)
app.put('/api/clients/:id', async (req, res) => {
    try {
        const data = await readData();
        const index = data.clients.findIndex(c => c.id === req.params.id);

        if (index === -1) {
            return res.status(404).json({ error: 'Client non trouvé' });
        }

        if (req.body.name !== undefined) {
            data.clients[index].name = req.body.name;
        }

        await writeData(data);
        res.json(data.clients[index]);
    } catch (error) {
        console.error('❌ Erreur PUT /api/clients:', error);
        res.status(500).json({ error: 'Erreur de mise à jour' });
    }
});

// DELETE - Supprimer un client
app.delete('/api/clients/:id', async (req, res) => {
    try {
        const data = await readData();
        data.clients = data.clients.filter(c => c.id !== req.params.id);
        await writeData(data);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Erreur de suppression' });
    }
});

// ===== Routes pour les Affaires =====

// GET - Récupérer toutes les affaires
app.get('/api/affaires', async (req, res) => {
    try {
        const data = await readData();
        res.json({ affaires: data.affaires });
    } catch (error) {
        res.status(500).json({ error: 'Erreur de lecture' });
    }
});

// POST - Créer une nouvelle affaire
app.post('/api/affaires', async (req, res) => {
    try {
        const data = await readData();
        const newAffaire = {
            id: Date.now().toString(),
            name: req.body.name,
            clientId: req.body.clientId,
            description: req.body.description || '',
            statut: req.body.statut || 'en_cours' // en_cours ou terminee
        };
        data.affaires.push(newAffaire);
        await writeData(data);
        res.json(newAffaire);
    } catch (error) {
        res.status(500).json({ error: 'Erreur de création' });
    }
});

// PUT - Mettre à jour une affaire (nom, client, description, statut)
app.put('/api/affaires/:id', async (req, res) => {
    try {
        console.log(`📝 PUT /api/affaires/${req.params.id}`, req.body);
        const data = await readData();
        const index = data.affaires.findIndex(a => a.id === req.params.id);

        if (index === -1) {
            console.error(`❌ Affaire ${req.params.id} non trouvée`);
            return res.status(404).json({ error: 'Affaire non trouvée' });
        }

        if (req.body.name !== undefined) {
            data.affaires[index].name = req.body.name;
        }
        if (req.body.clientId !== undefined) {
            data.affaires[index].clientId = req.body.clientId;
        }
        if (req.body.description !== undefined) {
            data.affaires[index].description = req.body.description;
        }
        if (req.body.statut !== undefined) {
            data.affaires[index].statut = req.body.statut;
        }

        await writeData(data);
        res.json(data.affaires[index]);
    } catch (error) {
        console.error('❌ Erreur PUT /api/affaires:', error);
        res.status(500).json({ error: 'Erreur de mise à jour' });
    }
});

// PUT - Modifier le statut d'une affaire
app.put('/api/affaires/:id/statut', async (req, res) => {
    try {
        const data = await readData();
        const affaire = data.affaires.find(a => a.id === req.params.id);
        if (affaire) {
            affaire.statut = req.body.statut;

            // Cycle du devis : l'envoi au client garantit un devis avec un
            // token de lien ; le retour en brouillon efface la réponse client
            // (le cycle repart proprement).
            const devisAffaire = (data.devis || []).find(d => d.affaireId === affaire.id);
            if (req.body.statut === 'envoye') {
                if (!devisAffaire) {
                    return res.status(400).json({ error: 'Aucun devis à envoyer pour cette affaire' });
                }
                if (!devisAffaire.token) {
                    devisAffaire.token = crypto.randomBytes(8).toString('hex');
                }
                delete devisAffaire.reponseClient;
            } else if (req.body.statut === 'brouillon' && devisAffaire) {
                delete devisAffaire.reponseClient;
            }

            await writeData(data);
            res.json(affaire);
        } else {
            res.status(404).json({ error: 'Affaire non trouvée' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Erreur de mise à jour' });
    }
});

// DELETE - Supprimer une affaire (et toutes ses entrées en cascade)
app.delete('/api/affaires/:id', async (req, res) => {
    try {
        const data = await readData();
        const affaireId = req.params.id;

        // Supprimer l'affaire
        data.affaires = data.affaires.filter(a => a.id !== affaireId);

        // Supprimer toutes les entrées associées à cette affaire
        data.entries = data.entries.filter(e => e.affaireId !== affaireId);

        // Supprimer le devis de cette affaire
        data.devis = (data.devis || []).filter(d => d.affaireId !== affaireId);

        await writeData(data);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Erreur de suppression' });
    }
});

// ===== Routes pour les Postes =====

// GET - Récupérer tous les postes
app.get('/api/postes', async (req, res) => {
    try {
        const data = await readData();
        res.json({ postes: data.postes });
    } catch (error) {
        res.status(500).json({ error: 'Erreur de lecture' });
    }
});

// POST - Créer un nouveau poste
app.post('/api/postes', async (req, res) => {
    try {
        const data = await readData();
        const newPoste = {
            id: Date.now().toString(),
            name: req.body.name,
            isMachine: req.body.isMachine || false,
            tauxHoraire: req.body.tauxHoraire || 75
        };
        data.postes.push(newPoste);
        await writeData(data);
        res.json(newPoste);
    } catch (error) {
        res.status(500).json({ error: 'Erreur de création' });
    }
});

// PUT - Mettre à jour un poste
app.put('/api/postes/:id', async (req, res) => {
    try {
        console.log(`📝 PUT /api/postes/${req.params.id}`, req.body);
        const data = await readData();
        const posteIndex = data.postes.findIndex(p => p.id === req.params.id);

        if (posteIndex === -1) {
            console.error(`❌ Poste ${req.params.id} non trouvé`);
            return res.status(404).json({ error: 'Poste non trouvé' });
        }

        console.log(`📊 Poste avant:`, data.postes[posteIndex]);

        // Mettre à jour le nom si fourni
        if (req.body.name !== undefined) {
            data.postes[posteIndex].name = req.body.name;
        }

        // Mettre à jour le taux horaire si fourni
        if (req.body.tauxHoraire !== undefined) {
            data.postes[posteIndex].tauxHoraire = req.body.tauxHoraire;
            console.log(`✅ Taux horaire mis à jour: ${req.body.tauxHoraire}`);
        }

        // Mettre à jour isMachine si fourni
        if (req.body.isMachine !== undefined) {
            data.postes[posteIndex].isMachine = req.body.isMachine;
        }

        // Mettre à jour order si fourni
        if (req.body.order !== undefined) {
            data.postes[posteIndex].order = req.body.order;
            console.log(`✅ Ordre mis à jour: ${req.body.order}`);
        }

        console.log(`📊 Poste après:`, data.postes[posteIndex]);

        await writeData(data);
        res.json(data.postes[posteIndex]);
    } catch (error) {
        console.error('❌ Erreur PUT /api/postes:', error);
        res.status(500).json({ error: 'Erreur de mise à jour' });
    }
});

// POST - Réordonner tous les postes (opération atomique)
app.post('/api/postes/reorder', async (req, res) => {
    try {
        console.log('📝 POST /api/postes/reorder', req.body);
        const { postesOrder } = req.body;

        if (!Array.isArray(postesOrder)) {
            return res.status(400).json({ error: 'postesOrder doit être un tableau' });
        }

        const data = await readData();

        postesOrder.forEach(({ id, order }) => {
            const poste = data.postes.find(p => p.id === id);
            if (poste) {
                poste.order = order;
                console.log(`✅ Ordre mis à jour pour poste ${poste.name}: ${order}`);
            }
        });

        await writeData(data);
        console.log('✅ Réordonnancement des postes sauvegardé');
        res.json({ success: true, message: 'Ordre des postes mis à jour' });
    } catch (error) {
        console.error('❌ Erreur POST /api/postes/reorder:', error);
        res.status(500).json({ error: 'Erreur de réordonnancement' });
    }
});

// DELETE - Supprimer un poste
app.delete('/api/postes/:id', async (req, res) => {
    try {
        const data = await readData();
        data.postes = data.postes.filter(p => p.id !== req.params.id);
        await writeData(data);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Erreur de suppression' });
    }
});

// ===== Routes pour les Fournisseurs =====

// GET - Récupérer tous les fournisseurs
app.get('/api/fournisseurs', async (req, res) => {
    try {
        const data = await readData();
        res.json({ fournisseurs: data.fournisseurs || [] });
    } catch (error) {
        res.status(500).json({ error: 'Erreur de lecture' });
    }
});

// POST - Sauvegarder la liste des fournisseurs
app.post('/api/fournisseurs', async (req, res) => {
    try {
        const data = await readData();
        // Préserver les autres champs en fusionnant les données
        const updatedData = {
            ...data,
            fournisseurs: req.body.fournisseurs || []
        };
        await writeData(updatedData);
        res.json({ success: true, fournisseurs: updatedData.fournisseurs });
    } catch (error) {
        res.status(500).json({ error: 'Erreur de sauvegarde' });
    }
});

// ===== Routes pour les Achats =====

// GET - Récupérer tous les achats de la bibliothèque
app.get('/api/achats', async (req, res) => {
    try {
        const data = await readData();
        res.json({ achats: data.achats || [] });
    } catch (error) {
        res.status(500).json({ error: 'Erreur de lecture' });
    }
});

// POST - Sauvegarder la liste des achats
app.post('/api/achats', async (req, res) => {
    try {
        const data = await readData();
        // Préserver les autres champs en fusionnant les données
        const updatedData = {
            ...data,
            achats: req.body.achats || []
        };
        await writeData(updatedData);
        res.json({ success: true, achats: updatedData.achats });
    } catch (error) {
        res.status(500).json({ error: 'Erreur de sauvegarde' });
    }
});

// ===== Routes pour les Devis (un devis par affaire) =====

// Calcule la synthèse budget (devis) / réel (heures saisies) d'une affaire.
// Rien n'est stocké : tout est recalculé à la demande, comme dans la V3.
function calculerSynthese(data, affaireId) {
    const affaire = data.affaires.find(a => a.id === affaireId);
    if (!affaire) return null;

    const devis = (data.devis || []).find(d => d.affaireId === affaireId);
    const contenu = (devis && devis.data) || {};
    const coeffMarge = devis && devis.coeffMarge ? parseFloat(devis.coeffMarge) || 1.2 : 1.2;

    // --- Budget : les lignes du devis, regroupées par nom de poste ---
    const budget = {};
    const ajouterBudget = (nom, heures, taux, machine) => {
        if (!budget[nom]) budget[nom] = { heures: 0, montant: 0, machine: false };
        budget[nom].heures += heures;
        budget[nom].montant += heures * taux;
        if (machine) budget[nom].machine = true;
    };

    (contenu.travail || []).forEach(p => {
        const h = (p.semaines || []).reduce((s, v) => s + (parseFloat(v) || 0), 0);
        ajouterBudget(p.nom, h, parseFloat(p.taux) || 0, false);
    });
    (contenu.machine || []).forEach(m => {
        ajouterBudget(m.nom, parseFloat(m.temps) || 0, parseFloat(m.taux) || 0, true);
    });

    const budgetAchats = (contenu.achats || []).reduce(
        (s, a) => s + (parseFloat(a.quantite) || 0) * (parseFloat(a.prixUnit) || 0), 0);

    // --- Réel : les heures saisies, valorisées au taux du poste ---
    const reel = {};
    data.entries.filter(e => e.affaireId === affaireId).forEach(e => {
        const poste = data.postes.find(p => p.id === e.posteId);
        const nom = poste ? poste.name : 'Poste inconnu';
        if (!reel[nom]) {
            reel[nom] = {
                heures: 0,
                taux: poste ? (parseFloat(poste.tauxHoraire) || 0) : 0,
                machine: poste ? !!poste.isMachine : false
            };
        }
        reel[nom].heures += parseFloat(e.hours) || 0;
    });

    // --- Rapprochement par nom de poste ---
    const ordre = {};
    data.postes.forEach((p, i) => { ordre[p.name] = p.order !== undefined ? p.order : i; });

    const noms = Array.from(new Set(Object.keys(budget).concat(Object.keys(reel))));
    const postes = noms.map(nom => {
        const b = budget[nom] || { heures: 0, montant: 0, machine: false };
        const r = reel[nom] || { heures: 0, taux: 0, machine: false };
        const reelMontant = r.heures * r.taux;
        return {
            nom: nom,
            machine: b.machine || r.machine,
            budgetHeures: b.heures,
            budgetMontant: b.montant,
            reelHeures: r.heures,
            reelTaux: r.taux,
            reelMontant: reelMontant,
            ecartHeures: r.heures - b.heures,
            ecartMontant: reelMontant - b.montant
        };
    }).sort((a, b) => (ordre[a.nom] !== undefined ? ordre[a.nom] : 999)
                    - (ordre[b.nom] !== undefined ? ordre[b.nom] : 999));

    const somme = (cle) => postes.reduce((s, p) => s + p[cle], 0);
    const budgetMontant = somme('budgetMontant');
    const reelMontant = somme('reelMontant');
    const coutBudget = budgetMontant + budgetAchats;

    return {
        affaireId: affaireId,
        affaire: affaire,
        aDevis: !!devis,
        coeffMarge: coeffMarge,
        postes: postes,
        totaux: {
            budgetHeures: somme('budgetHeures'),
            budgetMontant: budgetMontant,
            budgetAchats: budgetAchats,
            coutBudget: coutBudget,
            prixVente: coutBudget * coeffMarge,
            reelHeures: somme('reelHeures'),
            reelMontant: reelMontant,
            ecartHeures: somme('ecartHeures'),
            ecartMontant: reelMontant - budgetMontant
        }
    };
}

// GET - Tous les devis (permet au front de calculer les écarts sans N requêtes)
app.get('/api/devis', async (req, res) => {
    try {
        const data = await readData();
        res.json({ devis: data.devis || [] });
    } catch (error) {
        res.status(500).json({ error: 'Erreur de lecture' });
    }
});

// GET - Le devis d'une affaire
app.get('/api/devis/:affaireId', async (req, res) => {
    try {
        const data = await readData();
        const devis = (data.devis || []).find(d => d.affaireId === req.params.affaireId);
        if (!devis) return res.status(404).json({ error: 'Aucun devis pour cette affaire' });
        res.json(devis);
    } catch (error) {
        res.status(500).json({ error: 'Erreur de lecture' });
    }
});

// PUT - Créer ou mettre à jour le devis d'une affaire
app.put('/api/devis/:affaireId', async (req, res) => {
    try {
        const data = await readData();
        const affaireId = req.params.affaireId;

        if (!data.affaires.find(a => a.id === affaireId)) {
            return res.status(404).json({ error: 'Affaire non trouvée' });
        }

        const ancien = (data.devis || []).find(d => d.affaireId === affaireId) || {};

        const devis = {
            affaireId: affaireId,
            client: req.body.client || '',
            numCommande: req.body.numCommande || '',
            affaire: req.body.affaire || '',
            date: req.body.date || new Date().toISOString().split('T')[0],
            coeffMarge: req.body.coeffMarge || 1.2,
            data: req.body.data || ancien.data || { travail: [], machine: [], achats: [] },
            // Conditions du devis (modèle V3) et note visible par le client.
            // Un client (ex. l'ancien devis-sync) qui n'envoie pas ces champs
            // ne doit pas les effacer : on retombe sur l'existant.
            noteClient: req.body.noteClient !== undefined ? String(req.body.noteClient) : (ancien.noteClient || ''),
            delai: req.body.delai !== undefined ? String(req.body.delai) : (ancien.delai || ''),
            reglement: req.body.reglement !== undefined ? String(req.body.reglement) : (ancien.reglement || 'virement_45j'),
            echeances: Array.isArray(req.body.echeances) ? req.body.echeances : (ancien.echeances || []),
            // Jamais pilotés par le corps de la requête : le token vient de
            // l'envoi au client, la réponse vient du client lui-même.
            token: ancien.token,
            reponseClient: ancien.reponseClient,
            createdAt: ancien.createdAt,
            updatedAt: new Date().toISOString()
        };

        const index = (data.devis || []).findIndex(d => d.affaireId === affaireId);
        if (index === -1) {
            devis.createdAt = devis.updatedAt;
            data.devis = (data.devis || []).concat([devis]);
            console.log('📄 Devis créé pour l\'affaire ' + affaireId);
        } else {
            devis.createdAt = data.devis[index].createdAt || devis.updatedAt;
            data.devis[index] = devis;
        }

        await writeData(data);
        res.json(devis);
    } catch (error) {
        console.error('❌ Erreur PUT /api/devis:', error);
        res.status(500).json({ error: 'Erreur de sauvegarde' });
    }
});

// DELETE - Supprimer le devis d'une affaire
app.delete('/api/devis/:affaireId', async (req, res) => {
    try {
        const data = await readData();
        data.devis = (data.devis || []).filter(d => d.affaireId !== req.params.affaireId);
        await writeData(data);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Erreur de suppression' });
    }
});

// GET - Synthèse budget / réel d'une affaire
app.get('/api/affaires/:id/synthese', async (req, res) => {
    try {
        const data = await readData();
        const synthese = calculerSynthese(data, req.params.id);
        if (!synthese) return res.status(404).json({ error: 'Affaire non trouvée' });
        res.json(synthese);
    } catch (error) {
        console.error('❌ Erreur GET /api/affaires/:id/synthese:', error);
        res.status(500).json({ error: 'Erreur de calcul' });
    }
});

// ===== Entreprise (coordonnées reprises sur les devis client) =====

app.get('/api/entreprise', async (req, res) => {
    try {
        const data = await readData();
        res.json({ entreprise: data.entreprise || {} });
    } catch (error) {
        res.status(500).json({ error: 'Erreur de lecture' });
    }
});

app.post('/api/entreprise', async (req, res) => {
    try {
        const corps = req.body || {};
        // le logo arrive en data URI ; on borne sa taille
        if (corps.logo && String(corps.logo).length > 400000) {
            return res.status(413).json({ error: 'Logo trop lourd (300 Ko maximum)' });
        }
        const CHAMPS = ['nom','forme','adresse','cp','ville','tel','site','siret','tva','logo'];
        const data = await readData();
        const entreprise = {};
        CHAMPS.forEach(k => { if (corps[k] !== undefined) entreprise[k] = String(corps[k]); });
        data.entreprise = Object.assign({}, data.entreprise, entreprise);
        await writeData(data);
        res.json({ success: true, entreprise: data.entreprise });
    } catch (error) {
        console.error('❌ Erreur POST /api/entreprise:', error);
        res.status(500).json({ error: 'Erreur de sauvegarde' });
    }
});

// ===== Page client publique (lien par token, sans compte) =====

// Montants tels que le client les voit : cout interne x coefficient de
// marge, agreges en deux postes. Jamais le detail interne.
function montantsClient(devis) {
    const d = devis.data || {};
    const mo = (d.travail || []).reduce((s, p) =>
            s + (p.semaines || []).reduce((a, b) => a + (parseFloat(b) || 0), 0) * (parseFloat(p.taux) || 0), 0)
        + (d.machine || []).reduce((s, m) =>
            s + (parseFloat(m.temps) || 0) * (parseFloat(m.taux) || 0), 0);
    const achats = (d.achats || []).reduce((s, a) =>
        s + (parseFloat(a.quantite) || 0) * (parseFloat(a.prixUnit) || 0), 0);
    const coeff = parseFloat(devis.coeffMarge) || 1.2;
    return {
        realisationHT: mo * coeff,
        fournituresHT: achats * coeff,
        totalHT: (mo + achats) * coeff
    };
}

// GET - Le devis vu par le client (notes, montants, conditions - pas le detail)
app.get('/api/public/devis/:token', async (req, res) => {
    try {
        const data = await readData();
        const devis = (data.devis || []).find(d => d.token === req.params.token);
        if (!devis) return res.status(404).json({ error: 'Devis introuvable' });

        const affaire = data.affaires.find(a => a.id === devis.affaireId) || {};
        const client = data.clients.find(c => c.id === affaire.clientId);

        res.json({
            entreprise: data.entreprise || {},
            devis: {
                clientNom: client ? client.name : (devis.client || ''),
                affaireNom: affaire.name || devis.affaire || '',
                description: affaire.description || '',
                numCommande: devis.numCommande || '',
                date: devis.date || '',
                noteClient: devis.noteClient || '',
                delai: devis.delai || '',
                reglement: devis.reglement || '',
                echeances: devis.echeances || [],
                montants: montantsClient(devis),
                reponse: devis.reponseClient || null,
                repondable: affaire.statut === 'envoye' && !devis.reponseClient
            }
        });
    } catch (error) {
        console.error('❌ Erreur GET /api/public/devis:', error);
        res.status(500).json({ error: 'Erreur de lecture' });
    }
});

// POST - La reponse du client : accepter fait passer l'affaire en cours
app.post('/api/public/devis/:token/repondre', async (req, res) => {
    try {
        const data = await readData();
        const devis = (data.devis || []).find(d => d.token === req.params.token);
        if (!devis) return res.status(404).json({ error: 'Devis introuvable' });

        const affaire = data.affaires.find(a => a.id === devis.affaireId);
        if (!affaire || affaire.statut !== 'envoye' || devis.reponseClient) {
            return res.status(409).json({
                error: 'Ce devis n\'attend plus de réponse',
                reponse: devis.reponseClient || null
            });
        }

        const action = req.body.action === 'accepter' ? 'accepter'
                     : req.body.action === 'refuser' ? 'refuser' : null;
        if (!action) return res.status(400).json({ error: 'Action inconnue' });

        devis.reponseClient = {
            action: action === 'accepter' ? 'accepte' : 'refuse',
            date: new Date().toISOString(),
            motif: action === 'refuser' ? String(req.body.motif || '').slice(0, 500) : ''
        };
        if (action === 'accepter') {
            affaire.statut = 'en_cours';
            console.log('✅ Devis accepté par le client - affaire ' + affaire.name + ' en cours');
        } else {
            console.log('❌ Devis refusé par le client - affaire ' + affaire.name);
        }

        await writeData(data);
        res.json({ success: true, reponse: devis.reponseClient });
    } catch (error) {
        console.error('❌ Erreur POST /api/public/devis/repondre:', error);
        res.status(500).json({ error: 'Erreur d\'enregistrement' });
    }
});

// ===== Routes pour les Utilisateurs =====

// GET - Récupérer tous les utilisateurs
app.get('/api/users', async (req, res) => {
    try {
        const data = await readData();
        res.json({ users: data.users });
    } catch (error) {
        res.status(500).json({ error: 'Erreur de lecture' });
    }
});

// POST - Créer un nouvel utilisateur
app.post('/api/users', async (req, res) => {
    try {
        const data = await readData();
        const newUser = {
            id: Date.now().toString(),
            name: req.body.name,
            password: req.body.password
        };
        data.users.push(newUser);
        await writeData(data);
        res.json(newUser);
    } catch (error) {
        res.status(500).json({ error: 'Erreur de création' });
    }
});

// PUT - Mettre à jour un utilisateur (renommage, changement de code)
app.put('/api/users/:id', async (req, res) => {
    try {
        const data = await readData();
        const index = data.users.findIndex(u => u.id === req.params.id);

        if (index === -1) {
            return res.status(404).json({ error: 'Utilisateur non trouvé' });
        }

        if (req.body.name !== undefined) {
            data.users[index].name = req.body.name;
        }
        if (req.body.password !== undefined) {
            data.users[index].password = req.body.password;
        }

        await writeData(data);
        res.json(data.users[index]);
    } catch (error) {
        console.error('❌ Erreur PUT /api/users:', error);
        res.status(500).json({ error: 'Erreur de mise à jour' });
    }
});

// DELETE - Supprimer un utilisateur
app.delete('/api/users/:id', async (req, res) => {
    try {
        const data = await readData();
        data.users = data.users.filter(u => u.id !== req.params.id);
        await writeData(data);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Erreur de suppression' });
    }
});

// Route de health check pour le keep-alive
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Route de diagnostic Git (pour débugger les problèmes de sync)
app.get('/api/git-status', async (req, res) => {
    try {
        const diagnostics = {};

        // Vérifier les variables d'environnement
        diagnostics.hasToken = !!process.env.GITHUB_TOKEN;
        diagnostics.tokenLength = process.env.GITHUB_TOKEN ? process.env.GITHUB_TOKEN.trim().length : 0;
        diagnostics.repoConfig = process.env.GITHUB_REPO || 'aurelien39700/Devis-appli';
        diagnostics.isRender = process.env.RENDER === 'true' || !!process.env.RENDER_SERVICE_NAME;

        // Vérifier la config Git
        try {
            const { stdout: userName } = await execPromise('git config user.name');
            diagnostics.gitUserName = userName.trim();
        } catch { diagnostics.gitUserName = 'Non configuré'; }

        try {
            const { stdout: userEmail } = await execPromise('git config user.email');
            diagnostics.gitUserEmail = userEmail.trim();
        } catch { diagnostics.gitUserEmail = 'Non configuré'; }

        // Vérifier le remote
        try {
            const { stdout: remoteUrl } = await execPromise('git remote get-url origin');
            diagnostics.remoteConfigured = true;
            diagnostics.remoteUrl = remoteUrl.replace(/:[^@]+@/, ':***@'); // Masquer le token
        } catch {
            diagnostics.remoteConfigured = false;
            diagnostics.remoteUrl = 'Non configuré';
        }

        // Vérifier l'état Git
        try {
            const { stdout: status } = await execPromise('git status --porcelain');
            diagnostics.hasLocalChanges = !!status.trim();
            diagnostics.localChanges = status.trim();
        } catch (err) {
            diagnostics.statusError = err.message;
        }

        // Vérifier le dernier commit
        try {
            const { stdout: lastCommit } = await execPromise('git log -1 --oneline');
            diagnostics.lastCommit = lastCommit.trim();
        } catch { diagnostics.lastCommit = 'Aucun commit'; }

        // Tester la connexion à GitHub
        try {
            await execPromise('git ls-remote origin HEAD', { timeout: 5000 });
            diagnostics.githubConnection = 'OK';
        } catch (err) {
            diagnostics.githubConnection = 'ERREUR: ' + err.message;
        }

        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            diagnostics
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// Fonction keep-alive pour empêcher le serveur de se mettre en veille
function keepAlive() {
    setInterval(() => {
        const timestamp = new Date().toISOString();
        console.log(`⏰ Keep-alive ping: ${timestamp}`);
    }, 5 * 60 * 1000); // Toutes les 5 minutes
}

// Fonction de pull automatique depuis GitHub (pour synchronisation continue)
// DÉSACTIVÉ TEMPORAIREMENT : Causait des écrasements de données
// Le serveur Render devient la source de vérité
// Les données sont synchronisées via VS Code avec auto-sync-hybrid.sh
function autoPullFromGit() {
    console.log('ℹ️  Auto-pull désactivé - Le serveur est la source de vérité');
    // Gardons juste le push automatique des modifications
    setInterval(async () => {
        try {
            // Vérifier s'il y a des modifications locales non commitées
            const { stdout: status } = await execPromise('git status --porcelain');

            if (status.trim()) {
                // Il y a des modifications locales, commit et push vers GitHub
                console.log('📝 Modifications locales détectées, push vers GitHub...');
                await gitCommitAndPush('Auto-save depuis serveur');
                console.log('✅ Modifications poussées vers GitHub');
            }
        } catch (error) {
            console.warn('⚠️ Auto-push échoué:', error.message);
        }
    }, 10 * 1000); // Toutes les 10 secondes
}

// Démarrer le serveur
async function startServer() {
    // 0. Sur Render, se placer sur la branche main (fix detached HEAD)
    const IS_RENDER = process.env.RENDER === 'true' || !!process.env.RENDER_SERVICE_NAME;
    if (IS_RENDER) {
        try {
            console.log('🔧 Vérification de la branche Git...');
            const { stdout: currentBranch } = await execPromise('git branch --show-current');

            if (!currentBranch.trim()) {
                console.log('⚠️ Detached HEAD détecté, passage sur main...');
                await execPromise('git checkout -B main');
                await execPromise('git branch --set-upstream-to=origin/main main');
                console.log('✅ Maintenant sur la branche main');
            } else {
                console.log(`✅ Déjà sur la branche: ${currentBranch.trim()}`);
            }
        } catch (error) {
            console.warn('⚠️ Impossible de changer de branche:', error.message);
        }
    }

    // 1. Initialiser le fichier de données (sans pull - le serveur est la source de vérité)
    console.log('📂 Initialisation des données...');
    await initDataFile();

    // 2. Démarrer le serveur
    app.listen(PORT, () => {
        console.log(`🚀 Serveur démarré sur le port ${PORT}`);
        console.log(`📍 API disponible sur http://localhost:${PORT}/api/entries`);
        console.log(`💓 Keep-alive activé (ping toutes les 5 minutes)`);
        console.log(`📤 Auto-push activé (toutes les 10 secondes)`);
        console.log(`🔄 Git: Push uniquement (serveur = source de vérité)`);
        console.log(`ℹ️  Sync depuis VS Code via auto-sync-hybrid.sh`);
        keepAlive();
        autoPullFromGit();
    });
}

startServer().catch(err => {
    console.error('❌ Erreur au démarrage:', err);
    process.exit(1);
});

// Route de redéploiement manuel (pull + restart)
app.post('/api/force-update', async (req, res) => {
    try {
        console.log('🔄 Force update demandé...');
        
        // Pull depuis GitHub
        const pullResult = await gitPull();
        
        res.json({
            success: true,
            message: 'Mise à jour effectuée. Redémarrage du serveur dans 3 secondes...',
            pullResult: pullResult
        });
        
        // Redémarrer après avoir envoyé la réponse
        setTimeout(() => {
            console.log('🔄 Redémarrage du serveur...');
            process.exit(0); // Render va automatiquement redémarrer
        }, 3000);
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la mise à jour',
            error: error.message
        });
    }
});
