/* ==========================================================================
   SOMEPRE ATELIER — logique de la nouvelle interface
   --------------------------------------------------------------------------
   Parle à la même API et aux mêmes données que l'interface historique
   (index.html), qui reste intacte et sert de secours. Trois destinations :
   Pointage (tout le monde) · Affaires · Gestion (admin).
   L'affaire porte un cycle unique : brouillon → envoyé → en cours →
   terminée (→ archivée), et son devis vit sur sa fiche.
   ========================================================================== */
(function () {
    'use strict';

    const API = window.location.origin + '/api';
    const CODE_ADMIN = 'ADMIN';
    const REGLEMENTS = {
        cheque: 'Chèque', traite_30j: 'Traite à 30 jours', traite_45j: 'Traite à 45 jours',
        virement_immediat: 'Virement immédiat', virement_30j: 'Virement à 30 jours',
        virement_45j: 'Virement à 45 jours', personnalise: 'Échéancier personnalisé'
    };
    // Les mêmes mots partout : le couloir reprend les noms des pastilles
    // et du cycle de la fiche.
    const STADES = [
        { k: 'brouillon', lab: 'Brouillons' },
        { k: 'envoye',    lab: 'Envoyés au client' },
        { k: 'en_cours',  lab: 'En cours' },
        { k: 'terminee',  lab: 'Terminées' }
    ];
    const NOMS_STADE = { brouillon: 'Brouillon', envoye: 'Envoyé', en_cours: 'En cours',
                         terminee: 'Terminée', archivee: 'Archivée' };
    const PAS = ['brouillon', 'envoye', 'en_cours', 'terminee'];
    const PAS_LAB = { brouillon: 'Brouillon', envoye: 'Envoyé au client',
                      en_cours: 'En cours', terminee: 'Terminée' };

    /* ═══════════════ état ═══════════════ */
    const etat = {
        moi: null,            // { type, name, userId }
        clients: [], affaires: [], postes: [], users: [], entries: [],
        devis: {},            // par affaireId
        entreprise: {},
        fournisseursBib: [],  // bibliothèque des fournisseurs (chaînes)
        achatsBib: [],        // bibliothèque des achats (chaînes)
        recherche: '',
        ongletGestion: 'entreprise',
        editionAffaireId: null,
        editionClientId: null,    // le client édité dans la modale d'identité
        ficheClientId: null,      // la fiche client ouverte
        editionContactIdx: null,  // l'interlocuteur édité (index), null = ajout   // la modale affaire modifie au lieu de créer
        vue: 'pointage',
        ficheId: null,
        filtre: null,         // stade filtré dans le couloir
        devisLocal: null,     // copie de travail du devis de la fiche ouverte
        syntheseLocale: null
    };

    /* ═══════════════ utilitaires ═══════════════ */
    const $ = s => document.querySelector(s);
    const $$ = s => Array.from(document.querySelectorAll(s));
    const esc = s => String(s == null ? '' : s)
        .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const attr = s => esc(s).replace(/'/g, '&#39;');
    const eur = v => (v || 0).toFixed(2).replace('.', ',')
        .replace(/\B(?=(\d{3})+(?!\d)(?=,))/g, ' ') + ' €';
    const h1 = v => (v || 0).toFixed(1).replace('.', ',');
    const cls = v => Math.abs(v) < 0.005 ? 'neutre' : (v > 0 ? 'depasse' : 'sous');
    const sgn = (v, f) => (v > 0 ? '+' : '') + f(v);
    const stadeDe = a => a.statut || 'en_cours';
    const estAdmin = () => etat.moi && etat.moi.type === 'admin';

    async function api(chemin, methode, corps) {
        const r = await fetch(API + chemin, {
            method: methode || 'GET',
            headers: corps ? { 'Content-Type': 'application/json' } : undefined,
            body: corps ? JSON.stringify(corps) : undefined,
            cache: 'no-store'
        });
        const body = await r.json().catch(() => null);
        if (!r.ok) {
            const e = new Error((body && body.error) || ('Erreur serveur ' + r.status));
            e.status = r.status;
            throw e;
        }
        return body;
    }

    const toastEl = $('#toast');
    let toastTimer = null;
    function toast(msg, erreur) {
        $('#toastTexte').textContent = msg;
        toastEl.classList.toggle('erreur', !!erreur);
        toastEl.classList.add('is-on');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), 3000);
    }

    function ouvrir(id) { $('#' + id).classList.add('is-on'); }
    function fermer(id) { $('#' + id).classList.remove('is-on'); }
    $$('[data-fermer]').forEach(b => b.addEventListener('click', () => fermer(b.dataset.fermer)));
    $$('.scrim').forEach(s => s.addEventListener('click', e => {
        if (e.target === s) s.classList.remove('is-on');
    }));
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') $$('.scrim').forEach(s => s.classList.remove('is-on'));
    });

    // Dans un champ numerique, cliquer selectionne la valeur : on tape,
    // ca remplace - plus de 0 a effacer a la main.
    document.addEventListener('focusin', e => {
        const el = e.target;
        if (el.tagName === 'INPUT' && el.type === 'number') el.select();
    });

    /* ═══════════════ chargement des données ═══════════════ */
    async function chargerTout() {
        const [tout, devisListe, entreprise, fourn, achatsBib] = await Promise.all([
            api('/entries?_t=' + Date.now()),
            api('/devis?_t=' + Date.now()).catch(() => ({ devis: [] })),
            api('/entreprise?_t=' + Date.now()).catch(() => ({ entreprise: {} })),
            api('/fournisseurs?_t=' + Date.now()).catch(() => ({ fournisseurs: [] })),
            api('/achats?_t=' + Date.now()).catch(() => ({ achats: [] }))
        ]);
        etat.entries = tout.entries || [];
        etat.clients = tout.clients || [];
        etat.affaires = tout.affaires || [];
        etat.postes = (tout.postes || []).slice()
            .sort((a, b) => (a.order !== undefined ? a.order : 999) - (b.order !== undefined ? b.order : 999));
        etat.users = tout.users || [];
        etat.devis = {};
        (devisListe.devis || []).forEach(d => { etat.devis[d.affaireId] = d; });
        etat.entreprise = entreprise.entreprise || {};
        etat.fournisseursBib = (fourn.fournisseurs || []).map(f => typeof f === 'string' ? f : (f.nom || ''));
        etat.achatsBib = (achatsBib.achats || []).map(a => typeof a === 'string' ? a : (a.nom || ''));
        $('#syncEtat').textContent = 'Synchronisé';
        $('#syncEtat').classList.remove('hors');
    }

    function heuresAffaire(id) {
        return etat.entries.filter(e => e.affaireId === id)
            .reduce((s, e) => s + (parseFloat(e.hours) || 0), 0);
    }
    // Prix de vente HT au temps passé : heures pointées valorisées au taux
    // horaire de leur poste, coefficient de régie compris.
    function montantRegieAffaire(a) {
        const coeffR = parseFloat(a.coeffRegie) || 1.2;
        let mnt = 0;
        etat.entries.filter(e => e.affaireId === a.id).forEach(e => {
            const p = etat.postes.find(x => x.id === e.posteId);
            mnt += (parseFloat(e.hours) || 0) * (p ? (parseFloat(p.tauxHoraire) || 0) : 0);
        });
        return mnt * coeffR;
    }
    function budgetDevis(d) {
        if (!d || !d.data) return 0;
        const t = (d.data.travail || []).reduce((s, p) =>
            s + (p.semaines || []).reduce((a, b) => a + (parseFloat(b) || 0), 0), 0);
        const m = (d.data.machine || []).reduce((s, x) => s + (parseFloat(x.temps) || 0), 0);
        return t + m;
    }
    function montantsDevis(d) {
        if (!d || !d.data) return { heures: 0, achats: 0 };
        const heures = (d.data.travail || []).reduce((s, p) =>
                s + (p.semaines || []).reduce((a, b) => a + (parseFloat(b) || 0), 0) * (parseFloat(p.taux) || 0), 0)
            + (d.data.machine || []).reduce((s, m) =>
                s + (parseFloat(m.temps) || 0) * (parseFloat(m.taux) || 0), 0);
        const achats = (d.data.achats || []).reduce((s, a) =>
            s + (parseFloat(a.quantite) || 0) * (parseFloat(a.prixUnit) || 0), 0);
        return { heures: heures, achats: achats };
    }

    /* ═══════════════ connexion ═══════════════ */
    let typeConnexion = 'user';
    $$('.types button').forEach(b => b.addEventListener('click', () => {
        $$('.types button').forEach(x => x.classList.toggle('is-on', x === b));
        typeConnexion = b.dataset.type;
        $('#champUtilisateur').classList.toggle('hidden', typeConnexion === 'admin');
        $('#labCode').textContent = typeConnexion === 'admin' ? 'Code Admin' : 'Mot de passe';
        $('#codeAcces').placeholder = typeConnexion === 'admin'
            ? 'Entrez le code admin' : 'Entrez votre mot de passe';
    }));

    async function preparerConnexion() {
        try {
            const d = await api('/users');
            etat.users = d.users || [];
        } catch (e) { /* hors ligne : la liste restera vide */ }
        const sel = $('#selUtilisateur');
        sel.innerHTML = '<option value="">Sélectionner votre nom</option>'
            + etat.users.filter(u => u.name !== 'Admin')
                .map(u => '<option value="' + attr(u.id) + '">' + esc(u.name) + '</option>').join('');
    }

    $('#formConnexion').addEventListener('submit', async e => {
        e.preventDefault();
        const code = $('#codeAcces').value;
        const err = $('#erreurConnexion');
        err.classList.remove('show');

        if (typeConnexion === 'admin') {
            if (code !== CODE_ADMIN) { err.textContent = 'Code admin incorrect'; err.classList.add('show'); return; }
            etat.moi = { type: 'admin', name: 'Administrateur' };
        } else {
            const id = $('#selUtilisateur').value;
            if (!id) { err.textContent = 'Sélectionnez votre nom'; err.classList.add('show'); return; }
            const u = etat.users.find(x => x.id === id);
            if (!u || u.password !== code) {
                err.textContent = 'Mot de passe incorrect'; err.classList.add('show'); return;
            }
            etat.moi = { type: 'user', name: u.name, userId: u.id };
        }
        localStorage.setItem('atelier_utilisateur', JSON.stringify(etat.moi));
        $('#codeAcces').value = '';
        await demarrerApp();
    });

    $('#btnDeconnexion').addEventListener('click', () => {
        etat.moi = null;
        localStorage.removeItem('atelier_utilisateur');
        $('#ecranApp').classList.add('hidden');
        $('#fab').classList.add('hidden');
        $('#ecranConnexion').classList.remove('hidden');
    });

    /* ═══════════════ navigation ═══════════════ */
    const TITRES = { pointage: ['Saisie', 'Pointage'], affaires: ['Production', 'Affaires'],
                     fiche: ['Affaire', ''], gestion: ['Référentiel', 'Gestion'],
                     ficheClient: ['Client', ''] };

    function aller(vue) {
        etat.vue = vue;
        $$('.view').forEach(v => v.classList.toggle('is-on', v.dataset.vue === vue));
        $$('.nav-item').forEach(b => b.classList.toggle('is-on',
            b.dataset.vue === vue || (vue === 'fiche' && b.dataset.vue === 'affaires')
            || (vue === 'ficheClient' && b.dataset.vue === 'gestion')));
        const t = TITRES[vue];
        $('#crumbTop').textContent = t[0];
        $('#crumbMain').textContent = vue === 'fiche'
            ? ((etat.affaires.find(a => a.id === etat.ficheId) || {}).name || '')
            : vue === 'ficheClient'
                ? ((etat.clients.find(c => c.id === etat.ficheClientId) || {}).name || '')
                : t[1];
        $('#btnNouvelle').classList.toggle('hidden', vue !== 'affaires');
        $('#fab').classList.toggle('hidden', vue !== 'pointage');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    $$('.nav-item').forEach(b => b.addEventListener('click', () => {
        aller(b.dataset.vue);
        if (b.dataset.vue === 'affaires') rendreListeAffaires();
        else if (b.dataset.vue === 'pointage') rendrePointage();
        else if (b.dataset.vue === 'gestion') rendreGestion();
    }));
    $('#btnRetour').addEventListener('click', () => { aller('affaires'); rendreListeAffaires(); });
    $('#btnRetourClient').addEventListener('click', () => { aller('gestion'); rendreGestion(); });
    $('#rechercheAffaires').addEventListener('input', () => {
        etat.recherche = $('#rechercheAffaires').value.trim().toLowerCase();
        rendreListeAffaires();
    });

    function correspondRecherche(a) {
        if (!etat.recherche) return true;
        const c = etat.clients.find(x => x.id === a.clientId);
        return (a.name || '').toLowerCase().indexOf(etat.recherche) !== -1
            || (a.description || '').toLowerCase().indexOf(etat.recherche) !== -1
            || (c && c.name.toLowerCase().indexOf(etat.recherche) !== -1);
    }

    /* ═══════════════ POINTAGE ═══════════════ */
    function rendrePointage() {
        // Groupé par client, clients et affaires en ordre alphabétique,
        // total d'heures par client — comme l'interface historique.
        const enCours = etat.affaires.filter(a => stadeDe(a) === 'en_cours');
        const parClient = {};
        enCours.forEach(a => {
            const c = etat.clients.find(x => x.id === a.clientId);
            const nom = c ? c.name : 'Client inconnu';
            (parClient[nom] = parClient[nom] || []).push(a);
        });
        $('#qaListe').innerHTML = enCours.length
            ? Object.keys(parClient).sort((x, y) => x.localeCompare(y)).map(nomClient => {
                const liste = parClient[nomClient].slice()
                    .sort((x, y) => (x.name || '').localeCompare(y.name || ''));
                const totClient = liste.reduce((s, a) => s + heuresAffaire(a.id), 0);
                return '<div class="bande-client"><h3>' + esc(nomClient) + '</h3>'
                    + '<div class="rule"></div>'
                    + '<span class="tot-client">' + h1(totClient) + ' h</span></div>'
                    + '<div class="qa">' + liste.map(a =>
                        '<button class="qa-btn" data-qa="' + attr(a.id) + '">'
                        + '<span class="qa-nom">' + esc(a.name) + '</span>'
                        + (a.description
                            ? '<span class="qa-desc">' + esc(a.description) + '</span>' : '')
                        + '<span class="qa-h">' + h1(heuresAffaire(a.id)) + ' h pointées</span>'
                        + '</button>').join('') + '</div>';
            }).join('')
            : '<p style="color:var(--ink-dim);">Aucune affaire en cours.</p>';

        $$('#qaListe [data-qa]').forEach(b => b.addEventListener('click', () =>
            ouvrirSaisie({ affaireId: b.dataset.qa })));

        const admin = estAdmin();
        $('#titreSaisies').textContent = admin ? 'Saisies du jour' : 'Mes saisies du jour';
        const aujourdHui = new Date().toISOString().split('T')[0];
        const duJour = etat.entries.filter(e =>
            String(e.date).startsWith(aujourdHui)
            && (admin || e.enteredBy === etat.moi.name));
        const total = duJour.reduce((s, e) => s + (parseFloat(e.hours) || 0), 0);
        $('#totJour').textContent = h1(total) + ' h';

        $('#listeSaisies').innerHTML = duJour.length ? duJour.slice().reverse().map(e => {
            const a = etat.affaires.find(x => x.id === e.affaireId);
            const p = etat.postes.find(x => x.id === e.posteId);
            const heure = new Date(e.date).toLocaleTimeString('fr-FR',
                { hour: '2-digit', minute: '2-digit' });
            const mienne = admin || e.enteredBy === etat.moi.name;
            return '<div class="saisie"><div class="saisie-info">'
                + '<div class="saisie-l1">' + esc(a ? a.name : 'Affaire inconnue') + '</div>'
                + '<div class="saisie-l2">' + heure + ' · ' + esc(p ? p.name : 'Poste inconnu')
                + (admin && e.enteredBy ? ' · ' + esc(e.enteredBy) : '') + '</div></div>'
                + '<span class="saisie-h">' + h1(parseFloat(e.hours) || 0) + ' h</span>'
                + (mienne ? '<div class="saisie-acts">'
                    + '<button class="btn btn-sm" data-modif-saisie="' + attr(e.id) + '">Modifier</button>'
                    + '<button class="btn btn-sm btn-danger" data-suppr-saisie="' + attr(e.id) + '">✕</button>'
                    + '</div>' : '')
                + '</div>';
        }).join('') : '<p style="color:var(--ink-dim);">Aucune saisie aujourd\'hui.</p>';

        $$('#listeSaisies [data-modif-saisie]').forEach(b => b.addEventListener('click', () => {
            const e = etat.entries.find(x => x.id === b.dataset.modifSaisie);
            if (e) ouvrirSaisie({ edition: e });
        }));
        $$('#listeSaisies [data-suppr-saisie]').forEach(b => b.addEventListener('click', async () => {
            if (!confirm('Supprimer cette saisie ?')) return;
            try {
                await api('/entries/' + b.dataset.supprSaisie, 'DELETE');
                await chargerTout();
                rendrePointage();
                toast('Saisie supprimée');
            } catch (err) { toast(err.message, true); }
        }));

        rendreHistorique();
    }

    /* ── historique : toutes les saisies des affaires en cours,
          groupées par affaire, comme l'interface historique ── */
    function rendreHistorique() {
        const conteneur = $('#listeHistorique');
        if (!conteneur) return;
        const admin = estAdmin();

        const groupes = {};
        etat.entries.forEach(e => {
            const a = etat.affaires.find(x => x.id === e.affaireId);
            if (!a) return;
            const st = stadeDe(a);
            if (st === 'terminee' || st === 'archivee') return;
            if (!admin && e.enteredBy && e.enteredBy !== etat.moi.name) return;
            (groupes[e.affaireId] = groupes[e.affaireId] || []).push(e);
        });

        const cles = Object.keys(groupes);
        $('#titreHistorique').textContent = admin ? 'Historique' : 'Mon historique';
        if (!cles.length) {
            conteneur.innerHTML = '<p style="color:var(--ink-dim);">Aucune saisie sur les affaires en cours.</p>';
            return;
        }

        conteneur.innerHTML = cles.map(k => {
            const a = etat.affaires.find(x => x.id === k);
            const c = etat.clients.find(x => x.id === a.clientId);
            const liste = groupes[k].slice().sort((x, y) => String(y.date).localeCompare(String(x.date)));
            const total = liste.reduce((s, e) => s + (parseFloat(e.hours) || 0), 0);

            const parPoste = {};
            liste.forEach(e => {
                const p = etat.postes.find(x => x.id === e.posteId);
                const nom = p ? p.name : 'Poste inconnu';
                parPoste[nom] = (parPoste[nom] || 0) + (parseFloat(e.hours) || 0);
            });

            return '<div class="hist">'
                + '<div class="hist-tete">'
                + '<span class="hist-client">' + esc(c ? c.name : '') + '</span>'
                + '<span class="hist-nom">' + esc(a.name) + '</span>'
                + (a.description ? '<span class="hist-desc">' + esc(a.description) + '</span>' : '')
                + '<span class="hist-total">' + h1(total) + ' h</span></div>'
                + '<div class="chips">' + Object.keys(parPoste).map(n =>
                    '<span class="chip">' + esc(n) + ' · ' + h1(parPoste[n]) + ' h</span>').join('') + '</div>'
                + liste.map(e => {
                    const p = etat.postes.find(x => x.id === e.posteId);
                    const quand = new Date(e.date).toLocaleDateString('fr-FR',
                        { day: '2-digit', month: '2-digit', year: 'numeric' });
                    const mienne = admin || e.enteredBy === etat.moi.name;
                    return '<div class="saisie"><div class="saisie-info">'
                        + '<div class="saisie-l1" style="font-size:13.5px;">'
                        + esc(p ? p.name : 'Poste inconnu') + '</div>'
                        + '<div class="saisie-l2">' + quand
                        + (admin && e.enteredBy ? ' · ' + esc(e.enteredBy) : '') + '</div></div>'
                        + '<span class="saisie-h">' + h1(parseFloat(e.hours) || 0) + ' h</span>'
                        + (mienne ? '<div class="saisie-acts">'
                            + '<button class="btn btn-sm" data-h-modif="' + attr(e.id) + '">Modifier</button>'
                            + '<button class="btn btn-sm btn-danger" data-h-suppr="' + attr(e.id) + '">✕</button>'
                            + '</div>' : '')
                        + '</div>';
                }).join('')
                + '</div>';
        }).join('');

        $$('#listeHistorique [data-h-modif]').forEach(b => b.addEventListener('click', () => {
            const e = etat.entries.find(x => x.id === b.dataset.hModif);
            if (e) ouvrirSaisie({ edition: e });
        }));
        $$('#listeHistorique [data-h-suppr]').forEach(b => b.addEventListener('click', async () => {
            if (!confirm('Supprimer cette saisie ?')) return;
            try {
                await api('/entries/' + b.dataset.hSuppr, 'DELETE');
                await chargerTout();
                rendrePointage();
                toast('Saisie supprimée');
            } catch (err) { toast(err.message, true); }
        }));
    }

    /* ── modale de saisie ── */
    let saisieEdition = null;
    function ouvrirSaisie(opts) {
        opts = opts || {};
        saisieEdition = opts.edition || null;

        $('#titreSaisie').textContent = saisieEdition ? 'Modifier la saisie' : 'Nouvelle saisie';
        $('#btnEnregistrerSaisie').textContent = saisieEdition ? 'Mettre à jour' : 'Ajouter';

        const sc = $('#sClient');
        sc.innerHTML = '<option value="">Sélectionner un client</option>'
            + etat.clients.map(c => '<option value="' + attr(c.id) + '">' + esc(c.name) + '</option>').join('');
        const sp = $('#sPoste');
        sp.innerHTML = '<option value="">Sélectionner un poste</option>'
            + etat.postes.map(p => '<option value="' + attr(p.id) + '">' + esc(p.name)
                + (p.isMachine ? ' — Machine' : '') + '</option>').join('');

        let affaireInit = null;
        if (saisieEdition) affaireInit = etat.affaires.find(a => a.id === saisieEdition.affaireId);
        else if (opts.affaireId) affaireInit = etat.affaires.find(a => a.id === opts.affaireId);

        sc.value = affaireInit ? (affaireInit.clientId || '') : '';
        majSelectAffaires();
        if (affaireInit) $('#sAffaire').value = affaireInit.id;
        basculeNouvelleAffaire();
        sp.value = saisieEdition ? (saisieEdition.posteId || '') : '';
        $('#sHeures').value = saisieEdition ? saisieEdition.hours : '';
        $('#sNaNom').value = '';
        $('#sNaDesc').value = '';
        ouvrir('scrimSaisie');
    }

    function majSelectAffaires() {
        const cid = $('#sClient').value;
        const sa = $('#sAffaire');
        if (!cid) {
            sa.innerHTML = '<option value="">Sélectionner d\'abord un client</option>';
            sa.disabled = true;
            basculeNouvelleAffaire();
            return;
        }
        sa.disabled = false;
        const liste = etat.affaires.filter(a => a.clientId === cid && stadeDe(a) === 'en_cours');
        let html = '<option value="">Sélectionner une affaire</option>';
        if (!estAdmin()) html += '<option value="__new__">➕ Nouvelle affaire de soudure</option>';
        html += liste.map(a => '<option value="' + attr(a.id) + '">' + esc(a.name)
            + (a.description ? ' — ' + esc(String(a.description).slice(0, 40)) : '') + '</option>').join('');
        sa.innerHTML = html;
        basculeNouvelleAffaire();
    }
    function basculeNouvelleAffaire() {
        const nouvelle = $('#sAffaire').value === '__new__';
        $('#sNouvelleAffaire').classList.toggle('hidden', !nouvelle);
        $('#champPoste').classList.toggle('hidden', nouvelle);
    }
    $('#sClient').addEventListener('change', majSelectAffaires);
    $('#sAffaire').addEventListener('change', basculeNouvelleAffaire);
    $('#fab').addEventListener('click', () => ouvrirSaisie());

    $('#btnEnregistrerSaisie').addEventListener('click', async () => {
        const btn = $('#btnEnregistrerSaisie');
        btn.disabled = true;
        try {
            let affaireId = $('#sAffaire').value;
            let posteId = $('#sPoste').value;
            const heures = parseFloat($('#sHeures').value);

            if (affaireId === '__new__') {
                const nom = $('#sNaNom').value.trim();
                if (!nom) { toast('Donnez un nom à la nouvelle affaire', true); return; }
                const na = await api('/affaires', 'POST', {
                    name: nom, clientId: $('#sClient').value,
                    description: $('#sNaDesc').value.trim(), statut: 'en_cours'
                });
                affaireId = na.id;
                let soudure = etat.postes.find(p => p.name.toLowerCase() === 'soudure');
                if (!soudure) {
                    soudure = await api('/postes', 'POST', { name: 'Soudure' });
                }
                posteId = soudure.id;
            }

            if (!affaireId) { toast('Choisissez une affaire', true); return; }
            if (!posteId) { toast('Choisissez un poste', true); return; }
            if (!heures || heures <= 0) { toast('Indiquez les heures', true); return; }

            if (saisieEdition) {
                await api('/entries/' + saisieEdition.id, 'PUT',
                    { affaireId: affaireId, posteId: posteId, hours: heures });
            } else {
                await api('/entries', 'POST', {
                    affaireId: affaireId, posteId: posteId,
                    hours: heures, enteredBy: etat.moi.name
                });
            }
            fermer('scrimSaisie');
            await chargerTout();
            rendrePointage();
            toast(saisieEdition ? 'Saisie mise à jour' : 'Saisie ajoutée');
        } catch (err) {
            toast(err.message, true);
        } finally {
            btn.disabled = false;
        }
    });

    /* ═══════════════ AFFAIRES : couloir + cartes ═══════════════ */
    function rendreCouloir() {
        $('#couloir').innerHTML = STADES.map(s => {
            const n = etat.affaires.filter(a => stadeDe(a) === s.k).length;
            return '<button class="couloir-etape c-' + s.k + (etat.filtre === s.k ? ' is-on' : '')
                + '" data-stade="' + s.k + '">'
                + '<div class="couloir-n">' + n + '</div>'
                + '<div class="couloir-lab">' + s.lab + '</div></button>';
        }).join('');
        $$('#couloir [data-stade]').forEach(b => b.addEventListener('click', () => {
            etat.filtre = etat.filtre === b.dataset.stade ? null : b.dataset.stade;
            rendreListeAffaires();
        }));
    }

    function carteAffaire(a) {
        const stade = stadeDe(a);
        const d = etat.devis[a.id];
        const bud = budgetDevis(d);
        const reel = heuresAffaire(a.id);
        const c = etat.clients.find(x => x.id === a.clientId);
        let bas;
        if (!d) {
            bas = '<div class="carte-chiffres"><span>pointé <b>' + h1(reel) + ' h</b></span>'
                + '<span class="e neutre">' + eur(montantRegieAffaire(a)) + ' au temps passé</span></div>';
        } else if (stade === 'brouillon' || stade === 'envoye') {
            const m = montantsDevis(d);
            const prix = (m.heures + m.achats) * (parseFloat(d.coeffMarge) || 1.2);
            bas = '<div class="carte-chiffres"><span>devis <b>' + h1(bud) + ' h</b></span>'
                + '<span class="e neutre">' + eur(prix) + '</span></div>'
                + '<div class="carte-note">'
                + (stade === 'brouillon' ? 'chiffrage en cours'
                    : (d.reponseClient && d.reponseClient.action === 'refuse'
                        ? 'refusé par le client' : 'en attente de réponse client'))
                + '</div>';
        } else if (bud === 0 && montantsDevis(d).achats === 0) {
            // devis present mais encore vide : l'affaire se vend au temps
            // passé — le PV estimé remplace une barre 100 % rouge trompeuse
            bas = '<div class="carte-chiffres"><span>pointé <b>' + h1(reel) + ' h</b></span>'
                + '<span class="e neutre">' + eur(montantRegieAffaire(a)) + ' au temps passé</span></div>';
        } else {
            const e = reel - bud, cc = cls(e);
            const ech = Math.max(bud, reel) || 1;
            bas = '<div class="carte-chiffres">'
                + '<span>devis <b>' + h1(bud) + ' h</b></span>'
                + '<span>pointé <b>' + h1(reel) + ' h</b></span>'
                + '<span class="e ' + cc + '">' + sgn(e, h1) + ' h</span></div>'
                + '<div class="mini"><div class="fill ' + cc + '" style="width:'
                + Math.round(reel / ech * 100) + '%"></div>'
                + (bud > 0 ? '<div class="cible" style="left:' + Math.round(bud / ech * 100) + '%"></div>' : '')
                + '</div>'
                + (a.venteTemps ? '<div class="carte-note">vendue au temps passé — '
                    + eur(montantRegieAffaire(a)) + '</div>' : '');
        }
        return '<button class="carte" data-fiche="' + attr(a.id) + '">'
            + '<div class="carte-haut"><div style="min-width:0;">'
            + '<div class="carte-client">' + esc(c ? c.name : '') + '</div>'
            + '<div class="carte-nom">' + esc(a.name) + '</div>'
            + (a.description ? '<div class="carte-desc">' + esc(a.description) + '</div>' : '')
            + '</div><span class="stade ' + stade + '">' + NOMS_STADE[stade] + '</span></div>'
            + '<div class="carte-bas">' + bas + '</div></button>';
    }

    function rendreListeAffaires() {
        rendreCouloir();
        $('#badgeAffaires').textContent = etat.affaires.length;

        const stades = etat.filtre ? STADES.filter(s => s.k === etat.filtre) : STADES;
        let html = stades.map(s => {
            const liste = etat.affaires.filter(a => stadeDe(a) === s.k && correspondRecherche(a));
            if (!liste.length) return '';
            // à l'intérieur du stade : groupé par client, comme avant
            const parClient = {};
            liste.forEach(a => {
                const c = etat.clients.find(x => x.id === a.clientId);
                const nom = c ? c.name : 'Sans client';
                (parClient[nom] = parClient[nom] || []).push(a);
            });
            return '<div class="groupe-stade">'
                + '<div class="section-lab-ligne">'
                + '<span class="eyebrow section-lab">' + s.lab + ' · ' + liste.length + '</span>'
                + (s.k === 'terminee'
                    ? '<button class="btn btn-sm" data-tout-archiver>Tout archiver</button>' : '')
                + '</div>'
                + Object.keys(parClient).sort((x, y) => x.localeCompare(y)).map(nomClient => {
                    const arr = parClient[nomClient].slice()
                        .sort((x, y) => (x.name || '').localeCompare(y.name || ''));
                    return '<div class="bande-client"><h3>' + esc(nomClient) + '</h3>'
                        + '<div class="rule"></div>'
                        + '<span class="compte">' + arr.length + '</span></div>'
                        + '<div class="grille">' + arr.map(carteAffaire).join('') + '</div>';
                }).join('')
                + '</div>';
        }).join('');

        const archivees = etat.affaires.filter(a => stadeDe(a) === 'archivee' && correspondRecherche(a));
        if (!etat.filtre && archivees.length) {
            html += '<div class="repli-archivees">'
                + '<button class="btn btn-sm" id="btnArchivees">Archivées (' + archivees.length + ')</button>'
                + '<div class="grille hidden" id="grilleArchivees" style="margin-top:12px;">'
                + archivees.map(carteAffaire).join('') + '</div></div>';
        }

        $('#listeAffaires').innerHTML = html
            || '<p style="color:var(--ink-dim);text-align:center;padding:36px;">Aucune affaire</p>';

        const ba = $('#btnArchivees');
        if (ba) ba.addEventListener('click', () =>
            $('#grilleArchivees').classList.toggle('hidden'));

        const bt = document.querySelector('#listeAffaires [data-tout-archiver]');
        if (bt) bt.addEventListener('click', async () => {
            const n = etat.affaires.filter(a => stadeDe(a) === 'terminee').length;
            if (!confirm('Archiver les ' + n + ' affaires terminées ? '
                + 'Elles resteront consultables dans les archivées.')) return;
            try {
                const r = await api('/affaires/archiver-terminees', 'POST', {});
                await chargerTout();
                rendreListeAffaires();
                toast(r.archivees + ' affaire' + (r.archivees > 1 ? 's' : '')
                    + ' archivée' + (r.archivees > 1 ? 's' : ''));
            } catch (err) { toast(err.message, true); }
        });

        $$('#listeAffaires [data-fiche]').forEach(cbtn => cbtn.addEventListener('click', () => {
            etat.ficheId = cbtn.dataset.fiche;
            animerOuvertureDepuis(cbtn);
            ouvrirFiche();
        }));
    }

    /* ── nouvelle affaire (démarre en brouillon de devis) ── */
    function ouvrirModalAffaire(affaire) {
        etat.editionAffaireId = affaire ? affaire.id : null;
        $('#titreModalAffaire').textContent = affaire ? 'Modifier l\'affaire' : 'Nouvelle affaire';
        $('#btnCreerAffaire').textContent = affaire ? 'Enregistrer' : 'Créer le brouillon';
        $('#naClient').innerHTML = '<option value="">Sélectionner un client</option>'
            + etat.clients.map(c => '<option value="' + attr(c.id) + '">' + esc(c.name) + '</option>').join('');
        $('#naClient').value = affaire ? (affaire.clientId || '') : '';
        $('#naNom').value = affaire ? affaire.name : '';
        $('#naDesc').value = affaire ? (affaire.description || '') : '';
        ouvrir('scrimAffaire');
    }
    $('#btnNouvelle').addEventListener('click', () => ouvrirModalAffaire(null));

    function devisVierge(affaire, heuresParPoste) {
        heuresParPoste = heuresParPoste || {};
        const client = etat.clients.find(c => c.id === affaire.clientId);
        return {
            client: client ? client.name : '',
            numCommande: '',
            affaire: affaire.name,
            date: new Date().toISOString().split('T')[0],
            coeffMarge: 1.2,
            data: {
                travail: etat.postes.filter(p => !p.isMachine).map(p => ({
                    nom: p.name, taux: p.tauxHoraire || 75,
                    semaines: [heuresParPoste[p.name] || 0, 0, 0, 0, 0, 0, 0, 0]
                })),
                machine: etat.postes.filter(p => p.isMachine).map(p => ({
                    nom: p.name, taux: p.tauxHoraire || 46,
                    temps: heuresParPoste[p.name] || 0
                })),
                achats: (etat.achatsBib.length ? etat.achatsBib : [
                    'Carcasse', 'Éléments carcasse', 'Matière première', 'Traitement thermique',
                    'Bloc chaud', 'Sous-traitance', 'Transport'
                ]).map(n => ({ nom: n, fournisseur: '', quantite: 1, prixUnit: 0 }))
            },
            noteClient: '', delai: '', reglement: 'virement_45j', echeances: []
        };
    }

    $('#btnCreerAffaire').addEventListener('click', async () => {
        const nom = $('#naNom').value.trim();
        const clientId = $('#naClient').value;
        if (!clientId) { toast('Sélectionnez un client', true); return; }
        if (!nom) { toast('Donnez un nom à l\'affaire', true); return; }
        try {
            if (etat.editionAffaireId) {
                await api('/affaires/' + etat.editionAffaireId, 'PUT', {
                    name: nom, clientId: clientId, description: $('#naDesc').value.trim()
                });
                fermer('scrimAffaire');
                await chargerTout();
                if (etat.vue === 'fiche') await ouvrirFiche(); else rendreListeAffaires();
                toast('Affaire modifiée');
                return;
            }
            const a = await api('/affaires', 'POST', {
                name: nom, clientId: clientId,
                description: $('#naDesc').value.trim(), statut: 'brouillon'
            });
            await api('/devis/' + a.id, 'PUT', devisVierge(a));
            fermer('scrimAffaire');
            await chargerTout();
            etat.ficheId = a.id;
            ouvrirFiche();
            toast('Affaire créée — chiffrez son devis');
        } catch (err) { toast(err.message, true); }
    });

    /* ═══════════════ FICHE AFFAIRE ═══════════════ */

    // Ouverture animée : un fantôme de la carte cliquée (nom + client)
    // s'étend jusqu'à la zone de contenu pendant que la fiche se charge,
    // puis s'efface ; les blocs de la fiche arrivent ensuite en cascade.
    function animerOuvertureDepuis(carte) {
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const zoneEl = document.querySelector('.views');
        if (!zoneEl || !carte.getBoundingClientRect) return;
        const r = carte.getBoundingClientRect();
        const zone = zoneEl.getBoundingClientRect();
        const ghost = document.createElement('div');
        ghost.className = 'carte-fantome';
        const nom = carte.querySelector('.carte-nom');
        const cli = carte.querySelector('.carte-client');
        ghost.innerHTML = (cli ? '<div class="fantome-client">' + cli.innerHTML + '</div>' : '')
            + (nom ? '<div class="fantome-nom">' + nom.innerHTML + '</div>' : '');
        ghost.style.left = r.left + 'px';
        ghost.style.top = r.top + 'px';
        ghost.style.width = r.width + 'px';
        ghost.style.height = r.height + 'px';
        document.body.appendChild(ghost);
        carte.classList.add('part');
        requestAnimationFrame(() => requestAnimationFrame(() => {
            ghost.style.left = zone.left + 'px';
            ghost.style.top = Math.max(zone.top, 60) + 'px';
            ghost.style.width = zone.width + 'px';
            ghost.style.height = Math.min(window.innerHeight - Math.max(zone.top, 60) - 16, 430) + 'px';
            ghost.style.opacity = '0';
        }));
        setTimeout(() => ghost.remove(), 620);
    }

    async function ouvrirFiche() {
        aller('fiche');
        $('#ficheContenu').innerHTML =
            '<p style="color:var(--ink-dim);padding:30px 0;">Chargement...</p>';
        try {
            const [synthese, devis] = await Promise.all([
                api('/affaires/' + etat.ficheId + '/synthese?_t=' + Date.now()),
                api('/devis/' + etat.ficheId + '?_t=' + Date.now()).catch(err => {
                    if (err.status === 404) return null;
                    throw err;
                })
            ]);
            etat.syntheseLocale = synthese;
            etat.devisLocal = devis;
            rendreFiche();
            const fc = $('#ficheContenu');
            fc.classList.add('entree');
            setTimeout(() => fc.classList.remove('entree'), 750);
        } catch (err) {
            $('#ficheContenu').innerHTML =
                '<p style="color:var(--stop);">' + esc(err.message) + '</p>';
        }
    }

    // Le budget est modifiable en brouillon, ou tant que le devis n'a jamais
    // été envoyé au client (pas de token). Envoyé ou accepté = verrouillé.
    function budgetModifiable(a, d) {
        if (!d) return false;
        const stade = stadeDe(a);
        if (stade === 'brouillon') return true;
        return !d.token && stade === 'en_cours';
    }

    function actionsCycle(a, d) {
        switch (stadeDe(a)) {
            case 'brouillon':
                // deux sorties : le client accepte par son lien, ou
                // l'admin valide lui-meme et lance l'affaire
                return '<button class="btn btn-arc btn-sm" data-cycle="envoye">Envoyer au client</button>'
                    + '<button class="btn btn-ok btn-sm" data-cycle="en_cours">Valider moi-même</button>';
            case 'envoye':
                return '<button class="btn btn-sm" data-cycle="brouillon">Repasser en brouillon</button>'
                    + '<button class="btn btn-sm" data-voir-lien>Voir le lien client</button>'
                    + '<button class="btn btn-ok btn-sm" data-cycle="en_cours">Le client a accepté</button>';
            case 'en_cours':
                return (d && d.token
                        ? '<button class="btn btn-sm" data-voir-lien>Voir le lien client</button>' : '')
                    + '<button class="btn btn-sm" data-cycle="terminee">Terminer l\'affaire</button>';
            case 'terminee':
                return '<button class="btn btn-sm" data-cycle="en_cours">Réactiver</button>'
                    + '<button class="btn btn-sm" data-cycle="archivee">Archiver</button>';
            default:
                return '<button class="btn btn-sm" data-cycle="en_cours">Réactiver</button>';
        }
    }

    function rendreFiche() {
        const a = etat.affaires.find(x => x.id === etat.ficheId);
        if (!a) { aller('affaires'); rendreListeAffaires(); return; }
        const d = etat.devisLocal;
        const s = etat.syntheseLocale;
        const stade = stadeDe(a);
        const client = etat.clients.find(x => x.id === a.clientId);
        const modifiable = budgetModifiable(a, d);
        const rang = PAS.indexOf(stade);
        // Au chiffrage, rien à comparer : personne ne pointe sur un
        // brouillon. La comparaison arrive avec le stade "en cours".
        const enChiffrage = !!d && (stade === 'brouillon' || stade === 'envoye');

        const bud = s.totaux.budgetHeures;
        const reel = s.totaux.reelHeures;
        const ecart = reel - bud, cEcart = cls(ecart);
        // Devis absent OU encore vide (aucune heure budgétée, aucun achat) :
        // hors chiffrage, l'affaire se vend au temps passé — l'admin voit
        // le prix de vente HT des heures pointées, marge comprise.
        const mTot = montantsDevis(d);
        const enRegie = !enChiffrage && (!d || (bud === 0 && mTot.achats === 0));

        /* ── lignes : celles du devis + le pointé hors devis ── */
        const reelParNom = {};
        s.postes.forEach(p => { reelParNom[p.nom] = p; });
        let lignes = '';
        if (d && !enRegie) {
            const rendreLigne = (ligne, type, i) => {
                const lid = type + i;
                const b = type === 't'
                    ? (ligne.semaines || []).reduce((x, y) => x + (parseFloat(y) || 0), 0)
                    : (parseFloat(ligne.temps) || 0);
                const r = reelParNom[ligne.nom] ? reelParNom[ligne.nom].reelHeures : 0;
                const e = r - b, cc = cls(e);
                const ech = Math.max(b, r) || 1;
                const celluleBudget = '<td class="bud">' + (modifiable
                    ? '<input type="number" min="0" step="0.5" value="' + (b || '')
                      + '" placeholder="0" data-bud="' + type + i + '" aria-label="Budget ' + attr(ligne.nom) + '">'
                    : '<span class="fixe">' + h1(b) + '</span>') + '</td>';
                if (enChiffrage) {
                    // pur chiffrage : budget, taux modifiable, montant
                    return '<tr><td class="nom">' + esc(ligne.nom)
                        + (type === 'm' ? '<span class="mach">MACHINE</span>' : '') + '</td>'
                        + celluleBudget
                        + '<td class="taux">' + (modifiable
                            ? '<input type="number" min="0" step="1" value="' + (parseFloat(ligne.taux) || 0)
                              + '" data-ftaux="' + lid + '" aria-label="Taux ' + attr(ligne.nom) + '">'
                            : '<span style="font-family:var(--f-data);">' + (parseFloat(ligne.taux) || 0) + '</span>')
                        + '</td>'
                        + '<td class="eur" data-feur="' + lid + '">'
                        +   eur(b * (parseFloat(ligne.taux) || 0)) + '</td></tr>';
                }
                return '<tr><td class="nom">' + esc(ligne.nom)
                    + (type === 'm' ? '<span class="mach">MACHINE</span>' : '') + '</td>'
                    + celluleBudget
                    + '<td class="reel">' + h1(r) + '</td>'
                    + '<td class="ec ' + cc + '" data-fec="' + lid + '">'
                    +   ((b === 0 && r === 0) ? '—' : sgn(e, h1)) + '</td>'
                    + '<td class="conso"><div class="mini">'
                    + '<div class="fill ' + cc + '" data-ffill="' + lid
                    +   '" style="width:' + Math.round(r / ech * 100) + '%"></div>'
                    + '<div class="cible" data-fcible="' + lid + '" style="left:'
                    +   Math.round(b / ech * 100) + '%;' + (b > 0 ? '' : 'display:none;') + '"></div>'
                    + '</div></td>'
                    + '<td class="eur" data-feur="' + lid + '">'
                    +   eur(b * (parseFloat(ligne.taux) || 0)) + '</td></tr>';
            };
            // Ordre d'affichage = ordre actuel de la bibliothèque des postes
            // (réordonnable en Gestion). Les index d'origine restent attachés
            // aux lignes pour que la saisie du budget vise la bonne entrée.
            const ordreDe = {};
            etat.postes.forEach((p, k) => { ordreDe[p.name] = k; });
            const lignesTriees = (d.data.travail || []).map((l, i) => ({ l: l, t: 't', i: i }))
                .concat((d.data.machine || []).map((l, i) => ({ l: l, t: 'm', i: i })));
            lignesTriees.sort((x, y) =>
                (ordreDe[x.l.nom] !== undefined ? ordreDe[x.l.nom] : 999)
                - (ordreDe[y.l.nom] !== undefined ? ordreDe[y.l.nom] : 999));
            lignes += lignesTriees.map(x => rendreLigne(x.l, x.t, x.i)).join('');
            // pointé sur des postes absents du devis
            const nomsDevis = (d.data.travail || []).map(l => l.nom)
                .concat((d.data.machine || []).map(l => l.nom));
            s.postes.filter(p => nomsDevis.indexOf(p.nom) === -1 && p.reelHeures > 0)
                .forEach(p => {
                    lignes += '<tr><td class="nom">' + esc(p.nom) + '<span class="hors">HORS DEVIS</span></td>'
                        + '<td class="bud"><span class="vide">—</span></td>'
                        + '<td class="reel">' + h1(p.reelHeures) + '</td>'
                        + '<td class="ec depasse">' + sgn(p.reelHeures, h1) + '</td>'
                        + '<td class="conso"><div class="mini"><div class="fill depasse" style="width:100%"></div></div></td>'
                        + '<td class="eur">' + eur(p.reelMontant) + '</td></tr>';
                });
        } else {
            lignes = s.postes.filter(p => p.reelHeures > 0).map(p =>
                '<tr><td class="nom">' + esc(p.nom) + '</td>'
                + '<td class="bud"><span class="vide">—</span></td>'
                + '<td class="reel">' + h1(p.reelHeures) + '</td>'
                + '<td class="ec neutre">—</td>'
                + '<td class="conso"><div class="mini"><div class="fill neutre" style="width:100%"></div></div></td>'
                + '<td class="eur">' + eur(p.reelMontant) + '</td></tr>').join('')
                || '<tr><td colspan="6" style="color:var(--ink-dim);">Aucune heure pointée.</td></tr>';
        }

        const m = d ? montantsDevis(d) : { heures: 0, achats: 0 };
        const coeff = d ? (parseFloat(d.coeffMarge) || 1.2) : 1.2;
        const cout = m.heures + m.achats;
        const prix = cout * coeff;

        /* ── achats ── */
        let achatsHtml = '';
        if (d) {
            achatsHtml = '<div class="bloc"><div class="titre"><h2>Achats &amp; fournitures</h2>'
                + '<span class="tot" id="fTotAchats">' + eur(m.achats) + '</span></div>'
                + '<div class="tbl"><table><thead><tr>'
                + '<th>Désignation</th><th>Fournisseur</th>'
                + '<th class="c">Quantité</th><th class="c">Prix unitaire</th><th class="c">Montant</th>'
                + (modifiable ? '<th></th>' : '')
                + '</tr></thead><tbody>'
                + (d.data.achats || []).map((ac, i) => {
                    const mt = (parseFloat(ac.quantite) || 0) * (parseFloat(ac.prixUnit) || 0);
                    if (!modifiable) {
                        return '<tr><td class="nom" style="font-size:14px;">' + esc(ac.nom) + '</td>'
                            + '<td style="color:var(--ink-mid);">' + esc(ac.fournisseur || '—') + '</td>'
                            + '<td class="eur">' + (parseFloat(ac.quantite) || 0) + '</td>'
                            + '<td class="eur">' + eur(parseFloat(ac.prixUnit) || 0) + '</td>'
                            + '<td class="eur" style="color:var(--ink);">' + eur(mt) + '</td></tr>';
                    }
                    return '<tr>'
                        + '<td class="txt"><input type="text" value="' + attr(ac.nom)
                        + '" data-achat="nom" data-i="' + i + '"></td>'
                        + '<td class="txt"><input type="text" list="dlFournisseurs" value="' + attr(ac.fournisseur || '')
                        + '" placeholder="Fournisseur" data-achat="fournisseur" data-i="' + i + '"></td>'
                        + '<td class="qte"><input type="number" min="0" step="1" value="'
                        + (parseFloat(ac.quantite) || '') + '" placeholder="0" data-achat="quantite" data-i="' + i + '"></td>'
                        + '<td class="qte"><input type="number" min="0" step="0.01" value="'
                        + (parseFloat(ac.prixUnit) || '') + '" placeholder="0" data-achat="prixUnit" data-i="' + i + '"></td>'
                        + '<td class="eur" style="color:var(--ink);" data-faeur="' + i + '">' + eur(mt) + '</td>'
                        + '<td style="text-align:right;"><button class="btn btn-sm btn-danger" '
                        + 'data-suppr-achat="' + i + '">✕</button></td></tr>';
                }).join('')
                + '</tbody></table></div>'
                + (modifiable
                    ? '<div style="margin-top:11px;"><button class="btn btn-sm" data-ajout-achat>'
                      + 'Ajouter une ligne d\'achat</button></div>' : '')
                + '<datalist id="dlFournisseurs">'
                + etat.fournisseursBib.map(f => '<option value="' + attr(f) + '"></option>').join('')
                + '</datalist>'
                + '</div>';
        }

        /* ── conditions + note client (brouillon) ── */
        let conditionsHtml = '';
        if (d && modifiable) {
            const echeances = d.echeances && d.echeances.length ? d.echeances
                : [{ label: 'Acompte à la commande', pourcent: 30, date: '' },
                   { label: 'Solde à livraison', pourcent: 70, date: '' }];
            const totalPct = echeances.reduce((x, e2) => x + (parseFloat(e2.pourcent) || 0), 0);
            conditionsHtml = '<div class="note-client">'
                + '<label>Description sur le devis client</label>'
                + '<input type="text" value="' + attr(d.noteClient || '')
                + '" placeholder="Ex : Conception et réalisation — reprise 4 empreintes" data-devis="noteClient">'
                + '<div class="conds-devis">'
                + '<div class="cd"><label>Délai</label><input type="text" value="' + attr(d.delai || '')
                + '" placeholder="Ex : 6 semaines" data-devis="delai"></div>'
                + '<div class="cd"><label>Règlement</label><select data-devis="reglement">'
                + Object.keys(REGLEMENTS).map(k => '<option value="' + k + '"'
                    + (k === (d.reglement || 'virement_45j') ? ' selected' : '') + '>'
                    + REGLEMENTS[k] + '</option>').join('')
                + '</select></div>'
                + '<div class="cd" style="grid-column:1 / -1;"><label>Interlocuteur</label>'
                + '<select data-devis="interlocuteurId">'
                + '<option value="">—</option>'
                + ((client && client.contacts) || []).map(ct =>
                    '<option value="' + attr(ct.id) + '"'
                    + (String(d.interlocuteurId || '') === String(ct.id) ? ' selected' : '') + '>'
                    + esc(ct.nom) + (ct.fonction ? ' — ' + esc(ct.fonction) : '') + '</option>').join('')
                + '</select></div></div>'
                + '<div class="echeancier' + ((d.reglement === 'personnalise') ? '' : ' hidden')
                + '" id="blocEcheancier">'
                + echeances.map((e2, i) =>
                    '<div class="ech-ligne">'
                    + '<input type="text" value="' + attr(e2.label || '') + '" placeholder="Ex : Acompte à la commande" data-e="label" data-i="' + i + '">'
                    + '<input type="number" min="1" max="100" value="' + (e2.pourcent || '') + '" placeholder="%" data-e="pct" data-i="' + i + '">'
                    + '<input type="date" value="' + attr(e2.date || '') + '" data-e="date" data-i="' + i + '">'
                    + '<button class="btn btn-sm btn-danger" data-suppr-ech="' + i + '">✕</button>'
                    + '</div>').join('')
                + '<div style="margin-top:7px;"><button class="btn btn-sm" data-ajout-ech>Ajouter une échéance</button></div>'
                + '<div class="ech-total' + (totalPct === 100 ? '' : ' mauvais') + '">Total : '
                + totalPct + ' % ' + (totalPct === 100 ? '' : '(devrait faire 100 %)') + '</div>'
                + '</div></div>';
        } else if (d && (d.delai || d.reglement)) {
            conditionsHtml = '';
        }

        /* ── réponse du client ── */
        let reponseHtml = '';
        if (d && d.reponseClient) {
            const r = d.reponseClient;
            const quand = new Date(r.date).toLocaleString('fr-FR',
                { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
            reponseHtml = r.action === 'accepte'
                ? '<div class="reponse-client acceptee">✓ <span>Le client a <b>accepté</b> ce devis le '
                  + quand + '.</span></div>'
                : '<div class="reponse-client refusee">✕ <span>Le client a <b>refusé</b> ce devis le '
                  + quand + (r.motif ? ' — « ' + esc(r.motif) + ' »' : '')
                  + '. Repassez en brouillon pour le retravailler.</span></div>';
        }

        $('#ficheContenu').innerHTML =
            '<div class="fiche-tete">'
            + '<span class="fiche-client">' + esc(client ? client.name : '') + '</span>'
            + '<span class="fiche-nom">' + esc(a.name) + '</span>'
            + (a.description ? '<span class="fiche-desc">' + esc(a.description) + '</span>' : '')
            + '<span class="etat-sauve" id="etatSauve">À jour</span></div>'

            + '<div class="fiche-actions">'
            + '<button class="btn btn-sm" data-modifier-affaire>Modifier l\'affaire</button>'
            + '<button class="btn btn-sm" data-pdf-affaire>PDF récapitulatif</button>'
            + '<button class="btn btn-sm btn-danger" data-supprimer-affaire>Supprimer</button>'
            + '</div>'

            + (!d
                ? '<div class="cycle"><span class="eyebrow">Affaire sans devis</span>'
                  + '<div class="cycle-act">'
                  + (estAdmin() ? '<button class="btn btn-arc btn-sm" data-creer-devis>Créer son devis</button>' : '')
                  + '<span style="flex-basis:100%;"></span>'
                  + '<div style="display:flex;gap:8px;flex-wrap:wrap;">' + actionsCycle(a, d) + '</div>'
                  + '</div></div>'
                : '<div class="cycle">'
                  + PAS.map((p, i) =>
                      (i ? '<i class="pas-lien' + (i <= rang ? ' fait' : '') + '"></i>' : '')
                      + '<span class="pas' + (i < rang ? ' fait' : i === rang ? ' actif' : '')
                      + '"><i></i>' + PAS_LAB[p] + '</span>').join('')
                  + '<div class="cycle-act">' + actionsCycle(a, d) + '</div></div>')

            + reponseHtml

            + ((enChiffrage || enRegie) ? '' :
              '<div class="bilan">'
            + '<div class="case budget"><div class="case-lab"><i class="sw"></i>Heures budgétées</div>'
            + '<div class="case-val" id="fBudVal">' + h1(bud) + '<small>h</small></div>'
            + '</div>'
            + '<div class="case reel"><div class="case-lab"><i class="sw"></i>Heures pointées</div>'
            + '<div class="case-val">' + h1(reel) + '<small>h</small></div>'
            + '</div>'
            + '<div class="case ' + cEcart + '" id="fEcartCase"><div class="case-lab"><i class="sw"></i>Écart</div>'
            + '<div class="case-val" id="fEcartVal">' + sgn(ecart, h1) + '<small>h</small></div>'
            + '<div class="case-sous" id="fEcartSous">' + (Math.abs(ecart) < 0.005 ? 'pile sur le budget'
                : ecart > 0 ? 'de dépassement' : 'de marge restante') + '</div></div></div>')

            + '<div class="bloc"><div class="titre"><h2>' + (enChiffrage ? 'Devis'
                : (enRegie ? 'Heures pointées' : 'Devis et heures')) + '</h2>'
            + (d && modifiable
                ? '<a class="btn btn-sm" style="text-decoration:none;" '
                  + 'href="devis_app.html?affaire=' + encodeURIComponent(a.id) + '" target="_blank" rel="noopener">'
                  + 'Éditeur détaillé</a>' : '')
            + '<span class="tot" id="fTotHeures">' + eur(m.heures) + '</span></div>'
            + '<div class="tbl"><table><thead><tr>'
            + (enChiffrage
                ? '<th>Poste</th>'
                  + '<th class="c"><i class="sw" style="background:var(--m-bud);"></i>Budget h</th>'
                  + '<th class="c">Taux €/h</th><th class="c">Montant</th>'
                : '<th>Poste</th>'
                  + '<th class="c"><i class="sw" style="background:var(--m-bud);"></i>Budget h</th>'
                  + '<th class="c"><i class="sw" style="background:var(--m-reel);"></i>Pointé h</th>'
                  + '<th class="c">Écart</th><th>Avancement</th><th class="c">Montant</th>')
            + '</tr></thead><tbody>' + lignes
            + (enChiffrage
                ? '<tr class="total"><td>Total</td>'
                  + '<td class="bud" style="color:var(--m-bud-ink);" id="fTotB">' + h1(bud) + '</td>'
                  + '<td></td><td class="eur" id="fTotEur">' + eur(m.heures) + '</td></tr>'
                : '<tr class="total"><td>Total</td>'
                  + '<td class="bud" style="color:var(--m-bud-ink);" id="fTotB">' + h1(bud) + '</td>'
                  + '<td class="reel">' + h1(reel) + '</td>'
                  + '<td class="ec ' + cEcart + '" id="fTotEc">' + sgn(ecart, h1) + '</td>'
                  + '<td></td><td class="eur" id="fTotEur">' + eur(m.heures) + '</td></tr>')
            + '</tbody></table></div>'
            + (d
                ? (modifiable
                    ? ''
                    : '<div class="verrou"><svg viewBox="0 0 24 24">'
                      + '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>'
                      + 'Devis ' + (stade === 'envoye' ? 'envoyé' : 'verrouillé')
                      + ' : repassez en brouillon pour modifier le budget.'
                      + (function () {
                          const morceaux = [];
                          if (d.delai) morceaux.push('Délai ' + esc(d.delai));
                          if (d.reglement) morceaux.push(esc(REGLEMENTS[d.reglement] || d.reglement));
                          const ct = client && (client.contacts || [])
                              .find(x => String(x.id) === String(d.interlocuteurId || ''));
                          if (ct) morceaux.push(esc(ct.nom));
                          return morceaux.length
                              ? '<span class="verrou-conds">' + morceaux.join(' · ') + '</span>' : '';
                      })()
                      + '</div>')
                : '')
            + conditionsHtml
            + '</div>'

            + achatsHtml

            + (d && !enRegie
                ? '<div class="bloc"><div class="titre"><h2>Synthèse financière</h2></div>'
                  + '<div class="syn">'
                  + (enChiffrage
                      /* au chiffrage : la marge PRÉVUE au devis */
                      ? '<div class="si"><div class="si-lab">Heures</div><div class="si-val" id="fSynHeures">' + eur(m.heures) + '</div></div>'
                        + '<div class="si"><div class="si-lab">Achats</div><div class="si-val" id="fSynAchats">' + eur(m.achats) + '</div></div>'
                        + '<div class="si prix"><div class="si-lab">Prix de vente HT</div><div class="si-val" id="fSynPrix">' + eur(prix) + '</div></div>'
                        + '<div class="si marge"><div class="si-lab">Marge prévue</div><div class="si-val" id="fSynMarge">' + eur(prix - cout) + '</div></div>'
                      /* au suivi : le coût du POINTÉ face au prix de vente */
                      : (function () {
                          if (a.venteTemps) {
                              // vente au temps passé choisie malgré le devis :
                              // même lecture que sans devis, le devis en repère
                              const factM = (s.totaux && s.totaux.reelMontant) || 0;
                              const coutM = (s.totaux && (s.totaux.reelCout !== undefined
                                  ? s.totaux.reelCout : s.totaux.reelMontant)) || 0;
                              const coeffR = parseFloat(a.coeffRegie) || 1.2;
                              const prixR = factM * coeffR;
                              const margeR = prixR - coutM;
                              return '<div class="si pointe"><div class="si-lab">Temps passé au taux</div>'
                                  + '<div class="si-val" id="fRegieBase">' + eur(factM) + '</div></div>'
                                  + '<div class="si"><div class="si-lab">Coût des heures</div>'
                                  + '<div class="si-val">' + eur(coutM) + '</div></div>'
                                  + '<div class="si prix"><div class="si-lab">Prix de vente HT au temps passé</div>'
                                  + '<div class="si-val" id="fRegiePrix">' + eur(prixR) + '</div>'
                                  + '<div class="si-sous">le devis aurait donné ' + eur(prix) + '</div></div>'
                                  + '<div class="si ' + (margeR >= 0 ? 'marge' : 'negatif') + '" id="fRegieMargeTile">'
                                  + '<div class="si-lab">Marge réelle</div>'
                                  + '<div class="si-val" id="fRegieMarge">' + eur(margeR) + '</div>'
                                  + '<div class="si-sous" id="fRegiePct">'
                                  + (prixR > 0 ? Math.round(margeR / prixR * 100) + ' % du prix de vente' : '')
                                  + '</div></div>';
                          }
                          const pointeM = (s.totaux && (s.totaux.reelCout !== undefined
                              ? s.totaux.reelCout : s.totaux.reelMontant)) || 0;
                          // le face-a-face demande : prix de vente HT
                          // contre cout des heures pointees, sans les achats
                          const margeReelle = prix - pointeM;
                          return '<div class="si pointe"><div class="si-lab">Coût des heures pointées</div>'
                              + '<div class="si-val" id="fSynPointe">' + eur(pointeM) + '</div></div>'
                              + '<div class="si"><div class="si-lab">Achats</div><div class="si-val" id="fSynAchats">' + eur(m.achats) + '</div></div>'
                              + '<div class="si prix"><div class="si-lab">Prix de vente HT</div><div class="si-val" id="fSynPrix">' + eur(prix) + '</div></div>'
                              + '<div class="si ' + (margeReelle >= 0 ? 'marge' : 'negatif') + '" id="fSynMargeTile">'
                              + '<div class="si-lab">Marge réelle</div><div class="si-val" id="fSynMarge">' + eur(margeReelle) + '</div>'
                              + '<div class="si-sous" id="fSynMargePct">'
                              + (prix > 0 ? Math.round(margeReelle / prix * 100) + ' % du prix de vente' : '')
                              + '</div></div>';
                      })())
                  + '</div>'
                  + (!enChiffrage && a.venteTemps
                      ? '<div class="syn-coeff"><span>Coefficient de marge</span>'
                        + '<input type="number" step="0.05" min="1" value="'
                        + (parseFloat(a.coeffRegie) || 1.2) + '" data-coeff-regie></div>'
                      : '<div class="syn-coeff"><span>Coefficient de marge</span>'
                        + '<input type="number" step="0.05" min="1" value="' + coeff + '" data-devis="coeffMarge"'
                        + (modifiable ? '' : ' disabled') + '>'
                        + (modifiable ? '' : '<span>— verrouillé avec le devis</span>') + '</div>')
                  + (enChiffrage ? ''
                      : '<label class="syn-vente"><input type="checkbox" data-vente-temps'
                        + (a.venteTemps ? ' checked' : '')
                        + '><span>Vendre cette affaire au temps passé plutôt qu\'au devis</span></label>')
                  + '</div>'
                : (function () {
                    // Vente au temps passé : l'affaire n'a pas de devis, on
                    // facture les heures pointées au taux, coefficient compris.
                    const factM = (s.totaux && s.totaux.reelMontant) || 0;
                    const coutM = (s.totaux && (s.totaux.reelCout !== undefined
                        ? s.totaux.reelCout : s.totaux.reelMontant)) || 0;
                    const coeffR = parseFloat(a.coeffRegie) || 1.2;
                    const prixR = factM * coeffR;
                    const margeR = prixR - coutM;
                    return '<div class="bloc"><div class="titre"><h2>Vente au temps passé</h2></div>'
                        + (d ? '<p style="margin:-4px 0 14px;color:var(--ink-dim);font-size:12.5px;">'
                            + 'Le devis de cette affaire est encore vide : les heures pointées '
                            + 'sont vendues au taux, coefficient compris. Chiffrez le devis pour '
                            + 'passer au suivi sur budget.</p>' : '')
                        + '<div class="syn">'
                        + '<div class="si pointe"><div class="si-lab">Temps passé au taux</div>'
                        + '<div class="si-val" id="fRegieBase">' + eur(factM) + '</div></div>'
                        + '<div class="si"><div class="si-lab">Coût des heures</div>'
                        + '<div class="si-val">' + eur(coutM) + '</div></div>'
                        + '<div class="si prix"><div class="si-lab">Prix de vente HT</div>'
                        + '<div class="si-val" id="fRegiePrix">' + eur(prixR) + '</div></div>'
                        + '<div class="si ' + (margeR >= 0 ? 'marge' : 'negatif') + '" id="fRegieMargeTile">'
                        + '<div class="si-lab">Marge réelle</div>'
                        + '<div class="si-val" id="fRegieMarge">' + eur(margeR) + '</div>'
                        + '<div class="si-sous" id="fRegiePct">'
                        + (prixR > 0 ? Math.round(margeR / prixR * 100) + ' % du prix de vente' : '')
                        + '</div></div>'
                        + '</div>'
                        + '<div class="syn-coeff"><span>Coefficient de marge</span>'
                        + '<input type="number" step="0.05" min="1" value="' + coeffR + '" data-coeff-regie>'
                        + '</div></div>';
                })());

        brancherFiche(a, d, modifiable);
    }

    /* ── enregistrement du devis de la fiche ── */
    let minuteurDevis = null;
    let devisEnAttente = false; // une modification locale attend son PUT
    function etatSauve(texte, classe) {
        const el = $('#etatSauve');
        if (!el) return;
        el.textContent = texte;
        el.className = 'etat-sauve' + (classe ? ' ' + classe : '');
    }
    function programmerEnregistrement() {
        devisEnAttente = true;
        etatSauve('Modifié...', 'encours');
        clearTimeout(minuteurDevis);
        minuteurDevis = setTimeout(enregistrerDevis, 800);
    }
    async function enregistrerDevis() {
        const d = etat.devisLocal;
        if (!d) return;
        try {
            etatSauve('Enregistrement...', 'encours');
            const sauve = await api('/devis/' + etat.ficheId, 'PUT', {
                client: d.client, numCommande: d.numCommande, affaire: d.affaire,
                date: d.date, coeffMarge: d.coeffMarge, data: d.data,
                noteClient: d.noteClient, delai: d.delai,
                reglement: d.reglement, echeances: d.echeances,
                interlocuteurId: d.interlocuteurId || ''
            });
            etat.devisLocal = sauve;
            etat.devis[etat.ficheId] = sauve;
            devisEnAttente = false;
            const heure = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            etatSauve('Enregistré à ' + heure);
        } catch (err) {
            etatSauve('Échec de l\'enregistrement', 'erreur');
            toast(err.message, true);
        }
    }

    // Si l onglet se ferme ou passe en arriere-plan avant la fin du delai
    // d enregistrement (800 ms), le PUT partirait dans le vide : on l envoie
    // immediatement en keepalive pour ne rien perdre.
    window.addEventListener('pagehide', () => {
        if (!devisEnAttente || !etat.devisLocal || !etat.ficheId) return;
        clearTimeout(minuteurDevis);
        const d = etat.devisLocal;
        try {
            fetch(API + '/devis/' + etat.ficheId, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client: d.client, numCommande: d.numCommande, affaire: d.affaire,
                    date: d.date, coeffMarge: d.coeffMarge, data: d.data,
                    noteClient: d.noteClient, delai: d.delai,
                    reglement: d.reglement, echeances: d.echeances,
                    interlocuteurId: d.interlocuteurId || ''
                }),
                keepalive: true
            });
        } catch (e) { /* le prochain chargement retombera sur le serveur */ }
    });

    // La synchronisation periodique saute volontairement la fiche : au retour
    // sur l onglet (ex. apres l editeur detaille), on recharge donc le devis
    // et la synthese du serveur — sinon la fiche re-enregistrerait sa copie
    // perimee et ecraserait les achats saisis dans l editeur.
    async function rafraichirFicheDepuisServeur() {
        try {
            const [synthese, devis] = await Promise.all([
                api('/affaires/' + etat.ficheId + '/synthese?_t=' + Date.now()),
                api('/devis/' + etat.ficheId + '?_t=' + Date.now()).catch(err => {
                    if (err.status === 404) return null;
                    throw err;
                })
            ]);
            etat.syntheseLocale = synthese;
            etat.devisLocal = devis;
            if (devis) etat.devis[etat.ficheId] = devis;
            rendreFiche();
        } catch (e) { /* on garde l affichage actuel */ }
    }
    window.addEventListener('focus', () => {
        if (!etat.moi || etat.vue !== 'fiche' || !etat.ficheId) return;
        if (devisEnAttente) return; // la saisie locale prime
        if (document.querySelector('.scrim.is-on')) return;
        const actif = document.activeElement;
        if (actif && (actif.tagName === 'INPUT' || actif.tagName === 'SELECT'
            || actif.tagName === 'TEXTAREA')) return;
        rafraichirFicheDepuisServeur();
    });

    function brancherFiche(a, d, modifiable) {
        // budget par poste
        $$('#ficheContenu [data-bud]').forEach(inp => inp.addEventListener('change', () => {
            const code = inp.dataset.bud;
            const type = code[0], i = parseInt(code.slice(1), 10);
            const v = parseFloat(inp.value) || 0;
            if (type === 't') etat.devisLocal.data.travail[i].semaines = [v, 0, 0, 0, 0, 0, 0, 0];
            else etat.devisLocal.data.machine[i].temps = v;
            programmerEnregistrement();
            rafraichirSyntheseFiche();
        }));

        // taux par ligne (mode chiffrage)
        $$('#ficheContenu [data-ftaux]').forEach(inp => inp.addEventListener('change', () => {
            const code = inp.dataset.ftaux;
            const type = code[0], i = parseInt(code.slice(1), 10);
            const v = parseFloat(inp.value) || 0;
            if (type === 't') etat.devisLocal.data.travail[i].taux = v;
            else etat.devisLocal.data.machine[i].taux = v;
            programmerEnregistrement();
            rafraichirSyntheseFiche();
        }));

        // note, délai, règlement, coefficient
        $$('#ficheContenu [data-devis]').forEach(inp => inp.addEventListener('change', () => {
            const k = inp.dataset.devis;
            etat.devisLocal[k] = k === 'coeffMarge' ? (parseFloat(inp.value) || 1.2) : inp.value;
            if (k === 'reglement') {
                const bloc = $('#blocEcheancier');
                if (bloc) bloc.classList.toggle('hidden', inp.value !== 'personnalise');
                if (inp.value === 'personnalise' && !(etat.devisLocal.echeances || []).length) {
                    etat.devisLocal.echeances = [
                        { label: 'Acompte à la commande', pourcent: 30, date: '' },
                        { label: 'Solde à livraison', pourcent: 70, date: '' }];
                }
            }
            programmerEnregistrement();
            if (k === 'coeffMarge') rafraichirSyntheseFiche();
        }));

        // échéancier
        $$('#ficheContenu [data-e]').forEach(inp => inp.addEventListener('change', () => {
            const i = parseInt(inp.dataset.i, 10);
            if (!etat.devisLocal.echeances[i]) return;
            const cle = inp.dataset.e === 'pct' ? 'pourcent' : inp.dataset.e;
            etat.devisLocal.echeances[i][cle] =
                inp.dataset.e === 'pct' ? (parseFloat(inp.value) || 0) : inp.value;
            programmerEnregistrement();
        }));
        $$('#ficheContenu [data-suppr-ech]').forEach(b => b.addEventListener('click', () => {
            etat.devisLocal.echeances.splice(parseInt(b.dataset.supprEch, 10), 1);
            programmerEnregistrement();
            rendreFiche();
        }));
        const ajEch = document.querySelector('#ficheContenu [data-ajout-ech]');
        if (ajEch) ajEch.addEventListener('click', () => {
            etat.devisLocal.echeances = etat.devisLocal.echeances || [];
            etat.devisLocal.echeances.push({ label: '', pourcent: 0, date: '' });
            programmerEnregistrement();
            rendreFiche();
        });

        // achats
        $$('#ficheContenu [data-achat]').forEach(inp => inp.addEventListener('change', () => {
            const i = parseInt(inp.dataset.i, 10);
            const cle = inp.dataset.achat;
            etat.devisLocal.data.achats[i][cle] =
                (cle === 'quantite' || cle === 'prixUnit') ? (parseFloat(inp.value) || 0) : inp.value;
            programmerEnregistrement();
            rafraichirSyntheseFiche();
        }));
        $$('#ficheContenu [data-suppr-achat]').forEach(b => b.addEventListener('click', () => {
            etat.devisLocal.data.achats.splice(parseInt(b.dataset.supprAchat, 10), 1);
            programmerEnregistrement();
            rendreFiche();
        }));
        const ajAch = document.querySelector('#ficheContenu [data-ajout-achat]');
        if (ajAch) ajAch.addEventListener('click', () => {
            etat.devisLocal.data.achats.push({ nom: '', fournisseur: '', quantite: 1, prixUnit: 0 });
            programmerEnregistrement();
            rendreFiche();
        });

        // interrupteur : vendre au temps passé malgré le devis chiffré
        const venteInp = document.querySelector('#ficheContenu [data-vente-temps]');
        if (venteInp) venteInp.addEventListener('change', async () => {
            a.venteTemps = venteInp.checked;
            rendreFiche();
            try {
                await api('/affaires/' + a.id, 'PUT', { venteTemps: a.venteTemps });
            } catch (err) { toast(err.message, true); }
        });

        // coefficient de la vente au temps passé : recalcul immédiat,
        // enregistrement sur l'affaire en arrière-plan
        const coeffRegieInp = document.querySelector('#ficheContenu [data-coeff-regie]');
        if (coeffRegieInp) coeffRegieInp.addEventListener('change', async () => {
            const coeffR = parseFloat(coeffRegieInp.value) || 1.2;
            a.coeffRegie = coeffR;
            const factM = (etat.syntheseLocale.totaux && etat.syntheseLocale.totaux.reelMontant) || 0;
            const coutM = (etat.syntheseLocale.totaux
                && (etat.syntheseLocale.totaux.reelCout !== undefined
                    ? etat.syntheseLocale.totaux.reelCout : etat.syntheseLocale.totaux.reelMontant)) || 0;
            const prixR = factM * coeffR;
            const margeR = prixR - coutM;
            const pose2 = (id2, t2) => { const el = document.getElementById(id2); if (el) el.textContent = t2; };
            pose2('fRegiePrix', eur(prixR));
            pose2('fRegieMarge', eur(margeR));
            pose2('fRegiePct', prixR > 0 ? Math.round(margeR / prixR * 100) + ' % du prix de vente' : '');
            const tuile = document.getElementById('fRegieMargeTile');
            if (tuile) tuile.className = 'si ' + (margeR >= 0 ? 'marge' : 'negatif');
            try {
                await api('/affaires/' + a.id, 'PUT', { coeffRegie: coeffR });
            } catch (err) { toast(err.message, true); }
        });

        // créer le devis d'une affaire qui n'en a pas
        const creer = document.querySelector('#ficheContenu [data-creer-devis]');
        if (creer) creer.addEventListener('click', async () => {
            try {
                const heuresParPoste = {};
                etat.syntheseLocale.postes.forEach(p => { heuresParPoste[p.nom] = p.reelHeures; });
                await api('/devis/' + a.id, 'PUT', devisVierge(a, heuresParPoste));
                await chargerTout();
                await ouvrirFiche();
                toast('Devis créé — pré-rempli avec les heures pointées');
            } catch (err) { toast(err.message, true); }
        });

        // actions du cycle
        $$('#ficheContenu [data-cycle]').forEach(b => b.addEventListener('click', async () => {
            const cible = b.dataset.cycle;
            try {
                // ne pas perdre une frappe en cours
                clearTimeout(minuteurDevis);
                if (etat.devisLocal) await enregistrerDevis();
                await api('/affaires/' + a.id + '/statut', 'PUT', { statut: cible });
                await chargerTout();
                await ouvrirFiche();
                if (cible === 'envoye') montrerLienClient();
                else toast({ brouillon: 'Repassé en brouillon — le budget est modifiable',
                             en_cours: 'Devis validé — l\x27affaire est en cours',
                             terminee: 'Affaire terminée',
                             archivee: 'Affaire archivée' }[cible] || 'Statut mis à jour');
            } catch (err) { toast(err.message, true); }
        }));
        const voirLien = document.querySelector('#ficheContenu [data-voir-lien]');
        if (voirLien) voirLien.addEventListener('click', montrerLienClient);

        const modifAff = document.querySelector('#ficheContenu [data-modifier-affaire]');
        if (modifAff) modifAff.addEventListener('click', () => ouvrirModalAffaire(a));

        const pdfAff = document.querySelector('#ficheContenu [data-pdf-affaire]');
        if (pdfAff) pdfAff.addEventListener('click', () => genererPdfAffaire(a));

        const supprAff = document.querySelector('#ficheContenu [data-supprimer-affaire]');
        if (supprAff) supprAff.addEventListener('click', async () => {
            if (!confirm('Supprimer définitivement l\'affaire « ' + a.name
                + ' », ses saisies et son devis ? Cette action est irréversible.')) return;
            try {
                await api('/affaires/' + a.id, 'DELETE');
                await chargerTout();
                aller('affaires');
                rendreListeAffaires();
                toast('Affaire supprimée');
            } catch (err) { toast(err.message, true); }
        });
    }

    // Met à jour IMMÉDIATEMENT, côté client, toutes les cellules calculées
    // de la fiche : lignes, bilan, ligne de total, synthèse financière.
    // On n'attend pas le serveur — son enregistrement passe par un commit
    // git qui peut prendre plusieurs secondes, et les totaux doivent suivre
    // la frappe. Les heures pointées, elles, ne bougent pas pendant qu'on
    // chiffre : on garde celles de la synthèse chargée.
    function rafraichirSyntheseFiche() {
        const d = etat.devisLocal;
        if (!d || !etat.syntheseLocale) return;

        const reelParNom = {};
        etat.syntheseLocale.postes.forEach(p => { reelParNom[p.nom] = p.reelHeures; });

        const majLigne = (ligne, type, i) => {
            const lid = type + i;
            const b = type === 't'
                ? (ligne.semaines || []).reduce((x, y) => x + (parseFloat(y) || 0), 0)
                : (parseFloat(ligne.temps) || 0);
            const r = reelParNom[ligne.nom] || 0;
            const e = r - b, cc = cls(e);
            const ech = Math.max(b, r) || 1;
            const ec = document.querySelector('[data-fec="' + lid + '"]');
            if (ec) {
                ec.textContent = (b === 0 && r === 0) ? '—' : sgn(e, h1);
                ec.className = 'ec ' + cc;
            }
            const fill = document.querySelector('[data-ffill="' + lid + '"]');
            if (fill) {
                fill.className = 'fill ' + cc;
                fill.style.width = Math.round(r / ech * 100) + '%';
            }
            const cible = document.querySelector('[data-fcible="' + lid + '"]');
            if (cible) {
                cible.style.left = Math.round(b / ech * 100) + '%';
                cible.style.display = b > 0 ? '' : 'none';
            }
            const eurC = document.querySelector('[data-feur="' + lid + '"]');
            if (eurC) eurC.textContent = eur(b * (parseFloat(ligne.taux) || 0));
        };
        (d.data.travail || []).forEach((l, i) => majLigne(l, 't', i));
        (d.data.machine || []).forEach((l, i) => majLigne(l, 'm', i));
        (d.data.achats || []).forEach((a2, i) => {
            const c2 = document.querySelector('[data-faeur="' + i + '"]');
            if (c2) c2.textContent =
                eur((parseFloat(a2.quantite) || 0) * (parseFloat(a2.prixUnit) || 0));
        });

        const bud = budgetDevis(d);
        const reel = etat.syntheseLocale.totaux.reelHeures;
        const ecart = reel - bud, cE = cls(ecart);
        const pose = (id2, txt) => {
            const el = document.getElementById(id2);
            if (el) el.textContent = txt;
        };
        const budEl = document.getElementById('fBudVal');
        if (budEl) budEl.innerHTML = h1(bud) + '<small>h</small>';
        const ecartEl = document.getElementById('fEcartVal');
        if (ecartEl) ecartEl.innerHTML = sgn(ecart, h1) + '<small>h</small>';
        const caseEl = document.getElementById('fEcartCase');
        if (caseEl) caseEl.className = 'case ' + cE;
        pose('fEcartSous', Math.abs(ecart) < 0.005 ? 'pile sur le budget'
            : ecart > 0 ? 'de dépassement' : 'de marge restante');

        const m2 = montantsDevis(d);
        const coeff2 = parseFloat(d.coeffMarge) || 1.2;
        const cout2 = m2.heures + m2.achats;
        pose('fTotHeures', eur(m2.heures));
        pose('fTotAchats', eur(m2.achats));
        pose('fTotB', h1(bud));
        pose('fTotEur', eur(m2.heures));
        const totEc = document.getElementById('fTotEc');
        if (totEc) { totEc.textContent = sgn(ecart, h1); totEc.className = 'ec ' + cE; }
        pose('fSynHeures', eur(m2.heures));
        pose('fSynAchats', eur(m2.achats));
        pose('fSynPrix', eur(cout2 * coeff2));
        if (document.getElementById('fSynPointe')) {
            // mode suivi : la marge reelle bouge avec le prix et les achats,
            // le pointe vient de la synthese chargee
            const pointeM = (etat.syntheseLocale && (etat.syntheseLocale.totaux.reelCout !== undefined
                ? etat.syntheseLocale.totaux.reelCout : etat.syntheseLocale.totaux.reelMontant)) || 0;
            const prixVente = cout2 * coeff2;
            const margeReelle = prixVente - pointeM;
            pose('fSynMarge', eur(margeReelle));
            pose('fSynMargePct', prixVente > 0
                ? Math.round(margeReelle / prixVente * 100) + ' % du prix de vente' : '');
            const tuile = document.getElementById('fSynMargeTile');
            if (tuile) tuile.className = 'si ' + (margeReelle >= 0 ? 'marge' : 'negatif');
        } else {
            pose('fSynMarge', eur(cout2 * coeff2 - cout2));
        }
    }

    function montrerLienClient() {
        const d = etat.devis[etat.ficheId];
        if (!d || !d.token) { toast('Aucun lien : le devis n\'a pas encore été envoyé', true); return; }
        const url = window.location.origin + '/client.html?t=' + d.token;
        $('#lienClientUrl').textContent = url;
        ouvrir('scrimLien');
    }
    $('#btnCopierLien').addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText($('#lienClientUrl').textContent);
            toast('Lien copié');
        } catch (e) { toast('Copie impossible — sélectionnez le lien à la main', true); }
    });

    /* ═══════════════ PDF récapitulatif d'une affaire ═══════════════ */
    function genererPdfAffaire(a) {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            toast('Génération PDF indisponible (bibliothèque non chargée)', true);
            return;
        }
        const client = etat.clients.find(x => x.id === a.clientId);
        const saisies = etat.entries.filter(e => e.affaireId === a.id);
        if (!saisies.length) { toast('Aucune saisie sur cette affaire', true); return; }

        const parPoste = {};
        let total = 0;
        saisies.forEach(e => {
            const p = etat.postes.find(x => x.id === e.posteId);
            const nom = p ? p.name : 'Inconnu';
            parPoste[nom] = (parPoste[nom] || 0) + (parseFloat(e.hours) || 0);
            total += parseFloat(e.hours) || 0;
        });

        const doc = new window.jspdf.jsPDF();
        doc.setFontSize(20);
        doc.setTextColor(10, 95, 192);
        doc.text('RÉCAPITULATIF D\'AFFAIRE', 105, 20, { align: 'center' });
        doc.setFontSize(11);
        doc.setTextColor(0, 0, 0);
        doc.text('Date : ' + new Date().toLocaleDateString('fr-FR'), 20, 32);
        doc.text('Client : ' + (client ? client.name : 'Inconnu'), 20, 40);
        doc.text('Affaire : ' + a.name, 20, 47);
        if (a.description) {
            doc.text(doc.splitTextToSize('Description : ' + a.description, 170), 20, 54);
        }

        let y = a.description ? 68 : 60;
        doc.setFontSize(14);
        doc.setTextColor(10, 95, 192);
        doc.text('HEURES PAR POSTE', 20, y);
        y += 9;
        doc.setFontSize(11);
        doc.setTextColor(0, 0, 0);
        Object.keys(parPoste).forEach(nom => {
            doc.text(nom + ' : ' + parPoste[nom].toFixed(1) + ' h', 25, y);
            y += 7;
        });
        y += 4;
        doc.setFontSize(14);
        doc.setTextColor(10, 95, 192);
        doc.text('TOTAL : ' + total.toFixed(1) + ' heures', 20, y);

        y += 13;
        doc.text('DÉTAIL DES SAISIES', 20, y);
        y += 9;
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        saisies.slice().sort((x, z) => String(x.date).localeCompare(String(z.date)))
            .forEach((e, i) => {
                if (y > 272) { doc.addPage(); y = 20; }
                const p = etat.postes.find(x => x.id === e.posteId);
                doc.text((i + 1) + '. ' + new Date(e.date).toLocaleDateString('fr-FR')
                    + ' - ' + (p ? p.name : 'Inconnu') + ' : '
                    + (parseFloat(e.hours) || 0) + ' h'
                    + (e.enteredBy ? '   (' + e.enteredBy + ')' : ''), 25, y);
                y += 6;
            });

        doc.save('Affaire_' + String(a.name).replace(/[^a-z0-9]/gi, '_') + '_'
            + new Date().toISOString().split('T')[0] + '.pdf');
        toast('PDF généré');
    }

    /* ═══════════════ GESTION (en onglets pleine largeur) ═══════════════ */

    const ONGLETS_GESTION = [
        ['entreprise', 'Entreprise'], ['clients', 'Clients'], ['postes', 'Postes'],
        ['utilisateurs', 'Utilisateurs'], ['fournisseurs', 'Fournisseurs'], ['achats', 'Achats types']
    ];

    function rendreGestion() {
        const actif = etat.ongletGestion || 'entreprise';
        const comptes = {
            clients: etat.clients.length,
            postes: etat.postes.length,
            utilisateurs: etat.users.filter(u => u.name !== 'Admin').length,
            fournisseurs: etat.fournisseursBib.length,
            achats: etat.achatsBib.length
        };
        const panneaux = {
            entreprise: panneauEntreprise, clients: panneauClients, postes: panneauPostes,
            utilisateurs: panneauUtilisateurs, fournisseurs: panneauFournisseurs, achats: panneauAchatsTypes
        };
        const brancheurs = {
            entreprise: brancherEntreprise, clients: brancherClients, postes: brancherPostes,
            utilisateurs: brancherUtilisateurs, fournisseurs: brancherFournisseurs, achats: brancherAchatsTypes
        };

        $('#gestionContenu').innerHTML =
            '<div class="gonglets">' + ONGLETS_GESTION.map(o =>
                '<button class="gonglet' + (o[0] === actif ? ' is-on' : '') + '" data-gonglet="' + o[0] + '">'
                + o[1]
                + (comptes[o[0]] !== undefined ? '<span class="gonglet-n">' + comptes[o[0]] + '</span>' : '')
                + '</button>').join('') + '</div>'
            + '<div class="bloc gest-panneau">' + panneaux[actif]() + '</div>';

        $$('#gestionContenu [data-gonglet]').forEach(b => b.addEventListener('click', () => {
            etat.ongletGestion = b.dataset.gonglet;
            rendreGestion();
        }));
        brancheurs[actif]();
    }

    /* ── Entreprise ── */
    function panneauEntreprise() {
        const ent = etat.entreprise;
        const ch = (k, label, valeur) =>
            '<div class="ch"><label>' + label + '</label>'
            + '<input type="text" value="' + attr(valeur || '') + '" data-ent="' + k + '"></div>';
        return '<div class="titre"><h2>Entreprise</h2></div>'
            + '<div class="ent">'
            + '<div class="ent-logo">'
            + '<div class="ent-logo-apercu">' + (ent.logo
                ? '<img src="' + attr(ent.logo) + '" alt="Logo">'
                : '<div class="mark" style="width:52px;height:52px;"></div>') + '</div>'
            + '<input type="file" id="fichierLogo" accept="image/png,image/jpeg,image/svg+xml" class="hidden">'
            + '<button class="btn btn-sm" id="btnLogo">Changer le logo</button>'
            + '<span class="ent-logo-note">PNG ou SVG, 300 Ko max</span>'
            + '</div>'
            + '<div class="ent-champs">'
            + ch('nom', 'Nom', ent.nom) + ch('forme', 'Forme juridique', ent.forme)
            + '<div class="ch ch-l"><label>Adresse</label><input type="text" value="'
            + attr(ent.adresse || '') + '" data-ent="adresse"></div>'
            + ch('cp', 'Code postal', ent.cp) + ch('ville', 'Ville', ent.ville)
            + ch('tel', 'Téléphone', ent.tel) + ch('site', 'Site web', ent.site)
            + ch('siret', 'SIRET', ent.siret) + ch('tva', 'N° TVA', ent.tva)
            + '</div></div>'
            + '<div class="ajout" style="border-top:none;justify-content:flex-end;">'
            + '<button class="btn btn-arc btn-sm" id="btnEnregistrerEntreprise">Enregistrer</button></div>';
    }
    function brancherEntreprise() {
        $('#btnLogo').addEventListener('click', () => $('#fichierLogo').click());
        $('#fichierLogo').addEventListener('change', () => {
            const f = $('#fichierLogo').files[0];
            if (!f) return;
            if (f.size > 300 * 1024) { toast('Logo trop lourd (300 Ko maximum)', true); return; }
            const lecteur = new FileReader();
            lecteur.onload = () => {
                etat.entreprise.logo = lecteur.result;
                rendreGestion();
                toast('Logo chargé — pensez à Enregistrer');
            };
            lecteur.readAsDataURL(f);
        });
        $('#btnEnregistrerEntreprise').addEventListener('click', async () => {
            const corps = { logo: etat.entreprise.logo || '' };
            $$('#gestionContenu [data-ent]').forEach(i2 => { corps[i2.dataset.ent] = i2.value.trim(); });
            try {
                const r = await api('/entreprise', 'POST', corps);
                etat.entreprise = r.entreprise;
                toast('Coordonnées enregistrées');
            } catch (err) { toast(err.message, true); }
        });
    }

    /* ── Clients ── */
    function panneauClients() {
        return '<div class="titre"><h2>Clients</h2></div>'
            + etat.clients.map(c => {
                const n = etat.affaires.filter(a => a.clientId === c.id).length;
                const nc = (c.contacts || []).length;
                return '<div class="ligne-g"><span class="n">' + esc(c.name) + '</span>'
                    + '<span class="m">' + n + ' affaire' + (n > 1 ? 's' : '')
                    + (nc ? ' · ' + nc + ' interlocuteur' + (nc > 1 ? 's' : '') : '') + '</span>'
                    + '<div class="acts">'
                    + '<button class="btn btn-sm" data-ouvrir-client="' + attr(c.id) + '">Ouvrir</button>'
                    + '</div></div>';
            }).join('')
            + '<div class="ajout"><input type="text" id="ajClient" placeholder="Nouveau client">'
            + '<button class="btn btn-arc btn-sm" id="btnAjClient">Ajouter</button></div>';
    }
    function brancherClients() {
        $('#btnAjClient').addEventListener('click', async () => {
            const nom = $('#ajClient').value.trim();
            if (!nom) { $('#ajClient').focus(); return; }
            try {
                await api('/clients', 'POST', { name: nom });
                await chargerTout(); rendreGestion(); toast('Client ajouté');
            } catch (err) { toast(err.message, true); }
        });
        $$('#gestionContenu [data-ouvrir-client]').forEach(b => b.addEventListener('click', () => {
            etat.ficheClientId = b.dataset.ouvrirClient;
            rendreFicheClient();
            aller('ficheClient');
        }));
    }

    /* ── FICHE CLIENT : identité, interlocuteurs en cartes, affaires ── */

    const SVG_MAIL = '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>';
    const SVG_TEL = '<svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>';
    const initiales = n => String(n || '').split(/\s+/)
        .map(m => m[0] || '').join('').slice(0, 2).toUpperCase() || '--';

    function rendreFicheClient() {
        const c = etat.clients.find(x => x.id === etat.ficheClientId);
        if (!c) { aller('gestion'); rendreGestion(); return; }

        const affairesClient = etat.affaires.filter(a => a.clientId === c.id);
        const enCours = affairesClient.filter(a => stadeDe(a) === 'en_cours').length;
        const heures = affairesClient.reduce((s, a) => s + heuresAffaire(a.id), 0);
        const contacts = c.contacts || [];

        const coord = (svg, valeur, absente) =>
            '<div class="coord' + (valeur ? '' : ' absente') + '">' + svg
            + '<span>' + (valeur ? esc(valeur) : absente) + '</span></div>';

        $('#ficheClientContenu').innerHTML =
            '<div class="bloc"><div class="identite">'
            + '<div class="sceau">' + esc(initiales(c.name)) + '</div>'
            + '<div class="identite-corps">'
            + '<div class="identite-nom">' + esc(c.name) + '</div>'
            + ((c.adresse || c.tva)
                ? '<div class="identite-lignes">'
                  + (c.adresse ? '<span><svg viewBox="0 0 24 24"><path d="M3 21V8l6-4 6 4v13M15 21V11l6 3v7"/></svg>'
                    + esc(c.adresse) + '</span>' : '')
                  + (c.tva ? '<span><svg viewBox="0 0 24 24"><path d="M6 3h8l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5"/></svg>'
                    + 'TVA ' + esc(c.tva) + '</span>' : '')
                  + '</div>'
                : '')
            + '</div>'
            + '<div class="identite-actions">'
            + '<button class="btn btn-sm" data-modif-identite>Modifier</button>'
            + '<button class="btn btn-sm btn-danger" data-suppr-ce-client>Supprimer</button>'
            + '</div></div>'
            + '<div class="compteurs">'
            + '<div class="compteur"><b>' + enCours + '</b><span>affaires en cours</span></div>'
            + '<div class="compteur"><b>' + affairesClient.length + '</b><span>affaires au total</span></div>'
            + '<div class="compteur"><b>' + h1(heures) + '</b><span>heures pointées</span></div>'
            + '<div class="compteur"><b>' + contacts.length + '</b><span>interlocuteur' + (contacts.length > 1 ? 's' : '') + '</span></div>'
            + '</div></div>'

            + '<div class="bloc"><div class="titre"><h2>Interlocuteurs</h2></div>'
            + '<div class="gens">'
            + contacts.map((p, i) =>
                '<div class="personne"><div class="personne-tete">'
                + '<div class="pastille">' + esc(initiales(p.nom)) + '</div>'
                + '<div><div class="personne-nom">' + esc(p.nom) + '</div>'
                + (p.fonction ? '<div class="personne-fonction">' + esc(p.fonction) + '</div>' : '')
                + '</div></div>'
                + '<div class="personne-coord">'
                + coord(SVG_MAIL, p.email, 'pas d\'email')
                + coord(SVG_TEL, p.tel, 'pas de téléphone')
                + '</div>'
                + '<div class="personne-actions">'
                + '<button class="btn btn-sm" data-modif-personne="' + i + '">Modifier</button>'
                + '<button class="btn btn-sm btn-danger" data-suppr-personne="' + i + '">Supprimer</button>'
                + '</div></div>').join('')
            + '<button class="personne personne-ajout" data-ajout-personne>'
            + '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>'
            + '<b>Ajouter un interlocuteur</b></button>'
            + '</div></div>'

            + '<div class="bloc"><div class="titre"><h2>Affaires</h2>'
            + '<button class="btn btn-arc btn-sm" data-affaire-ici style="margin-left:auto;">Nouvelle affaire</button></div>'
            + (affairesClient.length
                ? '<div class="mini-affaires">' + affairesClient.map(a => {
                    const st = stadeDe(a);
                    return '<button class="mini-affaire" data-va-affaire="' + attr(a.id) + '">'
                        + '<div class="mini-affaire-tete"><span class="mini-affaire-nom">' + esc(a.name) + '</span>'
                        + '<span class="stade ' + st + '">' + NOMS_STADE[st] + '</span></div>'
                        + '<span class="mini-affaire-h">'
                        + (st === 'brouillon' || st === 'envoye'
                            ? 'devis en chiffrage'
                            : h1(heuresAffaire(a.id)) + ' h pointées')
                        + '</span></button>';
                }).join('') + '</div>'
                : '<p style="color:var(--ink-dim);">Aucune affaire pour ce client.</p>');

        brancherFicheClient(c);
    }

    function brancherFicheClient(c) {
        const q = s => document.querySelector('#ficheClientContenu ' + s);
        q('[data-modif-identite]').addEventListener('click', () => ouvrirModalClient(c));
        q('[data-suppr-ce-client]').addEventListener('click', async () => {
            if (!confirm('Supprimer le client « ' + c.name + ' » et ses affaires associées ?')) return;
            try {
                await api('/clients/' + c.id, 'DELETE');
                await chargerTout();
                aller('gestion');
                rendreGestion();
                toast('Client supprimé');
            } catch (err) { toast(err.message, true); }
        });
        q('[data-ajout-personne]').addEventListener('click', () => ouvrirPersonne(null));
        $$('#ficheClientContenu [data-modif-personne]').forEach(b =>
            b.addEventListener('click', () => ouvrirPersonne(parseInt(b.dataset.modifPersonne, 10))));
        $$('#ficheClientContenu [data-suppr-personne]').forEach(b =>
            b.addEventListener('click', async () => {
                const i = parseInt(b.dataset.supprPersonne, 10);
                const p = (c.contacts || [])[i];
                if (!p || !confirm('Supprimer ' + p.nom + ' ?')) return;
                const contacts = c.contacts.slice();
                contacts.splice(i, 1);
                try {
                    await api('/clients/' + c.id, 'PUT', { contacts: contacts });
                    await chargerTout();
                    rendreFicheClient();
                    toast(p.nom + ' supprimé');
                } catch (err) { toast(err.message, true); }
            }));
        q('[data-affaire-ici]').addEventListener('click', () => {
            ouvrirModalAffaire(null);
            $('#naClient').value = c.id;
        });
        $$('#ficheClientContenu [data-va-affaire]').forEach(b =>
            b.addEventListener('click', () => {
                etat.ficheId = b.dataset.vaAffaire;
                ouvrirFiche();
            }));
    }

    /* ── un interlocuteur : modale à champs empilés ── */
    function ouvrirPersonne(idx) {
        etat.editionContactIdx = idx;
        const c = etat.clients.find(x => x.id === etat.ficheClientId);
        const p = (idx === null || !c) ? {} : ((c.contacts || [])[idx] || {});
        $('#titrePersonne').textContent = idx === null ? 'Nouvel interlocuteur' : (p.nom || 'Interlocuteur');
        $('#pNom').value = p.nom || '';
        $('#pFonction').value = p.fonction || '';
        $('#pEmail').value = p.email || '';
        $('#pTel').value = p.tel || '';
        ouvrir('scrimPersonne');
        setTimeout(() => $('#pNom').focus(), 120);
    }

    $('#btnEnregistrerPersonne').addEventListener('click', async () => {
        const c = etat.clients.find(x => x.id === etat.ficheClientId);
        if (!c) return;
        const nom = $('#pNom').value.trim();
        if (!nom) { $('#pNom').focus(); return; }
        const contacts = (c.contacts || []).slice();
        const p = {
            id: etat.editionContactIdx !== null && contacts[etat.editionContactIdx]
                ? contacts[etat.editionContactIdx].id : undefined,
            nom: nom,
            fonction: $('#pFonction').value.trim(),
            email: $('#pEmail').value.trim(),
            tel: $('#pTel').value.trim()
        };
        if (etat.editionContactIdx === null) contacts.push(p);
        else contacts[etat.editionContactIdx] = p;
        try {
            await api('/clients/' + c.id, 'PUT', { contacts: contacts });
            fermer('scrimPersonne');
            await chargerTout();
            rendreFicheClient();
            toast(etat.editionContactIdx === null ? nom + ' ajouté' : nom + ' mis à jour');
        } catch (err) { toast(err.message, true); }
    });

    /* ── identité du client : la modale ne porte plus que nom/adresse/TVA ── */
    function ouvrirModalClient(client) {
        etat.editionClientId = client ? client.id : null;
        $('#titreModalClient').textContent = client ? client.name : 'Nouveau client';
        $('#clNom').value = client ? client.name : '';
        $('#clAdresse').value = client ? (client.adresse || '') : '';
        $('#clTva').value = client ? (client.tva || '') : '';
        ouvrir('scrimClient');
    }

    $('#btnEnregistrerClient').addEventListener('click', async () => {
        const nom = $('#clNom').value.trim();
        if (!nom) { toast('Le nom du client est requis', true); return; }
        const corps = { name: nom, adresse: $('#clAdresse').value.trim(),
                        tva: $('#clTva').value.trim() };
        try {
            if (etat.editionClientId) await api('/clients/' + etat.editionClientId, 'PUT', corps);
            else await api('/clients', 'POST', corps);
            fermer('scrimClient');
            await chargerTout();
            if (etat.vue === 'ficheClient') rendreFicheClient();
            else if (etat.vue === 'gestion') rendreGestion();
            toast(etat.editionClientId ? 'Client mis à jour' : 'Client créé');
        } catch (err) { toast(err.message, true); }
    });

    /* ── Postes ── */
    function panneauPostes() {
        return '<div class="titre"><h2>Postes</h2></div>'
            + etat.postes.map((p, idx) =>
                '<div class="ligne-g">'
                + '<div class="ord">'
                + '<button data-monter="' + attr(p.id) + '"' + (idx === 0 ? ' disabled' : '')
                + ' aria-label="Monter"><svg viewBox="0 0 24 24"><path d="M6 14l6-6 6 6"/></svg></button>'
                + '<button data-descendre="' + attr(p.id) + '"' + (idx === etat.postes.length - 1 ? ' disabled' : '')
                + ' aria-label="Descendre"><svg viewBox="0 0 24 24"><path d="M6 10l6 6 6-6"/></svg></button>'
                + '</div>'
                + '<span class="n">' + esc(p.name)
                + (p.isMachine ? '<span class="mach">MACHINE</span>' : '') + '</span>'
                + '<label class="check" title="Temps machine"><input type="checkbox" data-machine="' + attr(p.id) + '"'
                + (p.isMachine ? ' checked' : '') + '><span>Machine</span></label>'
                + '<span class="m">taux</span>'
                + '<input type="number" min="0" step="1" class="taux-inline" value="'
                + (p.tauxHoraire || 0) + '" data-taux="' + attr(p.id) + '" title="Taux facturé €/h">'
                + '<span class="m">coût</span>'
                + '<input type="number" min="0" step="1" class="taux-inline" value="'
                + (p.coutHoraire !== undefined && p.coutHoraire !== '' ? p.coutHoraire : '')
                + '" placeholder="' + (p.tauxHoraire || 0) + '" data-cout="' + attr(p.id)
                + '" title="Coût réel €/h — à défaut, le taux est utilisé">'
                + '<span class="m">€/h</span>'
                + '<div class="acts">'
                + '<button class="btn btn-sm" data-ren-poste="' + attr(p.id) + '">Renommer</button>'
                + '<button class="btn btn-sm btn-danger" data-suppr-poste="' + attr(p.id) + '">Supprimer</button>'
                + '</div></div>').join('')
            + '<div class="ajout"><input type="text" id="ajPoste" placeholder="Nouveau poste">'
            + '<label class="check"><input type="checkbox" id="ajPosteMachine"><span>Machine</span></label>'
            + '<button class="btn btn-arc btn-sm" id="btnAjPoste">Ajouter</button></div>';
    }
    function brancherPostes() {
        $('#btnAjPoste').addEventListener('click', async () => {
            const nom = $('#ajPoste').value.trim();
            if (!nom) { $('#ajPoste').focus(); return; }
            try {
                await api('/postes', 'POST', { name: nom, isMachine: $('#ajPosteMachine').checked });
                await chargerTout(); rendreGestion(); toast('Poste ajouté');
            } catch (err) { toast(err.message, true); }
        });
        async function deplacerPoste(id, sens) {
            const i2 = etat.postes.findIndex(p => p.id === id);
            const j2 = i2 + sens;
            if (i2 < 0 || j2 < 0 || j2 >= etat.postes.length) return;
            const copie = etat.postes.slice();
            const tmp = copie[i2]; copie[i2] = copie[j2]; copie[j2] = tmp;
            try {
                await api('/postes/reorder', 'POST',
                    { postesOrder: copie.map((p, k) => ({ id: p.id, order: k })) });
                await chargerTout(); rendreGestion(); toast('Ordre des postes mis à jour');
            } catch (err) { toast(err.message, true); }
        }
        $$('#gestionContenu [data-monter]').forEach(b =>
            b.addEventListener('click', () => deplacerPoste(b.dataset.monter, -1)));
        $$('#gestionContenu [data-descendre]').forEach(b =>
            b.addEventListener('click', () => deplacerPoste(b.dataset.descendre, 1)));
        $$('#gestionContenu [data-machine]').forEach(c => c.addEventListener('change', async () => {
            try {
                await api('/postes/' + c.dataset.machine, 'PUT', { isMachine: c.checked });
                await chargerTout(); rendreGestion();
                toast(c.checked ? 'Poste marqué machine' : 'Poste marqué main-d\'œuvre');
            } catch (err) { toast(err.message, true); }
        }));
        $$('#gestionContenu [data-taux]').forEach(i2 => i2.addEventListener('change', async () => {
            try {
                await api('/postes/' + i2.dataset.taux, 'PUT',
                    { tauxHoraire: parseFloat(i2.value) || 0 });
                await chargerTout(); toast('Taux mis à jour');
            } catch (err) { toast(err.message, true); }
        }));
        $$('#gestionContenu [data-cout]').forEach(i2 => i2.addEventListener('change', async () => {
            try {
                await api('/postes/' + i2.dataset.cout, 'PUT',
                    { coutHoraire: parseFloat(i2.value) || 0 });
                await chargerTout(); toast('Coût horaire mis à jour');
            } catch (err) { toast(err.message, true); }
        }));
        $$('#gestionContenu [data-ren-poste]').forEach(b => b.addEventListener('click', async () => {
            const p = etat.postes.find(x => x.id === b.dataset.renPoste);
            const nom = prompt('Nouveau nom du poste :', p.name);
            if (!nom || nom.trim() === p.name) return;
            try {
                await api('/postes/' + p.id, 'PUT', { name: nom.trim() });
                await chargerTout(); rendreGestion(); toast('Poste renommé');
            } catch (err) { toast(err.message, true); }
        }));
        $$('#gestionContenu [data-suppr-poste]').forEach(b => b.addEventListener('click', async () => {
            const p = etat.postes.find(x => x.id === b.dataset.supprPoste);
            if (!confirm('Supprimer le poste « ' + p.name + ' » ?')) return;
            try {
                await api('/postes/' + p.id, 'DELETE');
                await chargerTout(); rendreGestion(); toast('Poste supprimé');
            } catch (err) { toast(err.message, true); }
        }));
    }

    /* ── Utilisateurs ── */
    function panneauUtilisateurs() {
        return '<div class="titre"><h2>Utilisateurs</h2></div>'
            + etat.users.filter(u => u.name !== 'Admin').map(u => {
                const n = etat.entries.filter(e => e.enteredBy === u.name).length;
                return '<div class="ligne-g"><span class="n">' + esc(u.name) + '</span>'
                    + '<span class="m">' + n + ' saisie' + (n > 1 ? 's' : '') + '</span>'
                    + '<div class="acts">'
                    + '<button class="btn btn-sm" data-ren-user="' + attr(u.id) + '">Renommer</button>'
                    + '<button class="btn btn-sm" data-code-user="' + attr(u.id) + '">Changer le code</button>'
                    + '<button class="btn btn-sm btn-danger" data-suppr-user="' + attr(u.id) + '">Supprimer</button>'
                    + '</div></div>';
            }).join('')
            + '<div class="ajout"><input type="text" id="ajUserNom" placeholder="Nom">'
            + '<input type="password" id="ajUserCode" placeholder="Mot de passe">'
            + '<button class="btn btn-arc btn-sm" id="btnAjUser">Ajouter</button></div>';
    }
    function brancherUtilisateurs() {
        $('#btnAjUser').addEventListener('click', async () => {
            const nom = $('#ajUserNom').value.trim();
            const code = $('#ajUserCode').value.trim();
            if (!nom || !code) { toast('Nom et mot de passe requis', true); return; }
            try {
                await api('/users', 'POST', { name: nom, password: code });
                await chargerTout(); rendreGestion(); toast('Utilisateur ajouté');
            } catch (err) { toast(err.message, true); }
        });
        $$('#gestionContenu [data-ren-user]').forEach(b => b.addEventListener('click', async () => {
            const u = etat.users.find(x => x.id === b.dataset.renUser);
            const nom = prompt('Nouveau nom :', u.name);
            if (!nom || nom.trim() === u.name) return;
            try {
                await api('/users/' + u.id, 'PUT', { name: nom.trim() });
                await chargerTout(); rendreGestion(); toast('Utilisateur renommé');
            } catch (err) { toast(err.message, true); }
        }));
        $$('#gestionContenu [data-code-user]').forEach(b => b.addEventListener('click', async () => {
            const u = etat.users.find(x => x.id === b.dataset.codeUser);
            const code = prompt('Nouveau code pour ' + u.name + ' :');
            if (!code || !code.trim()) return;
            try {
                await api('/users/' + u.id, 'PUT', { password: code.trim() });
                await chargerTout(); toast('Code modifié');
            } catch (err) { toast(err.message, true); }
        }));
        $$('#gestionContenu [data-suppr-user]').forEach(b => b.addEventListener('click', async () => {
            const u = etat.users.find(x => x.id === b.dataset.supprUser);
            if (!confirm('Supprimer l\'utilisateur « ' + u.name + ' » ?')) return;
            try {
                await api('/users/' + u.id, 'DELETE');
                await chargerTout(); rendreGestion(); toast('Utilisateur supprimé');
            } catch (err) { toast(err.message, true); }
        }));
    }

    /* ── Fournisseurs ── */
    function panneauFournisseurs() {
        return '<div class="titre"><h2>Fournisseurs</h2></div>'
            + (etat.fournisseursBib.length ? etat.fournisseursBib.map((f, i2) =>
                '<div class="ligne-g"><span class="n">' + esc(f) + '</span>'
                + '<div class="acts"><button class="btn btn-sm btn-danger" data-suppr-fourn="' + i2 + '">Supprimer</button></div></div>').join('')
                : '<p style="color:var(--ink-dim);font-size:13px;">Aucun fournisseur.</p>')
            + '<div class="ajout"><input type="text" id="ajFourn" placeholder="Nouveau fournisseur">'
            + '<button class="btn btn-arc btn-sm" id="btnAjFourn">Ajouter</button></div>';
    }
    function brancherFournisseurs() {
        async function sauverFournisseurs() {
            await api('/fournisseurs', 'POST', { fournisseurs: etat.fournisseursBib });
        }
        $('#btnAjFourn').addEventListener('click', async () => {
            const n = $('#ajFourn').value.trim();
            if (!n) { $('#ajFourn').focus(); return; }
            try {
                etat.fournisseursBib.push(n);
                await sauverFournisseurs();
                rendreGestion(); toast('Fournisseur ajouté');
            } catch (err) { toast(err.message, true); }
        });
        $$('#gestionContenu [data-suppr-fourn]').forEach(b => b.addEventListener('click', async () => {
            try {
                etat.fournisseursBib.splice(parseInt(b.dataset.supprFourn, 10), 1);
                await sauverFournisseurs();
                rendreGestion(); toast('Fournisseur supprimé');
            } catch (err) { toast(err.message, true); }
        }));
    }

    /* ── Achats types ── */
    function panneauAchatsTypes() {
        return '<div class="titre"><h2>Achats types</h2></div>'
            + (etat.achatsBib.length ? etat.achatsBib.map((n, i2) =>
                '<div class="ligne-g"><span class="n">' + esc(n) + '</span>'
                + '<div class="acts"><button class="btn btn-sm btn-danger" data-suppr-achatbib="' + i2 + '">Supprimer</button></div></div>').join('')
                : '<p style="color:var(--ink-dim);font-size:13px;">Aucun achat type.</p>')
            + '<div class="ajout"><input type="text" id="ajAchatBib" placeholder="Nouvel achat type">'
            + '<button class="btn btn-arc btn-sm" id="btnAjAchatBib">Ajouter</button></div>';
    }
    function brancherAchatsTypes() {
        async function sauverAchatsBib() {
            await api('/achats', 'POST', { achats: etat.achatsBib });
        }
        $('#btnAjAchatBib').addEventListener('click', async () => {
            const n = $('#ajAchatBib').value.trim();
            if (!n) { $('#ajAchatBib').focus(); return; }
            try {
                etat.achatsBib.push(n);
                await sauverAchatsBib();
                rendreGestion(); toast('Achat type ajouté');
            } catch (err) { toast(err.message, true); }
        });
        $$('#gestionContenu [data-suppr-achatbib]').forEach(b => b.addEventListener('click', async () => {
            try {
                etat.achatsBib.splice(parseInt(b.dataset.supprAchatbib, 10), 1);
                await sauverAchatsBib();
                rendreGestion(); toast('Achat type supprimé');
            } catch (err) { toast(err.message, true); }
        }));
    }

    /* ═══════════════ synchronisation périodique ═══════════════ */
    setInterval(async () => {
        if (!etat.moi) return;
        // jamais pendant une modale ouverte, une frappe, ou sur la fiche
        if (document.querySelector('.scrim.is-on')) return;
        if (etat.vue === 'fiche') return;
        const actif = document.activeElement;
        if (actif && (actif.tagName === 'INPUT' || actif.tagName === 'SELECT'
            || actif.tagName === 'TEXTAREA')) return;
        try {
            await chargerTout();
            if (etat.vue === 'pointage') rendrePointage();
            else if (etat.vue === 'affaires') rendreListeAffaires();
        } catch (e) {
            $('#syncEtat').textContent = 'Hors ligne';
            $('#syncEtat').classList.add('hors');
        }
    }, 30000);

    /* ═══════════════ divers ═══════════════ */
    $('#btnTheme').addEventListener('click', () => {
        const root = document.documentElement;
        const sombre = !matchMedia('(prefers-color-scheme: light)').matches;
        const actuel = root.getAttribute('data-theme') || (sombre ? 'dark' : 'light');
        const suivant = actuel === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', suivant);
        try { localStorage.setItem('atelier_theme', suivant); } catch (e) { /* stockage indisponible */ }
    });
    try {
        const t = localStorage.getItem('atelier_theme');
        if (t) document.documentElement.setAttribute('data-theme', t);
    } catch (e) { /* stockage indisponible */ }

    /* ═══════════════ démarrage ═══════════════ */
    async function demarrerApp() {
        $('#ecranConnexion').classList.add('hidden');
        $('#ecranApp').classList.remove('hidden');

        const admin = estAdmin();
        $$('[data-admin]').forEach(el => el.classList.toggle('hidden', !admin));
        $('#avatar').textContent = admin ? 'AD'
            : etat.moi.name.slice(0, 2).toUpperCase();
        $('#opNom').textContent = etat.moi.name;
        $('#opRole').textContent = admin ? 'Admin' : 'Utilisateur';

        try {
            await chargerTout();
        } catch (e) {
            $('#syncEtat').textContent = 'Hors ligne';
            $('#syncEtat').classList.add('hors');
        }
        aller(admin ? 'affaires' : 'pointage');
        if (admin) rendreListeAffaires();
        rendrePointage();
    }

    (async function init() {
        await preparerConnexion();
        try {
            const sauve = localStorage.getItem('atelier_utilisateur');
            if (sauve) {
                etat.moi = JSON.parse(sauve);
                await demarrerApp();
                return;
            }
        } catch (e) { /* session illisible : retour à la connexion */ }
    })();
})();
