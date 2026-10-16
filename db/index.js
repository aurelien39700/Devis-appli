// Accès PostgreSQL : pool de connexions, transactions, création du schéma.
const fs = require('fs').promises;
const path = require('path');
const { Pool, types } = require('pg');

// NUMERIC arrive en texte par défaut : on veut des nombres côté API.
types.setTypeParser(1700, v => parseFloat(v));
// DATE arrive en objet Date (décalé selon le fuseau) : on garde 'AAAA-MM-JJ'.
types.setTypeParser(1082, v => v);
// BIGINT reste en texte : les ids sont des chaînes dans toute l'appli.

if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL manquant (ex. postgres://user:mdp@hote:5432/base)');
}

// SSL seulement vers un hôte public : l'URL externe Render
// (dpg-xxx.frankfurt-postgres.render.com) l'exige, l'URL interne (dpg-xxx,
// sans domaine) et localhost n'en ont pas besoin. PGSSL=on|off force le choix.
const hote = new URL(process.env.DATABASE_URL).hostname;
const ssl = process.env.PGSSL ? process.env.PGSSL === 'on'
    : hote.includes('.') && hote !== '127.0.0.1';
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: ssl ? { rejectUnauthorized: false } : false,
    max: 10
});

// Une connexion inactive coupée (redémarrage de la base) émet 'error' :
// sans écouteur, le processus Node s'arrêterait.
pool.on('error', err => console.error('⚠️ Connexion PostgreSQL perdue :', err.message));

const query = (text, params) => pool.query(text, params);

// Exécute fn(client) dans une transaction ; annule tout en cas d'erreur.
async function tx(fn) {
    const client = await pool.connect();
    let echec;
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        echec = err;
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        // une connexion en erreur est détruite plutôt que remise dans le pool
        client.release(echec && !echec.code ? echec : undefined);
    }
}

async function initSchema() {
    const sql = await fs.readFile(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(sql);
}

// Recale les séquences d'identité au-dessus des ids existants (après un
// import d'ids historiques).
async function resetSequences(client = pool) {
    for (const t of ['users', 'clients', 'postes', 'affaires', 'entries']) {
        await client.query(
            `SELECT setval(pg_get_serial_sequence('${t}', 'id'),
                           GREATEST((SELECT COALESCE(MAX(id), 0) FROM ${t}), 1))`);
    }
}

module.exports = { pool, query, tx, initSchema, resetSequences };
