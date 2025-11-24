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

// Fonction pour pull les dernières données depuis Git
async function gitPull() {
    try {
        console.log('📥 Git pull...');
        const { stdout, stderr } = await execPromise('git pull origin main');
        console.log('✅ Git pull réussi:', stdout);
        return { success: true, message: stdout };
    } catch (error) {
        console.error('❌ Git pull erreur:', error.message);
        return { success: false, message: error.message };
    }
}

// Fonction pour commit et push automatiquement
async function gitCommitAndPush(message) {
    try {
        // Ajouter data.json
        await execPromise('git add data.json');

        // Créer le commit avec un message descriptif
        const timestamp = new Date().toISOString();
        const commitMessage = `Auto-save: ${message} (${timestamp})`;

        await execPromise(`git commit -m "${commitMessage}" || echo "Rien à commiter"`);

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

        // Essayer de restaurer depuis le backup
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

    // Commit et push automatiquement sur Git (non-bloquant)
    // Ne pas await pour ne pas ralentir l'API
    gitCommitAndPush('Données mises à jour').catch(err => {
        console.warn('⚠️ Git push échoué, mais données sauvegardées localement');
    });
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
            name: req.body.name
        };
        data.postes.push(newPoste);
        await writeData(data);
        res.json(newPoste);
    } catch (error) {
        res.status(500).json({ error: 'Erreur de création' });
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

// Route pour pull manuel depuis Git
app.post('/api/git/pull', async (req, res) => {
    console.log('📥 Pull manuel demandé');
    const result = await gitPull();

    if (result.success) {
        // Recharger les données après le pull
        const data = await readData();
        res.json({ success: true, message: 'Données synchronisées depuis Git', data });
    } else {
        res.status(500).json({ success: false, message: result.message });
    }
});

// Route pour forcer un commit/push manuel
app.post('/api/git/push', async (req, res) => {
    console.log('📤 Push manuel demandé');
    const result = await gitCommitAndPush('Push manuel');
    res.json(result);
});

// Fonction keep-alive pour empêcher le serveur de se mettre en veille
function keepAlive() {
    setInterval(() => {
        const timestamp = new Date().toISOString();
        console.log(`⏰ Keep-alive ping: ${timestamp}`);
    }, 5 * 60 * 1000); // Toutes les 5 minutes
}

// Fonction de sauvegarde automatique périodique (snapshots)
async function autoSnapshot() {
    setInterval(async () => {
        try {
            const SNAPSHOT_DIR = path.join(__dirname, 'snapshots');

            // Créer le dossier snapshots s'il n'existe pas
            try {
                await fs.access(SNAPSHOT_DIR);
            } catch {
                await fs.mkdir(SNAPSHOT_DIR);
            }

            // Lire le fichier actuel
            const currentData = await fs.readFile(DATA_FILE, 'utf8');
            const parsed = JSON.parse(currentData);

            // Ne créer un snapshot que si la base n'est pas vide
            const hasData = parsed.entries?.length > 0 ||
                           parsed.clients?.length > 0 ||
                           parsed.affaires?.length > 0 ||
                           parsed.postes?.length > 0 ||
                           (parsed.users?.length > 1); // Plus que juste l'admin

            if (hasData) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
                const snapshotFile = path.join(SNAPSHOT_DIR, `snapshot_${timestamp}.json`);
                await fs.writeFile(snapshotFile, currentData);
                console.log(`📸 Snapshot créé: snapshot_${timestamp}.json`);

                // Garder seulement les 10 derniers snapshots
                const files = await fs.readdir(SNAPSHOT_DIR);
                const snapshots = files.filter(f => f.startsWith('snapshot_')).sort();
                if (snapshots.length > 10) {
                    for (let i = 0; i < snapshots.length - 10; i++) {
                        await fs.unlink(path.join(SNAPSHOT_DIR, snapshots[i]));
                        console.log(`🗑️ Ancien snapshot supprimé: ${snapshots[i]}`);
                    }
                }
            }
        } catch (error) {
            console.error('❌ Erreur snapshot:', error);
        }
    }, 15 * 60 * 1000); // Toutes les 15 minutes
}

// Démarrer le serveur
async function startServer() {
    // 1. Pull les dernières données depuis Git au démarrage
    console.log('🔄 Synchronisation Git au démarrage...');
    await gitPull();

    // 2. Initialiser le fichier de données
    await initDataFile();

    // 3. Démarrer le serveur
    app.listen(PORT, () => {
        console.log(`🚀 Serveur démarré sur le port ${PORT}`);
        console.log(`📍 API disponible sur http://localhost:${PORT}/api/entries`);
        console.log(`💓 Keep-alive activé (ping toutes les 5 minutes)`);
        console.log(`📸 Snapshots automatiques activés (toutes les 15 minutes)`);
        console.log(`🔄 Git: Pull au démarrage, Push après chaque modification`);
        keepAlive();
        autoSnapshot();
    });
}

startServer().catch(err => {
    console.error('❌ Erreur au démarrage:', err);
    process.exit(1);
});
