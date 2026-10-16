#!/usr/bin/env node
// Import de data.json dans PostgreSQL.
//
//   DATABASE_URL=postgres://... node scripts/migrate-json-to-postgres.js [data.json] [--reset]
//
// Tout se fait dans une seule transaction : en cas d'erreur, la base reste
// intacte. Si la base contient déjà des données, --reset est exigé (les
// tables sont alors vidées avant l'import).
const fs = require('fs');
const path = require('path');
const db = require('../db');
const repo = require('../db/repo');

const args = process.argv.slice(2);
const reset = args.includes('--reset');
const fichier = path.resolve(args.find(a => !a.startsWith('--')) || path.join(__dirname, '..', 'data.json'));

const num = v => (v === '' || v === null || v === undefined) ? null : (parseFloat(v) || 0);

async function main() {
    console.log('📂 Lecture de ' + fichier);
    const data = JSON.parse(fs.readFileSync(fichier, 'utf8'));
    const L = k => Array.isArray(data[k]) ? data[k] : [];

    await db.initSchema();

    const rapport = await db.tx(async (c) => {
        const { rows: [{ n }] } = await c.query('SELECT (SELECT count(*) FROM affaires) + (SELECT count(*) FROM users) AS n');
        if (Number(n) > 0) {
            if (!reset) throw new Error('La base contient déjà des données. Relancer avec --reset pour la vider et réimporter.');
            console.log('🧹 --reset : vidage des tables');
            await c.query(`TRUNCATE users, clients, contacts, postes, affaires, affaire_achats, entries, devis,
                           devis_lignes, fournisseurs, achats_biblio, entreprise RESTART IDENTITY CASCADE`);
        }

        for (const u of L('users')) {
            await c.query('INSERT INTO users (id, name, password) VALUES ($1,$2,$3)',
                [u.id, u.name, String(u.password || '')]);
        }

        let nbContacts = 0;
        for (const cl of L('clients')) {
            await c.query('INSERT INTO clients (id, name, adresse, tva) VALUES ($1,$2,$3,$4)',
                [cl.id, cl.name, String(cl.adresse || ''), String(cl.tva || '')]);
            const contacts = (cl.contacts || []).filter(ct => ct && String(ct.nom || '').trim()).map((ct, i) => ({
                id: String(ct.id || (cl.id + '-' + i)), nom: String(ct.nom).trim(),
                fonction: String(ct.fonction || ''), email: String(ct.email || ''), tel: String(ct.tel || '')
            }));
            await repo.ecrireContacts(c, cl.id, contacts);
            nbContacts += contacts.length;
        }

        for (const p of L('postes')) {
            await c.query(
                `INSERT INTO postes (id, name, taux_horaire, is_machine, ordre)
                 VALUES ($1,$2,$3,$4,$5)`,
                [p.id, p.name, num(p.tauxHoraire), !!p.isMachine,
                 p.order === undefined ? null : parseInt(p.order, 10)]);
        }

        // Références orphelines (l'ancien serveur ne supprimait pas en cascade) :
        // client ou poste disparu -> lien vidé ; affaire disparue -> ligne ignorée.
        const ids = k => new Set(L(k).map(x => String(x.id)));
        const clientsOk = ids('clients'), postesOk = ids('postes'), affairesOk = ids('affaires');
        const orphelins = { affairesSansClient: 0, saisiesSansPoste: 0, saisiesIgnorees: 0, heuresIgnorees: 0, devisIgnores: 0 };

        for (const a of L('affaires')) {
            if (a.clientId && !clientsOk.has(String(a.clientId))) { orphelins.affairesSansClient++; a.clientId = null; }
            await c.query(
                `INSERT INTO affaires (id, name, client_id, description, statut, coeff_regie)
                 VALUES ($1,$2,$3,$4,$5,$6)`,
                [a.id, a.name, a.clientId || null, String(a.description || ''), a.statut || 'en_cours',
                 a.coeffRegie === undefined ? null : num(a.coeffRegie)]);
        }

        // Rattachement des saisies aux comptes, par nom (insensible à la casse).
        const { rows: users } = await c.query('SELECT id, name FROM users');
        const parNom = {};
        users.forEach(u => { parNom[u.name.toLowerCase()] = u.id; });
        const nonRelies = {};
        const saisies = L('entries').filter(e => {
            if (affairesOk.has(String(e.affaireId))) return true;
            orphelins.saisiesIgnorees++; orphelins.heuresIgnorees += parseFloat(e.hours) || 0;
            return false;
        });
        for (const e of saisies) {
            if (e.posteId && !postesOk.has(String(e.posteId))) { orphelins.saisiesSansPoste++; e.posteId = null; }
            const userId = parNom[String(e.enteredBy || '').toLowerCase()] || null;
            if (!userId && e.enteredBy) nonRelies[e.enteredBy] = (nonRelies[e.enteredBy] || 0) + 1;
            await c.query(
                `INSERT INTO entries (id, affaire_id, poste_id, user_id, entered_by, hours, date)
                 VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                [e.id, e.affaireId, e.posteId || null, userId, String(e.enteredBy || ''),
                 num(e.hours) || 0, e.date || new Date().toISOString()]);
        }

        const devisOk = L('devis').filter(d => {
            if (affairesOk.has(String(d.affaireId))) return true;
            orphelins.devisIgnores++; return false;
        });
        let nbLignes = 0;
        for (const d of devisOk) {
            const contenu = d.data || {};
            nbLignes += ['travail', 'machine', 'achats'].reduce((n, k) => n + (contenu[k] || []).length, 0);
            const rep = d.reponseClient || null;
            await c.query(
                `INSERT INTO devis (affaire_id, client, affaire, num_commande, date, coeff_marge, note_client, delai, reglement,
                                    echeances, interlocuteur_id, token, reponse_action, reponse_date, reponse_motif,
                                    created_at, updated_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
                [d.affaireId, String(d.client || ''), String(d.affaire || ''), String(d.numCommande || ''), d.date || new Date().toISOString().slice(0, 10),
                 num(d.coeffMarge) || 1.2, String(d.noteClient || ''), String(d.delai || ''),
                 String(d.reglement || 'virement_45j'), JSON.stringify(d.echeances || []),
                 String(d.interlocuteurId || ''), d.token || null,
                 rep ? rep.action : null, rep ? rep.date : null, rep ? (rep.motif || '') : null,
                 d.createdAt || d.updatedAt || new Date().toISOString(),
                 d.updatedAt || d.createdAt || new Date().toISOString()]);
            await repo.ecrireLignesDevis(c, d.affaireId, d.data || {});
        }

        await repo.ecrireBiblio(c, 'fournisseurs', L('fournisseurs'));
        await repo.ecrireBiblio(c, 'achats_biblio', L('achats'));

        const ent = data.entreprise || {};
        await c.query(
            `INSERT INTO entreprise (id, nom, forme, adresse, cp, ville, tel, site, siret, tva, logo)
             VALUES (1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            ['nom','forme','adresse','cp','ville','tel','site','siret','tva','logo']
                .map(k => ent[k] === undefined ? null : String(ent[k])));

        await db.resetSequences(c);

        // Contrôle : ce qui est en base doit correspondre au fichier.
        const compter = async t => Number((await c.query(`SELECT count(*) AS n FROM ${t}`)).rows[0].n);
        // les bibliothèques sont dédoublonnées et sans libellé vide (comme ecrireBiblio)
        const biblio = k => new Set(L(k).map(n => String(typeof n === 'string' ? n : (n && n.nom) || '').trim())
            .filter(Boolean)).size;
        const attendus = {
            users: L('users').length, clients: L('clients').length, contacts: nbContacts,
            postes: L('postes').length, affaires: L('affaires').length, entries: saisies.length,
            devis: devisOk.length, devis_lignes: nbLignes,
            fournisseurs: biblio('fournisseurs'), achats_biblio: biblio('achats')
        };
        const lignes = [];
        for (const [t, attendu] of Object.entries(attendus)) {
            const obtenu = await compter(t);
            lignes.push({ table: t, attendu, obtenu, ok: attendu === obtenu ? '✅' : '❌' });
        }
        const heuresFichier = saisies.reduce((s, e) => s + (parseFloat(e.hours) || 0), 0);
        const heuresBase = Number((await c.query('SELECT COALESCE(SUM(hours),0) AS h FROM entries')).rows[0].h);
        lignes.push({ table: 'total heures', attendu: +heuresFichier.toFixed(2), obtenu: +heuresBase.toFixed(2),
                      ok: Math.abs(heuresFichier - heuresBase) < 0.01 ? '✅' : '❌' });
        if (lignes.some(l => l.ok === '❌')) {
            console.table(lignes);
            throw new Error('Écart entre le fichier et la base : import annulé');
        }
        return { lignes, nonRelies, orphelins };
    });

    console.table(rapport.lignes);
    const o = rapport.orphelins;
    if (o.affairesSansClient || o.saisiesSansPoste || o.saisiesIgnorees || o.devisIgnores) {
        console.log('⚠️  Références orphelines dans le fichier :');
        if (o.affairesSansClient) console.log('   - ' + o.affairesSansClient + ' affaire(s) d\'un client supprimé : importée(s) sans client');
        if (o.saisiesSansPoste) console.log('   - ' + o.saisiesSansPoste + ' saisie(s) d\'un poste supprimé : importée(s) sans poste');
        if (o.saisiesIgnorees) console.log('   - ' + o.saisiesIgnorees + ' saisie(s) d\'une affaire supprimée ignorée(s) (' + o.heuresIgnorees.toFixed(2) + ' h)');
        if (o.devisIgnores) console.log('   - ' + o.devisIgnores + ' devis d\'une affaire supprimée ignoré(s)');
    }
    if (Object.keys(rapport.nonRelies).length) {
        console.log('ℹ️  Saisies sans compte correspondant (nom conservé tel quel) :', rapport.nonRelies);
    }
    console.log('✅ Migration terminée');
}

main()
    .catch(err => { console.error('❌ ' + err.message); process.exitCode = 1; })
    .finally(() => db.pool.end());
