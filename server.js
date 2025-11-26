// Serveur Node.js simple pour le suivi de soudure
// Peut être déployé gratuitement sur Render, Railway, ou Glitch

const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const app = express();
const PORT = process.env.PORT || 10000;
const DATA_FILE = path.join(__dirname, 'data.json');

// Middleware
app.use(cors());
app.use(express.json());
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

// Fonction pour commit et push automatiquement (compatible Render)
async function gitCommitAndPush(message) {
    try {
        // Configurer le remote si nécessaire
        await setupGitRemote();

        // Configurer Git user si nécessaire (pour Render)
        const IS_RENDER = process.env.RENDER === 'true' || !!process.env.RENDER_SERVICE_NAME;

        // Configurer l'identité Git (nécessaire pour commit)
        if (IS_RENDER) {
            await execPromise('git config user.email "app@render.com" || true');
            await execPromise('git config user.name "Render App" || true');
            console.log('🔑 GitHub token configuré pour Render');
        }

        // Ajouter data.json
        await execPromise('git add data.json');

        // Créer le commit avec un message descriptif
        const timestamp = new Date().toISOString();
        const commitMessage = `Auto-save: ${message} (${timestamp})`;

        await execPromise(`git commit -m "${commitMessage}" || echo "Rien à commiter"`);

        // Pull avant push pour éviter les conflits
        console.log('📥 Git pull (sync)...');
        try {
            await execPromise('git pull origin main --no-rebase');
        } catch (pullError) {
            console.warn('⚠️ Pull warning (peut être ignoré):', pullError.message);
        }

        // Push vers GitHub
        console.log('📤 Git push...');
        const { stdout, stderr } = await execPromise('git push origin main');
        console.log('✅ Données sauvegardées sur GitHub:', stdout);

        return { success: true, message: 'Sauvegardé sur GitHub' };
    } catch (error) {
        console.error('⚠️ Git push erreur:', error.message);
        // Ne pas bloquer l'app si git échoue
        return { success: false, message: error.message };
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
            users: parsed.users || []
        };
    } catch (error) {
        return {
            entries: [],
            clients: [],
            affaires: [],
            postes: [],
            users: []
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
        users: Array.isArray(data.users) ? data.users : []
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
    try {
        await gitCommitAndPush('Données mises à jour');
        console.log('✅ Données sauvegardées et commit\u00e9es sur GitHub');
    } catch (err) {
        console.warn('⚠️ Git push échoué, mais données sauvegardées localement');
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

// PUT - Modifier le statut d'une affaire
app.put('/api/affaires/:id/statut', async (req, res) => {
    try {
        const data = await readData();
        const affaire = data.affaires.find(a => a.id === req.params.id);
        if (affaire) {
            affaire.statut = req.body.statut;
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
            isMachine: req.body.isMachine || false
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
        const data = await readData();
        const posteIndex = data.postes.findIndex(p => p.id === req.params.id);

        if (posteIndex === -1) {
            return res.status(404).json({ error: 'Poste non trouvé' });
        }

        // Mettre à jour le nom et le taux (si fourni)
        data.postes[posteIndex] = {
            ...data.postes[posteIndex],
            name: req.body.name
        };

        // Mettre à jour le taux si fourni
        if (req.body.taux !== undefined) {
            data.postes[posteIndex].taux = req.body.taux;
        }

        // Mettre à jour isMachine si fourni
        if (req.body.isMachine !== undefined) {
            data.postes[posteIndex].isMachine = req.body.isMachine;
        }

        await writeData(data);
        res.json(data.postes[posteIndex]);
    } catch (error) {
        res.status(500).json({ error: 'Erreur de mise à jour' });
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
