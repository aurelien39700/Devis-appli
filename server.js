// Serveur Node.js : API de suivi d'affaires et de devis SOMEPRE.
// Les données sont dans PostgreSQL (voir db/schema.sql) ; les routes et le
// format JSON sont ceux de l'ancienne version sur data.json.
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const db = require('./db');
const repo = require('./db/repo');

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '2mb' }));
// Les fichiers du serveur ne sont jamais servis (data.json contient les
// mots de passe, les sauvegardes aussi) : seules les pages et leurs ressources.
app.use((req, res, next) => {
    if (/^\/(data[^/]*\.json|[^/]*backup[^/]*|package(-lock)?\.json|server\.js|render\.yaml|db\/|scripts\/|node_modules\/)/i
        .test(decodeURIComponent(req.path))) {
        return res.status(404).end();
    }
    next();
});
app.use(express.static(__dirname, { index: 'index.html' }));

// Les ids sont numériques : tout autre id désigne une ressource absente
// (évite une erreur 500 de conversion côté PostgreSQL).
['id', 'affaireId'].forEach(nom => app.param(nom, (req, res, next, val) => {
    if (!/^\d{1,18}$/.test(val)) return res.status(404).json({ error: 'Introuvable' });
    next();
}));

// Enveloppe les routes async : toute erreur part en 500 avec le message prévu.
const route = (messageErreur, fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (error) {
        console.error(`❌ ${req.method} ${req.originalUrl}:`, error.message);
        // données invalides (référence inconnue, valeur hors liste, format) : 400
        const invalide = ['23503', '23514', '22P02', '23502'].includes(error.code);
        res.status(invalide ? 400 : 500).json({ error: invalide ? 'Données invalides' : messageErreur });
    }
};

const num = v => (v === '' || v === null || v === undefined) ? null : (parseFloat(v) || 0);

// ===== Routes pour les Entrées (heures pointées) =====

// GET - Chargement groupé utilisé par le front (entrées + référentiels)
app.get('/api/entries', route('Erreur de lecture', async (req, res) => {
    const [entries, clients, affaires, postes, users, achats, fournisseurs, achatsReels] = await Promise.all([
        repo.listEntries(), repo.listClients(), repo.listAffaires(), repo.listPostes(),
        repo.listUsers(), repo.listBiblio('achats_biblio'), repo.listBiblio('fournisseurs'),
        // total des achats réels par affaire (pour les cartes de la liste)
        db.query(`SELECT affaire_id AS "affaireId", SUM(quantite * prix_unit) AS total
                  FROM affaire_achats GROUP BY affaire_id`).then(r => r.rows)
    ]);
    res.json({ entries, clients, affaires, postes, users, achats, fournisseurs, achatsReels });
}));

// POST - Créer une nouvelle entrée
app.post('/api/entries', route('Erreur de création', async (req, res) => {
    const b = req.body;
    const userId = await repo.userIdParNom(db.pool, b.enteredBy);
    const { rows } = await db.query(
        `INSERT INTO entries (affaire_id, poste_id, user_id, entered_by, hours)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [b.affaireId, b.posteId || null, userId, String(b.enteredBy || ''), num(b.hours) || 0]);
    res.json(await repo.getEntry(rows[0].id));
}));

// PUT - Mettre à jour une entrée
app.put('/api/entries/:id', route('Erreur de mise à jour', async (req, res) => {
    const b = req.body;
    const sets = [];
    const vals = [];
    const set = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
    if (b.affaireId !== undefined) set('affaire_id', b.affaireId);
    if (b.posteId !== undefined) set('poste_id', b.posteId || null);
    if (b.hours !== undefined) set('hours', num(b.hours) || 0);
    if (b.date !== undefined) set('date', b.date);
    if (b.enteredBy !== undefined) {
        set('entered_by', String(b.enteredBy || ''));
        set('user_id', await repo.userIdParNom(db.pool, b.enteredBy));
    }
    if (sets.length) {
        vals.push(req.params.id);
        await db.query(`UPDATE entries SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
    }
    const entry = await repo.getEntry(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Entrée non trouvée' });
    res.json(entry);
}));

// DELETE - Supprimer une entrée
app.delete('/api/entries/:id', route('Erreur de suppression', async (req, res) => {
    const { rowCount } = await db.query('DELETE FROM entries WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Entrée non trouvée' });
    res.json({ success: true });
}));

// Interlocuteurs d'un client (modèle V3) : nom, fonction, email, tél.
function nettoyerContacts(liste) {
    if (!Array.isArray(liste)) return [];
    return liste.filter(c => c && String(c.nom || '').trim()).map((c, i) => ({
        id: String(c.id || (Date.now().toString() + '-' + i)),
        nom: String(c.nom).trim(),
        fonction: String(c.fonction || ''),
        email: String(c.email || ''),
        tel: String(c.tel || '')
    }));
}

// ===== Routes pour les Clients =====

app.get('/api/clients', route('Erreur de lecture', async (req, res) => {
    res.json({ clients: await repo.listClients() });
}));

app.post('/api/clients', route('Erreur de création', async (req, res) => {
    const id = await db.tx(async (c) => {
        const { rows } = await c.query(
            'INSERT INTO clients (name, adresse, tva) VALUES ($1,$2,$3) RETURNING id',
            [req.body.name, String(req.body.adresse || ''), String(req.body.tva || '')]);
        await repo.ecrireContacts(c, rows[0].id, nettoyerContacts(req.body.contacts));
        return rows[0].id;
    });
    res.json(await repo.getClient(id));
}));

app.put('/api/clients/:id', route('Erreur de mise à jour', async (req, res) => {
    const b = req.body;
    const trouve = await db.tx(async (c) => {
        const { rowCount } = await c.query(
            `UPDATE clients SET name = COALESCE($2, name), adresse = COALESCE($3, adresse), tva = COALESCE($4, tva)
             WHERE id = $1`,
            [req.params.id, b.name === undefined ? null : b.name,
             b.adresse === undefined ? null : String(b.adresse), b.tva === undefined ? null : String(b.tva)]);
        if (rowCount && b.contacts !== undefined) {
            await repo.ecrireContacts(c, req.params.id, nettoyerContacts(b.contacts));
        }
        return rowCount > 0;
    });
    if (!trouve) return res.status(404).json({ error: 'Client non trouvé' });
    res.json(await repo.getClient(req.params.id));
}));

app.delete('/api/clients/:id', route('Erreur de suppression', async (req, res) => {
    await db.query('DELETE FROM clients WHERE id = $1', [req.params.id]);
    res.json({ success: true });
}));

// ===== Routes pour les Affaires =====

app.get('/api/affaires', route('Erreur de lecture', async (req, res) => {
    res.json({ affaires: await repo.listAffaires() });
}));

app.post('/api/affaires', route('Erreur de création', async (req, res) => {
    const { rows } = await db.query(
        `INSERT INTO affaires (name, client_id, description, statut) VALUES ($1,$2,$3,$4) RETURNING *`,
        [req.body.name, req.body.clientId || null, req.body.description || '',
         req.body.statut || 'en_cours']);
    res.json(repo.affaireApi(rows[0]));
}));

// PUT - Mettre à jour une affaire (nom, client, description, statut)
app.put('/api/affaires/:id', route('Erreur de mise à jour', async (req, res) => {
    const b = req.body;
    const sets = [];
    const vals = [];
    const set = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
    if (b.name !== undefined) set('name', b.name);
    if (b.clientId !== undefined) set('client_id', b.clientId || null);
    if (b.description !== undefined) set('description', b.description);
    if (b.statut !== undefined) set('statut', b.statut);
    // affaire sans devis : le coefficient de marge des heures est retenu
    // sur l'affaire
    if (b.coeffRegie !== undefined) set('coeff_regie', parseFloat(b.coeffRegie) || 1.2);

    if (sets.length) {
        vals.push(req.params.id);
        await db.query(`UPDATE affaires SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
    }
    const affaire = await repo.getAffaire(req.params.id);
    if (!affaire) return res.status(404).json({ error: 'Affaire non trouvée' });
    res.json(affaire);
}));

// POST - Archiver d'un coup toutes les affaires terminées
app.post('/api/affaires/archiver-terminees', route('Erreur d\'archivage', async (req, res) => {
    const { rowCount } = await db.query(
        `UPDATE affaires SET statut = 'archivee' WHERE statut = 'terminee'`);
    res.json({ success: true, archivees: rowCount });
}));

// PUT - Modifier le statut d'une affaire
app.put('/api/affaires/:id/statut', route('Erreur de mise à jour', async (req, res) => {
    const statut = req.body.statut;
    const resultat = await db.tx(async (c) => {
        const { rows } = await c.query('SELECT id FROM affaires WHERE id = $1 FOR UPDATE', [req.params.id]);
        if (!rows[0]) return { code: 404, error: 'Affaire non trouvée' };

        // Cycle du devis : l'envoi au client garantit un devis avec un
        // token de lien ; le retour en brouillon efface la réponse client
        // (le cycle repart proprement).
        const { rows: devis } = await c.query('SELECT token FROM devis WHERE affaire_id = $1', [req.params.id]);
        if (statut === 'envoye') {
            if (!devis[0]) return { code: 400, error: 'Aucun devis à envoyer pour cette affaire' };
            await c.query(
                `UPDATE devis SET token = COALESCE(token, $2),
                   reponse_action = NULL, reponse_date = NULL, reponse_motif = NULL
                 WHERE affaire_id = $1`,
                [req.params.id, crypto.randomBytes(8).toString('hex')]);
        } else if (statut === 'brouillon' && devis[0]) {
            await c.query(
                `UPDATE devis SET reponse_action = NULL, reponse_date = NULL, reponse_motif = NULL
                 WHERE affaire_id = $1`, [req.params.id]);
        }
        await c.query('UPDATE affaires SET statut = $2 WHERE id = $1', [req.params.id, statut]);
        return null;
    });
    if (resultat) return res.status(resultat.code).json({ error: resultat.error });
    res.json(await repo.getAffaire(req.params.id));
}));

// Achats et fournitures réellement faits sur l'affaire
app.get('/api/affaires/:id/achats', route('Erreur de lecture', async (req, res) => {
    res.json({ achats: await repo.listAchatsAffaire(req.params.id) });
}));

// PUT - Remplace la liste des achats réels de l'affaire
app.put('/api/affaires/:id/achats', route('Erreur de sauvegarde', async (req, res) => {
    if (!Array.isArray(req.body.achats)) {
        return res.status(400).json({ error: 'achats doit être un tableau' });
    }
    const trouve = await db.tx(async (c) => {
        // verrou sur l'affaire : deux remplacements simultanés ne se mélangent pas
        const { rows } = await c.query('SELECT id FROM affaires WHERE id = $1 FOR UPDATE', [req.params.id]);
        if (!rows[0]) return false;
        await repo.ecrireAchatsAffaire(c, req.params.id, req.body.achats);
        return true;
    });
    if (!trouve) return res.status(404).json({ error: 'Affaire non trouvée' });
    res.json({ achats: await repo.listAchatsAffaire(req.params.id) });
}));

// DELETE - Supprimer une affaire (ses entrées, son devis et ses achats suivent en cascade)
app.delete('/api/affaires/:id', route('Erreur de suppression', async (req, res) => {
    await db.query('DELETE FROM affaires WHERE id = $1', [req.params.id]);
    res.json({ success: true });
}));

// ===== Routes pour les Postes =====

app.get('/api/postes', route('Erreur de lecture', async (req, res) => {
    res.json({ postes: await repo.listPostes() });
}));

app.post('/api/postes', route('Erreur de création', async (req, res) => {
    const { rows } = await db.query(
        'INSERT INTO postes (name, is_machine, taux_horaire) VALUES ($1,$2,$3) RETURNING *',
        [req.body.name, !!req.body.isMachine, num(req.body.tauxHoraire) || 75]);
    res.json(repo.posteApi(rows[0]));
}));

app.put('/api/postes/:id', route('Erreur de mise à jour', async (req, res) => {
    const b = req.body;
    const sets = [];
    const vals = [];
    const set = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
    if (b.name !== undefined) set('name', b.name);
    if (b.tauxHoraire !== undefined) set('taux_horaire', num(b.tauxHoraire));
    if (b.isMachine !== undefined) set('is_machine', !!b.isMachine);
    if (b.order !== undefined) set('ordre', b.order === null ? null : parseInt(b.order, 10));

    let rows = [];
    if (sets.length) {
        vals.push(req.params.id);
        ({ rows } = await db.query(
            `UPDATE postes SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals));
    } else {
        ({ rows } = await db.query('SELECT * FROM postes WHERE id = $1', [req.params.id]));
    }
    if (!rows[0]) return res.status(404).json({ error: 'Poste non trouvé' });
    res.json(repo.posteApi(rows[0]));
}));

// POST - Réordonner tous les postes (opération atomique)
app.post('/api/postes/reorder', route('Erreur de réordonnancement', async (req, res) => {
    const { postesOrder } = req.body;
    if (!Array.isArray(postesOrder)) {
        return res.status(400).json({ error: 'postesOrder doit être un tableau' });
    }
    await db.tx(async (c) => {
        for (const { id, order } of postesOrder) {
            await c.query('UPDATE postes SET ordre = $2 WHERE id = $1', [id, parseInt(order, 10)]);
        }
    });
    res.json({ success: true, message: 'Ordre des postes mis à jour' });
}));

app.delete('/api/postes/:id', route('Erreur de suppression', async (req, res) => {
    await db.query('DELETE FROM postes WHERE id = $1', [req.params.id]);
    res.json({ success: true });
}));

// ===== Bibliothèques : fournisseurs et achats (listes de libellés) =====

app.get('/api/fournisseurs', route('Erreur de lecture', async (req, res) => {
    res.json({ fournisseurs: await repo.listBiblio('fournisseurs') });
}));

app.post('/api/fournisseurs', route('Erreur de sauvegarde', async (req, res) => {
    await db.tx(c => repo.ecrireBiblio(c, 'fournisseurs', req.body.fournisseurs || []));
    res.json({ success: true, fournisseurs: await repo.listBiblio('fournisseurs') });
}));

app.get('/api/achats', route('Erreur de lecture', async (req, res) => {
    res.json({ achats: await repo.listBiblio('achats_biblio') });
}));

app.post('/api/achats', route('Erreur de sauvegarde', async (req, res) => {
    await db.tx(c => repo.ecrireBiblio(c, 'achats_biblio', req.body.achats || []));
    res.json({ success: true, achats: await repo.listBiblio('achats_biblio') });
}));

// ===== Routes pour les Devis (un devis par affaire) =====

// Calcule la synthèse budget (devis) / réel (heures saisies) d'une affaire.
// Rien n'est stocké : tout est recalculé à la demande, comme dans la V3.
// `data` ne contient que l'affaire concernée, son devis, ses entrées, ses
// achats réels et les postes.
//
// Prix de vente = heures x taux x coefficient de marge + achats (les achats
// et fournitures sont refacturés à leur prix, sans marge).
function calculerSynthese(data, affaireId) {
    const affaire = data.affaires.find(a => a.id === affaireId);
    if (!affaire) return null;

    const devis = (data.devis || []).find(d => d.affaireId === affaireId);
    const contenu = (devis && devis.data) || {};
    const coeffMarge = devis
        ? parseFloat(devis.coeffMarge) || 1.2
        : parseFloat(affaire.coeffRegie) || 1.2;

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

    // --- Réel : les heures saisies, valorisées au taux du devis pour les
    // postes chiffrés (même base que le budget), sinon au taux du poste ---
    const tauxDevis = {};
    (contenu.travail || []).concat(contenu.machine || []).forEach(l => {
        if (tauxDevis[l.nom] === undefined) tauxDevis[l.nom] = parseFloat(l.taux) || 0;
    });
    const reel = {};
    data.entries.filter(e => e.affaireId === affaireId).forEach(e => {
        const poste = data.postes.find(p => p.id === e.posteId);
        const nom = poste ? poste.name : 'Poste inconnu';
        if (!reel[nom]) {
            reel[nom] = {
                heures: 0,
                taux: tauxDevis[nom] !== undefined ? tauxDevis[nom]
                    : (poste ? (parseFloat(poste.tauxHoraire) || 0) : 0),
                machine: poste ? !!poste.isMachine : false
            };
        }
        reel[nom].heures += parseFloat(e.hours) || 0;
    });

    const achatsReels = data.achatsReels || [];
    const totalAchatsReels = achatsReels.reduce(
        (s, a) => s + (parseFloat(a.quantite) || 0) * (parseFloat(a.prixUnit) || 0), 0);

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
    const prixDevis = budgetMontant * coeffMarge + budgetAchats;
    const prixReel = reelMontant * coeffMarge + totalAchatsReels;

    return {
        affaireId: affaireId,
        affaire: affaire,
        aDevis: !!devis,
        coeffMarge: coeffMarge,
        postes: postes,
        achatsReels: achatsReels,
        totaux: {
            budgetHeures: somme('budgetHeures'),
            budgetMontant: budgetMontant,
            budgetAchats: budgetAchats,
            reelHeures: somme('reelHeures'),
            reelMontant: reelMontant,
            reelAchats: totalAchatsReels,
            ecartHeures: somme('ecartHeures'),
            ecartMontant: reelMontant - budgetMontant,
            // prix de vente HT : heures avec marge + achats sans marge
            prixDevis: devis ? prixDevis : null,
            prixReel: prixReel,
            ecartPrix: devis ? prixReel - prixDevis : null
        }
    };
}

// GET - Tous les devis (permet au front de calculer les écarts sans N requêtes)
app.get('/api/devis', route('Erreur de lecture', async (req, res) => {
    res.json({ devis: await repo.listDevis() });
}));

// GET - Le devis d'une affaire
app.get('/api/devis/:affaireId', route('Erreur de lecture', async (req, res) => {
    const devis = await repo.getDevis(req.params.affaireId);
    if (!devis) return res.status(404).json({ error: 'Aucun devis pour cette affaire' });
    res.json(devis);
}));

// PUT - Créer ou mettre à jour le devis d'une affaire
app.put('/api/devis/:affaireId', route('Erreur de sauvegarde', async (req, res) => {
    const affaireId = req.params.affaireId;
    const b = req.body;
    const trouve = await db.tx(async (c) => {
        const { rows: aff } = await c.query('SELECT id FROM affaires WHERE id = $1', [affaireId]);
        if (!aff[0]) return false;

        // Un client (ex. l'ancien devis-sync) qui n'envoie pas les conditions
        // ne doit pas les effacer : COALESCE retombe sur l'existant. Le token
        // et la réponse client ne sont jamais pilotés par la requête.
        const opt = v => v === undefined ? null : String(v || '');
        await c.query(
            `INSERT INTO devis (affaire_id, num_commande, date, coeff_marge, note_client, delai,
                                reglement, echeances, interlocuteur_id, client, affaire)
             VALUES ($1, $2, COALESCE($3::date, CURRENT_DATE), $4,
                     COALESCE($5, ''), COALESCE($6, ''), COALESCE($7, 'virement_45j'),
                     COALESCE($8::jsonb, '[]'), COALESCE($9, ''), $10, $11)
             ON CONFLICT (affaire_id) DO UPDATE SET
                client = EXCLUDED.client,
                affaire = EXCLUDED.affaire,
                num_commande = EXCLUDED.num_commande,
                date = EXCLUDED.date,
                coeff_marge = EXCLUDED.coeff_marge,
                note_client = COALESCE($5, devis.note_client),
                delai = COALESCE($6, devis.delai),
                reglement = COALESCE($7, devis.reglement),
                echeances = COALESCE($8::jsonb, devis.echeances),
                interlocuteur_id = COALESCE($9, devis.interlocuteur_id),
                updated_at = now()`,
            [affaireId, String(b.numCommande || ''), b.date || null, num(b.coeffMarge) || 1.2,
             opt(b.noteClient), opt(b.delai), b.reglement === undefined ? null : String(b.reglement),
             Array.isArray(b.echeances) ? JSON.stringify(b.echeances) : null, opt(b.interlocuteurId),
             String(b.client || ''), String(b.affaire || '')]);

        if (b.data) await repo.ecrireLignesDevis(c, affaireId, b.data);
        return true;
    });
    if (!trouve) return res.status(404).json({ error: 'Affaire non trouvée' });
    res.json(await repo.getDevis(affaireId));
}));

// DELETE - Supprimer le devis d'une affaire
app.delete('/api/devis/:affaireId', route('Erreur de suppression', async (req, res) => {
    await db.query('DELETE FROM devis WHERE affaire_id = $1', [req.params.affaireId]);
    res.json({ success: true });
}));

// GET - Synthèse budget / réel d'une affaire
app.get('/api/affaires/:id/synthese', route('Erreur de calcul', async (req, res) => {
    const id = req.params.id;
    const [affaire, devis, entries, postes, achatsReels] = await Promise.all([
        repo.getAffaire(id), repo.getDevis(id),
        repo.listEntries('WHERE e.affaire_id = $1', [id]), repo.listPostes(),
        repo.listAchatsAffaire(id)
    ]);
    const synthese = affaire && calculerSynthese(
        { affaires: [affaire], devis: devis ? [devis] : [], entries, postes, achatsReels }, id);
    if (!synthese) return res.status(404).json({ error: 'Affaire non trouvée' });
    res.json(synthese);
}));

// ===== Entreprise (coordonnées reprises sur les devis client) =====

const CHAMPS_ENTREPRISE = ['nom', 'forme', 'adresse', 'cp', 'ville', 'tel', 'site', 'siret', 'tva', 'logo'];

app.get('/api/entreprise', route('Erreur de lecture', async (req, res) => {
    res.json({ entreprise: await repo.getEntreprise() });
}));

app.post('/api/entreprise', route('Erreur de sauvegarde', async (req, res) => {
    const corps = req.body || {};
    // le logo arrive en data URI ; on borne sa taille
    if (corps.logo && String(corps.logo).length > 400000) {
        return res.status(413).json({ error: 'Logo trop lourd (300 Ko maximum)' });
    }
    const vals = CHAMPS_ENTREPRISE.map(k => corps[k] === undefined ? null : String(corps[k]));
    const cols = CHAMPS_ENTREPRISE.join(', ');
    const params = CHAMPS_ENTREPRISE.map((_, i) => `$${i + 1}`).join(', ');
    const maj = CHAMPS_ENTREPRISE.map((k, i) => `${k} = COALESCE($${i + 1}, entreprise.${k})`).join(', ');
    await db.query(
        `INSERT INTO entreprise (id, ${cols}) VALUES (1, ${params})
         ON CONFLICT (id) DO UPDATE SET ${maj}`, vals);
    res.json({ success: true, entreprise: await repo.getEntreprise() });
}));

// ===== Page client publique (lien par token, sans compte) =====

// Montants tels que le client les voit : heures x coefficient de marge,
// achats refactures sans marge. Jamais le detail interne.
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
        fournituresHT: achats,
        totalHT: mo * coeff + achats
    };
}

// GET - Le devis vu par le client (notes, montants, conditions - pas le detail)
app.get('/api/public/devis/:token', route('Erreur de lecture', async (req, res) => {
    const devis = await repo.getDevisParToken(req.params.token);
    if (!devis) return res.status(404).json({ error: 'Devis introuvable' });

    const affaire = (await repo.getAffaire(devis.affaireId)) || {};
    const client = affaire.clientId ? await repo.getClient(affaire.clientId) : null;
    const ct = client && devis.interlocuteurId
        ? client.contacts.find(x => String(x.id) === String(devis.interlocuteurId)) : null;

    res.json({
        entreprise: await repo.getEntreprise(),
        devis: {
            clientNom: client ? client.name : (devis.client || ''),
            interlocuteur: ct ? { nom: ct.nom, fonction: ct.fonction || '' } : null,
            affaireNom: affaire.name || devis.affaire || '',
            description: affaire.description || '',
            numCommande: devis.numCommande || '',
            date: devis.date || '',
            noteClient: devis.noteClient || '',
            delai: devis.delai || '',
            reglement: devis.reglement || '',
            echeances: devis.echeances || [],
            // pas de detail : le client ne voit que le total
            montants: { totalHT: montantsClient(devis).totalHT },
            reponse: devis.reponseClient || null,
            repondable: affaire.statut === 'envoye' && !devis.reponseClient
        }
    });
}));

// POST - La reponse du client : accepter fait passer l'affaire en cours
app.post('/api/public/devis/:token/repondre', route('Erreur d\'enregistrement', async (req, res) => {
    const action = req.body.action === 'accepter' ? 'accepter'
                 : req.body.action === 'refuser' ? 'refuser' : null;

    const resultat = await db.tx(async (c) => {
        const { rows } = await c.query(
            `SELECT d.affaire_id, d.reponse_action, d.reponse_date, d.reponse_motif, a.statut, a.name
             FROM devis d JOIN affaires a ON a.id = d.affaire_id
             WHERE d.token = $1 FOR UPDATE`, [req.params.token]);
        const d = rows[0];
        if (!d) return { code: 404, body: { error: 'Devis introuvable' } };
        if (d.statut !== 'envoye' || d.reponse_action) {
            return { code: 409, body: {
                error: 'Ce devis n\'attend plus de réponse',
                reponse: d.reponse_action
                    ? { action: d.reponse_action, date: d.reponse_date, motif: d.reponse_motif || '' } : null
            } };
        }
        if (!action) return { code: 400, body: { error: 'Action inconnue' } };

        const reponse = {
            action: action === 'accepter' ? 'accepte' : 'refuse',
            date: new Date().toISOString(),
            motif: action === 'refuser' ? String(req.body.motif || '').slice(0, 500) : ''
        };
        await c.query(
            'UPDATE devis SET reponse_action = $2, reponse_date = $3, reponse_motif = $4 WHERE affaire_id = $1',
            [d.affaire_id, reponse.action, reponse.date, reponse.motif]);
        if (action === 'accepter') {
            await c.query(`UPDATE affaires SET statut = 'en_cours' WHERE id = $1`, [d.affaire_id]);
            console.log('✅ Devis accepté par le client - affaire ' + d.name + ' en cours');
        } else {
            console.log('❌ Devis refusé par le client - affaire ' + d.name);
        }
        return { code: 200, body: { success: true, reponse } };
    });
    res.status(resultat.code).json(resultat.body);
}));

// ===== Routes pour les Utilisateurs =====

app.get('/api/users', route('Erreur de lecture', async (req, res) => {
    res.json({ users: await repo.listUsers() });
}));

app.post('/api/users', route('Erreur de création', async (req, res) => {
    const { rows } = await db.query(
        'INSERT INTO users (name, password) VALUES ($1,$2) RETURNING *',
        [req.body.name, String(req.body.password || '')]);
    // les saisies déjà faites sous ce nom sont rattachées au nouveau compte
    await db.query('UPDATE entries SET user_id = $1 WHERE user_id IS NULL AND lower(entered_by) = lower($2)',
        [rows[0].id, rows[0].name]);
    res.json(repo.userApi(rows[0]));
}));

app.put('/api/users/:id', route('Erreur de mise à jour', async (req, res) => {
    const { rows } = await db.query(
        `UPDATE users SET name = COALESCE($2, name), password = COALESCE($3, password),
                          is_admin = COALESCE($4, is_admin)
         WHERE id = $1 RETURNING *`,
        [req.params.id, req.body.name === undefined ? null : req.body.name,
         req.body.password === undefined ? null : String(req.body.password),
         req.body.isAdmin === undefined ? null : !!req.body.isAdmin]);
    if (!rows[0]) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    res.json(repo.userApi(rows[0]));
}));

app.delete('/api/users/:id', route('Erreur de suppression', async (req, res) => {
    // le compte Admin est indispensable : on ne le supprime pas
    await db.query(`DELETE FROM users WHERE id = $1 AND name <> 'Admin'`, [req.params.id]);
    res.json({ success: true });
}));

// Route de health check (vérifie aussi la base)
app.get('/health', async (req, res) => {
    try {
        await db.query('SELECT 1');
        res.status(200).json({ status: 'ok', db: 'ok', timestamp: new Date().toISOString() });
    } catch (error) {
        res.status(503).json({ status: 'degraded', db: 'down', timestamp: new Date().toISOString() });
    }
});

// Démarrer le serveur
async function startServer() {
    console.log('🗄️  Initialisation du schéma PostgreSQL...');
    await db.initSchema();

    // Le compte Admin doit toujours exister
    const { rowCount } = await db.query(
        `INSERT INTO users (name, password) SELECT 'Admin', 'ADMIN'
         WHERE NOT EXISTS (SELECT 1 FROM users WHERE name = 'Admin')`);
    if (rowCount) console.log('⚠️ Compte Admin absent : recréé avec le code par défaut');

    app.listen(PORT, () => {
        console.log(`🚀 Serveur démarré sur le port ${PORT}`);
    });
}

startServer().catch(err => {
    console.error('❌ Erreur au démarrage:', err);
    process.exit(1);
});
