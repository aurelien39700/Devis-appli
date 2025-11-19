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
        await fs.writeFile(DATA_FILE, JSON.stringify({ entries: [] }));
    }
}

// Lire les données
async function readData() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return { entries: [] };
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

// Démarrer le serveur
initDataFile().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 Serveur démarré sur le port ${PORT}`);
        console.log(`📍 API disponible sur http://localhost:${PORT}/api/entries`);
    });
});
