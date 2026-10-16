// Lecture des tables et mise en forme au format JSON historique de l'API
// (mêmes noms de champs qu'à l'époque de data.json : le front ne change pas).
const { query } = require('./index');

// Les champs optionnels absents du JSON d'origine restent absents.
function sansNull(obj) {
    Object.keys(obj).forEach(k => { if (obj[k] === null || obj[k] === undefined) delete obj[k]; });
    return obj;
}

// ===== Mappers ligne SQL -> objet API =====

const userApi = r => ({ id: r.id, name: r.name, password: r.password });

const posteApi = r => sansNull({
    id: r.id,
    name: r.name,
    tauxHoraire: r.taux_horaire,
    isMachine: r.is_machine,
    order: r.ordre
});

const affaireApi = r => sansNull({
    id: r.id,
    name: r.name,
    clientId: r.client_id || '',
    description: r.description,
    statut: r.statut,
    coeffRegie: r.coeff_regie
});

const entryApi = r => ({
    id: r.id,
    affaireId: r.affaire_id,
    posteId: r.poste_id || '',
    hours: r.hours,
    enteredBy: r.entered_by,
    date: r.date
});

const contactApi = r => ({ id: r.id, nom: r.nom, fonction: r.fonction, email: r.email, tel: r.tel });

// ===== Chargements =====

async function listUsers() {
    const { rows } = await query('SELECT * FROM users ORDER BY id');
    return rows.map(userApi);
}

async function listPostes() {
    const { rows } = await query('SELECT * FROM postes ORDER BY ordre NULLS LAST, id');
    return rows.map(posteApi);
}

async function listAffaires(where = '', params = []) {
    const { rows } = await query(`SELECT * FROM affaires ${where} ORDER BY id`, params);
    return rows.map(affaireApi);
}

async function getAffaire(id) {
    return (await listAffaires('WHERE id = $1', [id]))[0] || null;
}

// Le nom affiché suit le compte utilisateur quand l'entrée y est reliée.
async function listEntries(where = '', params = []) {
    const { rows } = await query(
        `SELECT e.*, COALESCE(u.name, e.entered_by) AS entered_by
         FROM entries e LEFT JOIN users u ON u.id = e.user_id
         ${where} ORDER BY e.date, e.id`, params);
    return rows.map(entryApi);
}

async function getEntry(id) {
    return (await listEntries('WHERE e.id = $1', [id]))[0] || null;
}

async function listClients(where = '', params = []) {
    const { rows: clients } = await query(`SELECT * FROM clients ${where} ORDER BY id`, params);
    if (!clients.length) return [];
    const { rows: contacts } = await query(
        'SELECT * FROM contacts WHERE client_id = ANY($1) ORDER BY position, id',
        [clients.map(c => c.id)]);
    return clients.map(c => ({
        id: c.id,
        name: c.name,
        adresse: c.adresse,
        tva: c.tva,
        contacts: contacts.filter(ct => ct.client_id === c.id).map(contactApi)
    }));
}

async function getClient(id) {
    return (await listClients('WHERE id = $1', [id]))[0] || null;
}

// Devis complets (avec lignes), au format { affaireId, client, affaire, data: {travail, machine, achats}, ... }
async function listDevis(where = '', params = []) {
    const { rows } = await query(
        `SELECT d.* FROM devis d ${where} ORDER BY d.affaire_id`, params);
    if (!rows.length) return [];
    const { rows: lignes } = await query(
        'SELECT * FROM devis_lignes WHERE affaire_id = ANY($1) ORDER BY position',
        [rows.map(d => d.affaire_id)]);

    return rows.map(d => {
        const siennes = lignes.filter(l => l.affaire_id === d.affaire_id);
        return sansNull({
            affaireId: d.affaire_id,
            client: d.client,
            numCommande: d.num_commande,
            affaire: d.affaire,
            date: d.date,
            coeffMarge: d.coeff_marge,
            data: {
                travail: siennes.filter(l => l.type === 'travail')
                    .map(l => ({ nom: l.nom, taux: l.taux, semaines: l.semaines || [] })),
                machine: siennes.filter(l => l.type === 'machine')
                    .map(l => ({ nom: l.nom, taux: l.taux, temps: l.temps })),
                achats: siennes.filter(l => l.type === 'achat')
                    .map(l => ({ nom: l.nom, fournisseur: l.fournisseur || '', quantite: l.quantite, prixUnit: l.prix_unit }))
            },
            noteClient: d.note_client,
            delai: d.delai,
            reglement: d.reglement,
            echeances: d.echeances,
            interlocuteurId: d.interlocuteur_id,
            token: d.token,
            reponseClient: d.reponse_action ? {
                action: d.reponse_action,
                date: d.reponse_date,
                motif: d.reponse_motif || ''
            } : null,
            createdAt: d.created_at,
            updatedAt: d.updated_at
        });
    });
}

async function getDevis(affaireId) {
    return (await listDevis('WHERE d.affaire_id = $1', [affaireId]))[0] || null;
}

async function getDevisParToken(token) {
    return (await listDevis('WHERE d.token = $1', [token]))[0] || null;
}

// Achats réels d'une affaire
async function listAchatsAffaire(affaireId) {
    const { rows } = await query(
        'SELECT * FROM affaire_achats WHERE affaire_id = $1 ORDER BY position', [affaireId]);
    return rows.map(r => ({ nom: r.nom, fournisseur: r.fournisseur, quantite: r.quantite, prixUnit: r.prix_unit }));
}

async function ecrireAchatsAffaire(client, affaireId, achats) {
    await client.query('DELETE FROM affaire_achats WHERE affaire_id = $1', [affaireId]);
    for (let i = 0; i < achats.length; i++) {
        const a = achats[i] || {};
        await client.query(
            `INSERT INTO affaire_achats (affaire_id, position, nom, fournisseur, quantite, prix_unit)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [affaireId, i, String(a.nom || ''), String(a.fournisseur || ''),
             parseFloat(a.quantite) || 0, parseFloat(a.prixUnit) || 0]);
    }
}

async function listBiblio(table) {
    const { rows } = await query(`SELECT nom FROM ${table} ORDER BY position`);
    return rows.map(r => r.nom);
}

async function getEntreprise() {
    const { rows } = await query('SELECT * FROM entreprise WHERE id = 1');
    if (!rows[0]) return {};
    const e = rows[0];
    delete e.id;
    return sansNull(e);
}

// ===== Écritures partagées =====

// Remplace les lignes d'un devis (client = connexion de la transaction).
async function ecrireLignesDevis(client, affaireId, contenu) {
    await client.query('DELETE FROM devis_lignes WHERE affaire_id = $1', [affaireId]);
    const num = v => (v === '' || v === null || v === undefined) ? null : (parseFloat(v) || 0);
    const lignes = [];
    (contenu.travail || []).forEach(l => lignes.push(['travail', l.nom, num(l.taux),
        JSON.stringify((l.semaines || []).map(v => parseFloat(v) || 0)), null, null, null, null]));
    (contenu.machine || []).forEach(l => lignes.push(['machine', l.nom, num(l.taux),
        null, num(l.temps), null, null, null]));
    (contenu.achats || []).forEach(l => lignes.push(['achat', l.nom, null,
        null, null, String(l.fournisseur || ''), num(l.quantite), num(l.prixUnit)]));

    for (let i = 0; i < lignes.length; i++) {
        const [type, nom, taux, semaines, temps, fournisseur, quantite, prixUnit] = lignes[i];
        await client.query(
            `INSERT INTO devis_lignes
               (affaire_id, type, position, nom, taux, semaines, temps, fournisseur, quantite, prix_unit)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [affaireId, type, i, String(nom || ''), taux, semaines, temps, fournisseur, quantite, prixUnit]);
    }
}

// Remplace les interlocuteurs d'un client par la liste fournie (déjà nettoyée).
async function ecrireContacts(client, clientId, contacts) {
    const ids = contacts.map(c => c.id);
    await client.query('DELETE FROM contacts WHERE client_id = $1 AND NOT (id = ANY($2))', [clientId, ids]);
    for (let i = 0; i < contacts.length; i++) {
        const c = contacts[i];
        await client.query(
            `INSERT INTO contacts (id, client_id, position, nom, fonction, email, tel)
             VALUES ($1,$2,$3,$4,$5,$6,$7)
             ON CONFLICT (id) DO UPDATE SET client_id = EXCLUDED.client_id, position = EXCLUDED.position,
               nom = EXCLUDED.nom, fonction = EXCLUDED.fonction, email = EXCLUDED.email, tel = EXCLUDED.tel`,
            [c.id, clientId, i, c.nom, c.fonction, c.email, c.tel]);
    }
}

// Remplace une bibliothèque de libellés (fournisseurs, achats_biblio).
async function ecrireBiblio(client, table, noms) {
    // deux enregistrements simultanés : le second attend le premier
    await client.query(`LOCK TABLE ${table} IN EXCLUSIVE MODE`);
    await client.query(`DELETE FROM ${table}`);
    const vus = new Set();
    let pos = 0;
    for (const n of noms) {
        const nom = String(typeof n === 'string' ? n : (n && n.nom) || '').trim();
        if (!nom || vus.has(nom)) continue;
        vus.add(nom);
        await client.query(`INSERT INTO ${table} (position, nom) VALUES ($1, $2)`, [pos++, nom]);
    }
}

// Relie un nom saisi à un compte (insensible à la casse).
async function userIdParNom(client, nom) {
    if (!nom) return null;
    const { rows } = await client.query('SELECT id FROM users WHERE lower(name) = lower($1) ORDER BY id LIMIT 1', [nom]);
    return rows[0] ? rows[0].id : null;
}

module.exports = {
    listUsers, listPostes, listAffaires, getAffaire, listEntries, getEntry,
    listClients, getClient, listDevis, getDevis, getDevisParToken,
    listBiblio, getEntreprise, listAchatsAffaire, ecrireAchatsAffaire,
    ecrireLignesDevis, ecrireContacts, ecrireBiblio, userIdParNom,
    userApi, posteApi, affaireApi
};
