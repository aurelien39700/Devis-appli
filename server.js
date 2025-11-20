// Serveur Node.js simple pour le suivi de soudure
// Peut être déployé gratuitement sur Render, Railway, ou Glitch

const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;
const DATA_FILE = path.join(__dirname, 'data.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Initialiser le fichier de données s'il n'existe pas
async function initDataFile() {
    try {
        await fs.access(DATA_FILE);
    } catch {
        await fs.writeFile(DATA_FILE, JSON.stringify({
            entries: [],
            clients: [],
            affaires: [],
            postes: [],
            users: []
        }));
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

// Écrire les données
async function writeData(data) {
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
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
            description: req.body.description || ''
        };
        data.affaires.push(newAffaire);
        await writeData(data);
        res.json(newAffaire);
    } catch (error) {
        res.status(500).json({ error: 'Erreur de création' });
    }
});

// DELETE - Supprimer une affaire
app.delete('/api/affaires/:id', async (req, res) => {
    try {
        const data = await readData();
        data.affaires = data.affaires.filter(a => a.id !== req.params.id);
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

// Démarrer le serveur
initDataFile().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 Serveur démarré sur le port ${PORT}`);
        console.log(`📍 API disponible sur http://localhost:${PORT}/api/entries`);
    });
});
