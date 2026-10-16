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
        achatsReels: {},      // total des achats réels par affaire
        histOuverts: {},      // historique : affaires dépliées
        histTout: {},         // historique : affaires montrant toutes leurs saisies
        histPeriode: '7',     // historique : '7', '30' (jours) ou 'tout'
        histRecherche: '',    // historique : filtre affaire / client
        recherche: '',
        ongletGestion: 'postes',
        gestionDetail: false,     // au téléphone : une section de Gestion est ouverte
        clientsFiltre: 'tous',
        clientsRecherche: '',
        clientOuvert: null,       // client affiché dans le panneau à côté de la liste
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
        etat.achatsReels = {};
        (tout.achatsReels || []).forEach(x => { etat.achatsReels[x.affaireId] = parseFloat(x.total) || 0; });
        etat.devis = {};
        (devisListe.devis || []).forEach(d => { etat.devis[d.affaireId] = d; });
        etat.entreprise = entreprise.entreprise || {};
        etat.fournisseursBib = (fourn.fournisseurs || []).map(f => typeof f === 'string' ? f : (f.nom || ''));
        etat.achatsBib = (achatsBib.achats || []).map(a => typeof a === 'string' ? a : (a.nom || ''));
        $('#syncEtat').textContent = 'Synchronisé';
        $('#syncEtat').classList.remove('hors');
        majBadgeAffaires();
    }

    // Le badge du menu compte les affaires en cours (pas le total)
    function majBadgeAffaires() {
        const b = $('#badgeAffaires');
        if (!b) return;
        const n = etat.affaires.filter(a => stadeDe(a) === 'en_cours').length;
        b.textContent = n;
        b.title = n + (n > 1 ? ' affaires en cours' : ' affaire en cours');
    }

    function heuresAffaire(id) {
        return etat.entries.filter(e => e.affaireId === id)
            .reduce((s, e) => s + (parseFloat(e.hours) || 0), 0);
    }
    // Coefficient de marge d'une affaire : celui du devis, sinon celui
    // retenu sur l'affaire. Il ne s'applique qu'aux heures.
    function coeffAffaire(a, d) {
        return d ? (parseFloat(d.coeffMarge) || 1.2) : (parseFloat(a.coeffRegie) || 1.2);
    }
    // Prix de vente HT réel : heures pointées au taux (celui du devis pour
    // les postes chiffrés, sinon celui du poste) x coefficient, plus les
    // achats réels sans marge.
    function prixReelAffaire(a) {
        const d = etat.devis[a.id];
        const tauxDevis = {};
        if (d && d.data) {
            (d.data.travail || []).concat(d.data.machine || []).forEach(l => {
                if (tauxDevis[l.nom] === undefined) tauxDevis[l.nom] = parseFloat(l.taux) || 0;
            });
        }
        let mnt = 0;
        etat.entries.filter(e => e.affaireId === a.id).forEach(e => {
            const p = etat.postes.find(x => x.id === e.posteId);
            const taux = p && tauxDevis[p.name] !== undefined ? tauxDevis[p.name]
                : (p ? (parseFloat(p.tauxHoraire) || 0) : 0);
            mnt += (parseFloat(e.hours) || 0) * taux;
        });
        return mnt * coeffAffaire(a, d) + (etat.achatsReels[a.id] || 0);
    }
    // Prix de vente HT d'un devis : heures x coefficient + achats sans marge
    function prixDevis(d) {
        const m = montantsDevis(d);
        return m.heures * (parseFloat(d.coeffMarge) || 1.2) + m.achats;
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
        if (b.dataset.vue === 'affaires') { etat.cascadeAffaires = true; rendreListeAffaires(); }
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
            return '<div class="saisie' + (e.id === etat.saisieNeuve ? ' neuve' : '')
                + '"><div class="saisie-info">'
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
    // Historique : une ligne compacte par affaire, limitée à une période
    // (7 jours par défaut) et filtrable par recherche ; le détail des
    // saisies s'ouvre au clic sur la ligne.
    const PERIODES_HIST = [['7', '7 jours'], ['30', '30 jours'], ['tout', 'Tout']];
    function quandCourt(iso) {
        const j = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 864e5);
        if (j <= 0) return "aujourd'hui";
        if (j === 1) return 'hier';
        if (j < 7) return 'il y a ' + j + ' j';
        return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    }
    function rendreHistorique() {
        const conteneur = $('#listeHistorique');
        if (!conteneur) return;
        const admin = estAdmin();
        $('#titreHistorique').textContent = admin ? 'Historique' : 'Mon historique';
        conteneur.innerHTML = '<div class="hist-outils">'
            + '<div class="hist-periodes" role="group" aria-label="Période">' + PERIODES_HIST.map(p =>
                '<button type="button" data-h-periode="' + p[0] + '" aria-pressed="' + (etat.histPeriode === p[0]) + '">'
                + p[1] + '</button>').join('') + '</div>'
            + '<input type="search" id="histRecherche" placeholder="Rechercher une affaire ou un client" value="'
            + attr(etat.histRecherche) + '" aria-label="Rechercher dans l\x27historique">'
            + '</div><div id="histListe"></div>';
        $$('#listeHistorique [data-h-periode]').forEach(b => b.addEventListener('click', () => {
            etat.histPeriode = b.dataset.hPeriode;
            rendreHistorique();
        }));
        $('#histRecherche').addEventListener('input', ev => {
            etat.histRecherche = ev.target.value;
            rendreListeHistorique();
        });
        rendreListeHistorique();
    }

    function rendreListeHistorique() {
        const hote = $('#histListe');
        if (!hote) return;
        const admin = estAdmin();
        const limite = etat.histPeriode === 'tout' ? '' :
            new Date(Date.now() - parseInt(etat.histPeriode, 10) * 864e5).toISOString();
        const q = etat.histRecherche.trim().toLowerCase();

        const groupes = {};
        etat.entries.forEach(e => {
            if (limite && String(e.date) < limite) return;
            const a = etat.affaires.find(x => x.id === e.affaireId);
            if (!a) return;
            const st = stadeDe(a);
            if (st === 'terminee' || st === 'archivee') return;
            if (!admin && e.enteredBy && e.enteredBy !== etat.moi.name) return;
            if (q) {
                const c = etat.clients.find(x => x.id === a.clientId);
                if ((a.name + ' ' + (a.description || '') + ' ' + (c ? c.name : '')).toLowerCase().indexOf(q) === -1) return;
            }
            (groupes[e.affaireId] = groupes[e.affaireId] || []).push(e);
        });

        // les affaires pointées le plus récemment en premier
        const derniere = k => groupes[k].reduce((m, e) => String(e.date) > m ? String(e.date) : m, '');
        const cles = Object.keys(groupes).sort((x, y) => derniere(y).localeCompare(derniere(x)));
        const libPeriode = etat.histPeriode === 'tout' ? '' : ' ces ' + etat.histPeriode + ' derniers jours';
        if (!cles.length) {
            hote.innerHTML = '<div class="hist-vide">'
                + (q ? 'Aucune affaire ne correspond à « ' + esc(etat.histRecherche.trim()) + ' »' + libPeriode + '.'
                     : 'Aucune saisie sur les affaires en cours' + libPeriode + '.')
                + (etat.histPeriode !== 'tout'
                    ? ' <button type="button" class="lien-btn" data-h-periode-vide="' + (etat.histPeriode === '7' ? '30' : 'tout') + '">'
                      + (etat.histPeriode === '7' ? 'Voir 30 jours' : 'Tout voir') + '</button>' : '')
                + '</div>';
            const b = hote.querySelector('[data-h-periode-vide]');
            if (b) b.addEventListener('click', () => { etat.histPeriode = b.dataset.hPeriodeVide; rendreHistorique(); });
            return;
        }

        // une saisie qui vient d'être faite ouvre son affaire
        if (etat.saisieNeuve) {
            const neuve = etat.entries.find(e => e.id === etat.saisieNeuve);
            if (neuve) etat.histOuverts[neuve.affaireId] = true;
        }

        const PAR_DEFAUT = 5;
        let totalPeriode = 0;
        hote.innerHTML = '<div class="hist-liste">' + cles.map(k => {
            const a = etat.affaires.find(x => x.id === k);
            const c = etat.clients.find(x => x.id === a.clientId);
            const liste = groupes[k].slice().sort((x, y) => String(y.date).localeCompare(String(x.date)));
            const total = liste.reduce((s, e) => s + (parseFloat(e.hours) || 0), 0);
            totalPeriode += total;
            const ouvert = !!etat.histOuverts[k];
            const tout = !!etat.histTout[k];
            const visibles = tout ? liste : liste.slice(0, PAR_DEFAUT);

            const parPoste = {};
            liste.forEach(e => {
                const p = etat.postes.find(x => x.id === e.posteId);
                const nom = p ? p.name : 'Poste inconnu';
                parPoste[nom] = (parPoste[nom] || 0) + (parseFloat(e.hours) || 0);
            });

            return '<div class="hist' + (ouvert ? ' ouvert' : '') + '">'
                + '<button type="button" class="hist-ligne" data-h-toggle="' + attr(k) + '" aria-expanded="' + ouvert + '">'
                + '<span class="hist-id"><span class="hist-nom">' + esc(a.name) + '</span>'
                + '<span class="hist-client">' + esc(c ? c.name : '') + '</span></span>'
                + '<span class="hist-quand">' + quandCourt(liste[0].date) + '</span>'
                + '<span class="hist-total">' + h1(total) + ' h</span>'
                + '<svg class="hist-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>'
                + '</button>'
                + (ouvert
                    ? '<div class="hist-saisies">'
                    + (a.description ? '<div class="hist-desc">' + esc(a.description) + '</div>' : '')
                    + '<div class="chips">' + Object.keys(parPoste).map(n =>
                        '<span class="chip">' + esc(n) + ' · ' + h1(parPoste[n]) + ' h</span>').join('') + '</div>'
                    + visibles.map(e => {
                        const p = etat.postes.find(x => x.id === e.posteId);
                        const quand = new Date(e.date).toLocaleDateString('fr-FR',
                            { day: '2-digit', month: '2-digit', year: 'numeric' });
                        const mienne = admin || e.enteredBy === etat.moi.name;
                        return '<div class="saisie' + (e.id === etat.saisieNeuve ? ' neuve' : '')
                            + '"><div class="saisie-info">'
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
                    + (liste.length > PAR_DEFAUT
                        ? '<button type="button" class="hist-plus" data-h-tout="' + attr(k) + '">'
                          + (tout ? 'Afficher seulement les ' + PAR_DEFAUT + ' dernières'
                                  : 'Voir les ' + (liste.length - PAR_DEFAUT) + ' autres saisies')
                          + '</button>'
                        : '')
                    + '</div>'
                    : '')
                + '</div>';
        }).join('') + '</div>'
            + '<div class="hist-resume">' + cles.length + (cles.length > 1 ? ' affaires' : ' affaire')
            + (libPeriode ? ' sur ' + etat.histPeriode + ' jours' : '') + ' · ' + h1(totalPeriode) + ' h</div>';

        $$('#histListe [data-h-toggle]').forEach(b => b.addEventListener('click', () => {
            const k = b.dataset.hToggle;
            etat.histOuverts[k] = !etat.histOuverts[k];
            rendreListeHistorique();
        }));
        $$('#histListe [data-h-tout]').forEach(b => b.addEventListener('click', () => {
            const k = b.dataset.hTout;
            etat.histTout[k] = !etat.histTout[k];
            rendreListeHistorique();
        }));
        $$('#histListe [data-h-modif]').forEach(b => b.addEventListener('click', () => {
            const e = etat.entries.find(x => x.id === b.dataset.hModif);
            if (e) ouvrirSaisie({ edition: e });
        }));
        $$('#histListe [data-h-suppr]').forEach(b => b.addEventListener('click', async () => {
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
        // depuis la croix, la fenetre jaillit du bouton ; depuis une ligne
        // (reprise, modification), elle garde son arrivee habituelle
        $('#scrimSaisie').classList.toggle('depuis-fab', !!opts.depuisFab);

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
    $('#fab').addEventListener('click', () => {
        const fab = $('#fab');
        fab.classList.remove('appuye');
        void fab.offsetWidth; // relance l'animation a chaque appui
        fab.classList.add('appuye');
        setTimeout(() => fab.classList.remove('appuye'), 620);
        ouvrirSaisie({ depuisFab: true });
    });

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
                const neuve = await api('/entries', 'POST', {
                    affaireId: affaireId, posteId: posteId,
                    hours: heures, enteredBy: etat.moi.name
                });
                if (neuve && neuve.id) {
                    etat.saisieNeuve = neuve.id;
                    setTimeout(() => { etat.saisieNeuve = null; }, 2000);
                }
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
        const prec = etat._couloirPrec || null;
        const compte = {};
        $('#couloir').innerHTML = STADES.map(s => {
            const n = etat.affaires.filter(a => stadeDe(a) === s.k).length;
            compte[s.k] = n;
            const bouge = prec && prec[s.k] !== undefined && prec[s.k] !== n;
            return '<button class="couloir-etape c-' + s.k + (etat.filtre === s.k ? ' is-on' : '')
                + '" data-stade="' + s.k + '">'
                + '<div class="couloir-n' + (bouge ? ' bondit' : '') + '">' + n + '</div>'
                + '<div class="couloir-lab">' + s.lab + '</div></button>';
        }).join('');
        etat._couloirPrec = compte;
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
                + '<span class="e neutre">' + eur(prixReelAffaire(a)) + ' réel</span></div>';
        } else if (stade === 'brouillon' || stade === 'envoye') {
            bas = '<div class="carte-chiffres"><span>devis <b>' + h1(bud) + ' h</b></span>'
                + '<span class="e neutre">' + eur(prixDevis(d)) + '</span></div>'
                + '<div class="carte-note">'
                + (stade === 'brouillon' ? 'chiffrage en cours'
                    : (d.reponseClient && d.reponseClient.action === 'refuse'
                        ? 'refusé par le client' : 'en attente de réponse client'))
                + '</div>';
        } else if (bud === 0 && montantsDevis(d).achats === 0) {
            // devis present mais encore vide : le prix réel remplace une
            // barre 100 % rouge trompeuse
            bas = '<div class="carte-chiffres"><span>pointé <b>' + h1(reel) + ' h</b></span>'
                + '<span class="e neutre">' + eur(prixReelAffaire(a)) + ' réel</span></div>';
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
                + '<div class="carte-note">devis ' + eur(prixDevis(d))
                + ' · réel ' + eur(prixReelAffaire(a)) + '</div>';
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
        // cascade uniquement a l arrivee sur la vue, jamais sur les
        // rafraichissements de la synchronisation periodique
        if (etat.cascadeAffaires) {
            etat.cascadeAffaires = false;
            const hote = $('#listeAffaires');
            hote.classList.add('entree');
            clearTimeout(etat._cascadeT);
            etat._cascadeT = setTimeout(() => hote.classList.remove('entree'), 800);
        }
        majBadgeAffaires();

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
                const ids = etat.affaires.filter(a => stadeDe(a) === 'terminee').map(a => a.id);
                const cartes = $$('#listeAffaires [data-fiche]')
                    .filter(c2 => ids.indexOf(c2.dataset.fiche) !== -1);
                if (!matchMedia('(prefers-reduced-motion: reduce)').matches && cartes.length) {
                    cartes.forEach((c2, i) => {
                        c2.style.animationDelay = Math.min(i * 60, 420) + 'ms';
                        c2.classList.add('sen-va');
                    });
                    await new Promise(res2 => setTimeout(res2,
                        Math.min(380 + cartes.length * 60, 850)));
                }
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

    // Les chiffres comptent : à l'ouverture d'une fiche, les tuiles de
    // synthèse montent jusqu'à leur valeur, les jauges se remplissent,
    // et un dépassement pulse une fois.
    function animerChiffresFiche() {
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const cibles = [];
        $$('#ficheContenu .si-val, #ficheContenu .case-val').forEach(el => {
            if (el.querySelector('input')) return;
            const m = el.textContent.trim()
                .match(/^([+\-−]?)([\d\s  ]+(?:,(\d+))?)([^\d]*)$/);
            if (!m) return;
            const val = parseFloat(m[2].replace(/[\s  ]/g, '').replace(',', '.'));
            if (!isFinite(val) || val === 0) return;
            cibles.push({ el: el, html: el.innerHTML, signe: m[1], val: val,
                dec: m[3] ? m[3].length : 0, suffixe: m[4] || '' });
        });
        const jauges = $$('#ficheContenu .mini .fill').map(f => {
            const largeur = f.style.width;
            f.style.transition = 'none';
            f.style.width = '0%';
            return { el: f, largeur: largeur };
        });
        const debut = Date.now(), duree = 850;
        const pas = () => {
            const p = Math.min(1, (Date.now() - debut) / duree);
            const e2 = 1 - Math.pow(1 - p, 3);
            cibles.forEach(c => {
                if (p >= 1) { c.el.innerHTML = c.html; return; }
                c.el.textContent = c.signe + (c.val * e2).toLocaleString('fr-FR',
                    { minimumFractionDigits: c.dec, maximumFractionDigits: c.dec }) + c.suffixe;
            });
            if (p < 1) { requestAnimationFrame(pas); return; }
            jauges.forEach(j => {
                if (j.el.classList.contains('depasse')) {
                    j.el.classList.add('clignote');
                    setTimeout(() => j.el.classList.remove('clignote'), 800);
                }
            });
        };
        requestAnimationFrame(() => {
            jauges.forEach(j => {
                j.el.style.transition = 'width .8s cubic-bezier(.22,.9,.3,1)';
                j.el.style.width = j.largeur;
            });
            pas();
        });
    }

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
        if (achatsReelsEnAttente) await enregistrerAchatsReels();
        if (devisEnAttente) await enregistrerDevis();
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
            etat.achatsReelsLocal = (synthese.achatsReels || []).map(x => Object.assign({}, x));
            rendreFiche();
            const fc = $('#ficheContenu');
            fc.classList.add('entree');
            setTimeout(() => fc.classList.remove('entree'), 750);
            animerChiffresFiche();
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
        // hors chiffrage, rien à comparer — la fiche montre seulement le
        // prix de vente réel (heures pointées et achats réels).
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

        /* ── achats prévus au devis ── */
        let achatsHtml = '';
        if (d && !enRegie) {
            achatsHtml = '<div class="bloc"><div class="titre"><h2>'
                + (enChiffrage ? 'Achats &amp; fournitures' : 'Achats &amp; fournitures prévus au devis') + '</h2>'
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
                + '</div>';
        }

        /* ── achats réellement faits (hors chiffrage) ── */
        let achatsReelsHtml = '';
        if (!enChiffrage) {
            const liste = etat.achatsReelsLocal || [];
            achatsReelsHtml = '<div class="bloc"><div class="titre"><h2>Achats &amp; fournitures réels</h2>'
                + '<span class="tot" id="fTotAchatsReels">' + eur(totalAchats(liste)) + '</span></div>'
                + (liste.length
                    ? '<div class="tbl"><table><thead><tr>'
                      + '<th>Désignation</th><th>Fournisseur</th>'
                      + '<th class="c">Quantité</th><th class="c">Prix unitaire</th><th class="c">Montant</th><th></th>'
                      + '</tr></thead><tbody>'
                      + liste.map((ac, i) =>
                          '<tr>'
                          + '<td class="txt"><input type="text" list="dlAchatsBib" value="' + attr(ac.nom)
                          + '" placeholder="Désignation" data-areel="nom" data-i="' + i + '"></td>'
                          + '<td class="txt"><input type="text" list="dlFournisseurs" value="' + attr(ac.fournisseur || '')
                          + '" placeholder="Fournisseur" data-areel="fournisseur" data-i="' + i + '"></td>'
                          + '<td class="qte"><input type="number" min="0" step="1" value="'
                          + (parseFloat(ac.quantite) || '') + '" placeholder="0" data-areel="quantite" data-i="' + i + '"></td>'
                          + '<td class="qte"><input type="number" min="0" step="0.01" value="'
                          + (parseFloat(ac.prixUnit) || '') + '" placeholder="0" data-areel="prixUnit" data-i="' + i + '"></td>'
                          + '<td class="eur" style="color:var(--ink);" data-fareur="' + i + '">'
                          + eur((parseFloat(ac.quantite) || 0) * (parseFloat(ac.prixUnit) || 0)) + '</td>'
                          + '<td style="text-align:right;"><button class="btn btn-sm btn-danger" '
                          + 'data-suppr-areel="' + i + '" aria-label="Supprimer">✕</button></td></tr>').join('')
                      + '</tbody></table></div>'
                    : '<p style="margin:0;color:var(--ink-dim);font-size:13px;">'
                      + 'Aucun achat enregistré sur cette affaire.</p>')
                + '<div style="margin-top:11px;"><button class="btn btn-sm" data-ajout-areel>'
                + 'Ajouter un achat</button></div>'
                + '</div>';
        }

        const datalists = '<datalist id="dlFournisseurs">'
            + etat.fournisseursBib.map(f => '<option value="' + attr(f) + '"></option>').join('')
            + '</datalist><datalist id="dlAchatsBib">'
            + etat.achatsBib.map(n => '<option value="' + attr(n) + '"></option>').join('')
            + '</datalist>';

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
            + achatsReelsHtml
            + datalists
            + syntheseHtml(a, d, enChiffrage, enRegie, modifiable);

        brancherFiche(a, d, modifiable);
    }

    function totalAchats(liste) {
        return (liste || []).reduce((s, x) =>
            s + (parseFloat(x.quantite) || 0) * (parseFloat(x.prixUnit) || 0), 0);
    }

    // Montants de la fiche, recalculés côté client à chaque frappe.
    // La marge (coefficient) ne s'applique qu'aux heures ; les achats et
    // fournitures sont comptés à leur prix.
    function calcPrixFiche(a, d) {
        const coeff = coeffAffaire(a, d);
        const md = montantsDevis(d);
        const tauxDevis = {};
        if (d && d.data) {
            (d.data.travail || []).concat(d.data.machine || []).forEach(l => {
                if (tauxDevis[l.nom] === undefined) tauxDevis[l.nom] = parseFloat(l.taux) || 0;
            });
        }
        const s = etat.syntheseLocale;
        const heuresReel = ((s && s.postes) || []).reduce((t, p) =>
            t + p.reelHeures * (tauxDevis[p.nom] !== undefined ? tauxDevis[p.nom] : p.reelTaux), 0);
        const achatsReel = totalAchats(etat.achatsReelsLocal);
        return {
            coeff: coeff,
            devisHeures: md.heures * coeff,
            devisAchats: md.achats,
            prixDevis: md.heures * coeff + md.achats,
            margeDevis: md.heures * (coeff - 1),
            reelHeures: heuresReel * coeff,
            reelAchats: achatsReel,
            prixReel: heuresReel * coeff + achatsReel
        };
    }

    function syntheseHtml(a, d, enChiffrage, enRegie, modifiable) {
        const c = calcPrixFiche(a, d);
        const tuile = (cls2, lab, id, val, sousId, sous) =>
            '<div class="si ' + cls2 + '"' + (id ? ' id="' + id + 'Tile"' : '') + '>'
            + '<div class="si-lab">' + lab + '</div>'
            + '<div class="si-val" id="' + id + '">' + val + '</div>'
            + (sousId ? '<div class="si-sous" id="' + sousId + '">' + sous + '</div>' : '')
            + '</div>';
        const coeffHtml = d
            ? '<div class="syn-coeff"><span>Coefficient de marge sur les heures</span>'
              + '<input type="number" step="0.05" min="1" value="' + c.coeff + '" data-devis="coeffMarge"'
              + (modifiable ? '' : ' disabled') + '>'
              + (modifiable ? '' : '<span>— verrouillé avec le devis</span>') + '</div>'
            : '<div class="syn-coeff"><span>Coefficient de marge sur les heures</span>'
              + '<input type="number" step="0.05" min="1" value="' + c.coeff + '" data-coeff-regie></div>';
        const note = '<p class="syn-note">Achats et fournitures comptés à leur prix, sans marge.</p>';

        if (enChiffrage) {
            return '<div class="bloc"><div class="titre"><h2>Synthèse financière</h2></div><div class="syn">'
                + tuile('', 'Heures, marge comprise', 'fSynHeures', eur(c.devisHeures))
                + tuile('', 'Achats &amp; fournitures', 'fSynAchats', eur(c.devisAchats))
                + tuile('prix', 'Prix de vente HT', 'fSynPrix', eur(c.prixDevis))
                + tuile('marge', 'Marge sur les heures', 'fSynMarge', eur(c.margeDevis))
                + '</div>' + coeffHtml + note + '</div>';
        }
        if (d && !enRegie) {
            const ec = ecartPrix(c);
            return '<div class="bloc"><div class="titre"><h2>Synthèse financière</h2></div><div class="syn">'
                + tuile('', 'Devis initial HT', 'fPrixDevis', eur(c.prixDevis),
                    'fPrixDevisDet', detailPrix(c.devisHeures, c.devisAchats))
                + tuile('pointe', 'Heures pointées, marge comprise', 'fReelHeures', eur(c.reelHeures),
                    'fReelHeuresDet', h1(etat.syntheseLocale.totaux.reelHeures) + ' h pointées')
                + tuile('', 'Achats &amp; fournitures réels', 'fReelAchats', eur(c.reelAchats))
                + tuile('prix', 'Prix de vente réel HT', 'fPrixReel', eur(c.prixReel),
                    'fEcartPrix', ec.texte)
                + '</div>' + coeffHtml + note + '</div>';
        }
        // affaire sans devis (ou devis vide) : le prix réel seul
        return '<div class="bloc"><div class="titre"><h2>Prix de vente</h2></div><div class="syn">'
            + tuile('pointe', 'Heures pointées', 'fReelH', h1(etat.syntheseLocale.totaux.reelHeures) + ' h')
            + tuile('', 'Heures, marge comprise', 'fReelHeures', eur(c.reelHeures))
            + tuile('', 'Achats &amp; fournitures réels', 'fReelAchats', eur(c.reelAchats))
            + tuile('prix', 'Prix de vente réel HT', 'fPrixReel', eur(c.prixReel))
            + '</div>' + coeffHtml + note + '</div>';
    }

    function detailPrix(heures, achats) {
        return 'heures ' + eur(heures) + ' + achats ' + eur(achats);
    }
    function ecartPrix(c) {
        const e = c.prixReel - c.prixDevis;
        if (Math.abs(e) < 0.005) return { texte: 'identique au devis' };
        return {
            texte: (e > 0 ? '+' : '−') + eur(Math.abs(e)) + (e > 0 ? ' au-dessus' : ' en dessous')
                + ' du devis' + (c.prixDevis > 0 ? ' (' + (e > 0 ? '+' : '−')
                + Math.round(Math.abs(e) / c.prixDevis * 100) + ' %)' : '')
        };
    }

    // Met à jour les tuiles de la synthèse sans reconstruire la fiche
    function majPrixFiche() {
        const a = etat.affaires.find(x => x.id === etat.ficheId);
        if (!a) return;
        const c = calcPrixFiche(a, etat.devisLocal);
        const pose = (id2, txt) => { const el = document.getElementById(id2); if (el) el.textContent = txt; };
        pose('fSynHeures', eur(c.devisHeures));
        pose('fSynAchats', eur(c.devisAchats));
        pose('fSynPrix', eur(c.prixDevis));
        pose('fSynMarge', eur(c.margeDevis));
        pose('fPrixDevis', eur(c.prixDevis));
        pose('fPrixDevisDet', detailPrix(c.devisHeures, c.devisAchats));
        pose('fReelHeures', eur(c.reelHeures));
        pose('fReelAchats', eur(c.reelAchats));
        pose('fPrixReel', eur(c.prixReel));
        pose('fEcartPrix', ecartPrix(c).texte);
        pose('fTotAchatsReels', eur(c.reelAchats));
    }

    /* ── enregistrement des achats réels de la fiche ── */
    // L'affaire visée est retenue au moment de la frappe (pas à l'envoi) et
    // un compteur de version évite d'écraser une frappe faite pendant l'envoi.
    let minuteurAchatsReels = null;
    let achatsReelsEnAttente = false;
    let achatsCible = null, versionAchats = 0;
    function programmerAchatsReels() {
        achatsReelsEnAttente = true;
        achatsCible = etat.ficheId;
        versionAchats++;
        etatSauve('Modifié...', 'encours');
        clearTimeout(minuteurAchatsReels);
        minuteurAchatsReels = setTimeout(enregistrerAchatsReels, 800);
    }
    async function enregistrerAchatsReels() {
        clearTimeout(minuteurAchatsReels);
        if (!achatsReelsEnAttente || !achatsCible) return;
        const id = achatsCible, version = versionAchats;
        const liste = (etat.achatsReelsLocal || []).map(x => Object.assign({}, x));
        try {
            etatSauve('Enregistrement...', 'encours');
            const r = await api('/affaires/' + id + '/achats', 'PUT', { achats: liste });
            etat.achatsReels[id] = totalAchats(r.achats);
            if (version !== versionAchats) return; // une frappe plus récente partira ensuite
            if (etat.ficheId === id) etat.achatsReelsLocal = r.achats;
            achatsReelsEnAttente = false;
            etatSauve('Enregistré à ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
        } catch (err) {
            etatSauve('Échec de l\'enregistrement', 'erreur');
            toast(err.message, true);
        }
    }

    /* ── enregistrement du devis de la fiche ── */
    let minuteurDevis = null;
    let devisEnAttente = false; // une modification locale attend son PUT
    let devisCible = null, versionDevis = 0;
    function etatSauve(texte, classe) {
        const el = $('#etatSauve');
        if (!el) return;
        el.textContent = texte;
        el.className = 'etat-sauve' + (classe ? ' ' + classe : '');
    }
    function programmerEnregistrement() {
        devisEnAttente = true;
        devisCible = etat.ficheId;
        versionDevis++;
        etatSauve('Modifié...', 'encours');
        clearTimeout(minuteurDevis);
        minuteurDevis = setTimeout(enregistrerDevis, 800);
    }
    async function enregistrerDevis() {
        clearTimeout(minuteurDevis);
        const d = etat.devisLocal;
        if (!d) return;
        const id = devisEnAttente && devisCible ? devisCible : etat.ficheId;
        const version = versionDevis;
        try {
            etatSauve('Enregistrement...', 'encours');
            const sauve = await api('/devis/' + id, 'PUT', JSON.parse(JSON.stringify({
                client: d.client, numCommande: d.numCommande, affaire: d.affaire,
                date: d.date, coeffMarge: d.coeffMarge, data: d.data,
                noteClient: d.noteClient, delai: d.delai,
                reglement: d.reglement, echeances: d.echeances,
                interlocuteurId: d.interlocuteurId || ''
            })));
            etat.devis[id] = sauve;
            if (version !== versionDevis) return; // une frappe plus récente partira ensuite
            if (etat.ficheId === id) etat.devisLocal = sauve;
            devisEnAttente = false;
            const heure = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            etatSauve('Enregistré à ' + heure);
            const es = $('#etatSauve');
            if (es) {
                es.classList.remove('pulse');
                void es.offsetWidth;
                es.classList.add('pulse');
            }
        } catch (err) {
            etatSauve('Échec de l\'enregistrement', 'erreur');
            toast(err.message, true);
        }
    }

    // Si l onglet se ferme ou passe en arriere-plan avant la fin du delai
    // d enregistrement (800 ms), le PUT partirait dans le vide : on l envoie
    // immediatement en keepalive pour ne rien perdre.
    window.addEventListener('pagehide', () => {
        if (achatsReelsEnAttente && achatsCible) {
            clearTimeout(minuteurAchatsReels);
            try {
                fetch(API + '/affaires/' + achatsCible + '/achats', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ achats: etat.achatsReelsLocal || [] }),
                    keepalive: true
                });
            } catch (e) { /* le prochain chargement retombera sur le serveur */ }
        }
        if (!devisEnAttente || !etat.devisLocal || !devisCible) return;
        clearTimeout(minuteurDevis);
        const d = etat.devisLocal;
        try {
            fetch(API + '/devis/' + devisCible, {
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
            etat.achatsReelsLocal = (synthese.achatsReels || []).map(x => Object.assign({}, x));
            if (devis) etat.devis[etat.ficheId] = devis;
            rendreFiche();
        } catch (e) { /* on garde l affichage actuel */ }
    }
    window.addEventListener('focus', () => {
        if (!etat.moi || etat.vue !== 'fiche' || !etat.ficheId) return;
        if (devisEnAttente || achatsReelsEnAttente) return; // la saisie locale prime
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

        // achats réels de l'affaire
        $$('#ficheContenu [data-areel]').forEach(inp => inp.addEventListener('change', () => {
            const i = parseInt(inp.dataset.i, 10);
            const cle = inp.dataset.areel;
            if (!etat.achatsReelsLocal[i]) return;
            etat.achatsReelsLocal[i][cle] =
                (cle === 'quantite' || cle === 'prixUnit') ? (parseFloat(inp.value) || 0) : inp.value;
            const c2 = document.querySelector('[data-fareur="' + i + '"]');
            if (c2) c2.textContent = eur((parseFloat(etat.achatsReelsLocal[i].quantite) || 0)
                * (parseFloat(etat.achatsReelsLocal[i].prixUnit) || 0));
            programmerAchatsReels();
            majPrixFiche();
        }));
        $$('#ficheContenu [data-suppr-areel]').forEach(b => b.addEventListener('click', () => {
            etat.achatsReelsLocal.splice(parseInt(b.dataset.supprAreel, 10), 1);
            programmerAchatsReels();
            rendreFiche();
        }));
        const ajAreel = document.querySelector('#ficheContenu [data-ajout-areel]');
        if (ajAreel) ajAreel.addEventListener('click', () => {
            etat.achatsReelsLocal = etat.achatsReelsLocal || [];
            etat.achatsReelsLocal.push({ nom: '', fournisseur: '', quantite: 1, prixUnit: 0 });
            rendreFiche();
            const champs = $$('#ficheContenu [data-areel="nom"]');
            if (champs.length) champs[champs.length - 1].focus();
        });

        // coefficient d'une affaire sans devis : recalcul immédiat,
        // enregistrement sur l'affaire en arrière-plan
        const coeffRegieInp = document.querySelector('#ficheContenu [data-coeff-regie]');
        if (coeffRegieInp) coeffRegieInp.addEventListener('change', async () => {
            a.coeffRegie = parseFloat(coeffRegieInp.value) || 1.2;
            majPrixFiche();
            try {
                await api('/affaires/' + a.id, 'PUT', { coeffRegie: a.coeffRegie });
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
                const pasActif = document.querySelector('#ficheContenu .pas.actif');
                if (pasActif) pasActif.classList.add('bascule');
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
    // On n'attend pas le serveur : les totaux doivent suivre la frappe.
    // Les heures pointées, elles, ne bougent pas pendant qu'on chiffre :
    // on garde celles de la synthèse chargée.
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
        pose('fTotHeures', eur(m2.heures));
        pose('fTotAchats', eur(m2.achats));
        pose('fTotB', h1(bud));
        pose('fTotEur', eur(m2.heures));
        const totEc = document.getElementById('fTotEc');
        if (totEc) { totEc.textContent = sgn(ecart, h1); totEc.className = 'ec ' + cE; }
        majPrixFiche();
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

    /* Gestion : sous-navigation groupée (menu à gauche ; au téléphone, page
       d'accueil dont chaque section s'ouvre en plein écran) + panneau de travail. */
    const SVG_G = {
        ent: '<svg viewBox="0 0 24 24"><path d="M4 21V5l8-3 8 3v16M9 21v-5h6v5M8 9h1M15 9h1M8 13h1M15 13h1"/></svg>',
        cli: '<svg viewBox="0 0 24 24"><path d="M3 21h18M5 21V8l7-4 7 4v13M9 21v-6h6v6"/></svg>',
        usr: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.6.8 2.6 2.5 3 5.2"/></svg>',
        pos: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>',
        bib: '<svg viewBox="0 0 24 24"><path d="M4 5h5v15H4zM10 5h5v15h-5zM16 6l3.5-1 3 14-3.5 1z"/></svg>',
        chev: '<svg viewBox="0 0 24 24" class="gx-chev"><path d="m9 6 6 6-6 6"/></svg>',
        plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
        dots: '<svg viewBox="0 0 24 24" class="gx-dots"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
        poignee: '<svg viewBox="0 0 10 20" class="gx-poignee-svg"><circle cx="3" cy="4" r="1.5"/><circle cx="7" cy="4" r="1.5"/><circle cx="3" cy="10" r="1.5"/><circle cx="7" cy="10" r="1.5"/><circle cx="3" cy="16" r="1.5"/><circle cx="7" cy="16" r="1.5"/></svg>'
    };
    const JOUR_MS = 864e5;
    const joursDepuis = iso => iso ? Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / JOUR_MS) : Infinity;
    function depuisQuand(iso) {
        const j = joursDepuis(iso);
        if (j === Infinity) return null;
        if (j <= 0) return "aujourd'hui";
        if (j === 1) return 'hier';
        if (j < 30) return 'il y a ' + j + ' j';
        if (j < 365) return 'il y a ' + Math.round(j / 30) + ' mois';
        return 'il y a plus d\x27un an';
    }
    const clientIncomplet = c => !c.adresse || !c.tva;
    const utilisateursAtelier = () => etat.users.filter(u => u.name !== 'Admin');
    function sectionsGestion() {
        return [
            { groupe: 'Entreprise', items: [
                { k: 'entreprise', ico: SVG_G.ent, t: 'Coordonnées & devis', s: 'Ce qui figure sur vos devis' }] },
            { groupe: 'Personnes', items: [
                { k: 'clients', ico: SVG_G.cli, t: 'Clients',
                  s: etat.clients.length + ' clients · ' + etat.clients.filter(c =>
                      etat.affaires.some(a => a.clientId === c.id && stadeDe(a) === 'en_cours')).length + ' actifs',
                  alerte: etat.clients.some(clientIncomplet) },
                { k: 'utilisateurs', ico: SVG_G.usr, t: 'Utilisateurs', s: utilisateursAtelier().length + ' comptes atelier' }] },
            { groupe: 'Atelier', items: [
                { k: 'postes', ico: SVG_G.pos, t: 'Postes & taux',
                  s: etat.postes.filter(p => !p.isMachine).length + ' main-d\x27œuvre · ' + etat.postes.filter(p => p.isMachine).length + ' machines' },
                { k: 'biblio', ico: SVG_G.bib, t: 'Achats & fournisseurs',
                  s: (etat.achatsBib.length + etat.fournisseursBib.length) + ' libellés proposés' }] }
        ];
    }
    const PANNEAUX_GESTION = {};
    function rendreGestion() {
        if (!PANNEAUX_GESTION[etat.ongletGestion]) etat.ongletGestion = 'postes';
        const actif = etat.ongletGestion;
        $('#gestionContenu').innerHTML = '<div class="gx' + (etat.gestionDetail ? ' detail' : '') + '">'
            + '<nav class="gx-nav" aria-label="Sections de Gestion">' + sectionsGestion().map(g =>
                '<div class="gx-groupe"><div class="eyebrow">' + g.groupe + '</div>' + g.items.map(i =>
                    '<button type="button" class="gx-lien" data-gsection="' + i.k + '"' + (i.k === actif ? ' aria-current="page"' : '') + '>'
                    + i.ico + '<span class="gx-lien-t"><b>' + i.t + '</b><small>' + esc(i.s) + '</small></span>'
                    + (i.alerte ? '<span class="gx-alerte" title="Informations à compléter"></span>' : '')
                    + SVG_G.chev + '</button>').join('') + '</div>').join('') + '</nav>'
            + '<div class="gx-panneau"><button type="button" class="gx-retour" data-gretour>‹ Gestion</button>'
            + PANNEAUX_GESTION[actif][0]() + '</div></div>';
        $$('#gestionContenu [data-gsection]').forEach(b => b.addEventListener('click', () => {
            etat.ongletGestion = b.dataset.gsection;
            etat.gestionDetail = true;
            rendreGestion();
            if (matchMedia('(max-width:720px)').matches) window.scrollTo(0, 0);
        }));
        $('#gestionContenu [data-gretour]').addEventListener('click', () => {
            etat.gestionDetail = false;
            rendreGestion();
        });
        PANNEAUX_GESTION[actif][1]();
    }
    function enteteGestion(titre, texte, action) {
        return '<div class="gx-tete"><div><h2>' + titre + '</h2><p>' + texte + '</p></div>' + (action || '') + '</div>';
    }

    /* ── Coordonnées & devis : formulaire + aperçu en direct de l'en-tête du devis ── */
    const CHAMPS_ENT = ['nom', 'forme', 'siret', 'tva', 'adresse', 'cp', 'ville', 'tel', 'site'];
    function panneauEntreprise() {
        const ent = etat.entreprise;
        const ch = (k, label, large) => '<div class="gx-champ' + (large ? ' large' : '') + '"><label for="ent_' + k + '">' + label + '</label>'
            + '<input type="text" id="ent_' + k + '" value="' + attr(ent[k] || '') + '" data-ent="' + k + '"></div>';
        return enteteGestion('Coordonnées & devis', 'Ces informations sont imprimées en tête de chaque devis envoyé au client.')
            + '<div class="gx-ent"><div class="gx-ent-form">'
            + '<fieldset class="gx-fs"><legend>Identité</legend>' + ch('nom', 'Raison sociale') + ch('forme', 'Forme juridique')
            + ch('siret', 'SIRET') + ch('tva', 'N° TVA')
            + '<div class="gx-depot">' + (ent.logo ? '<img src="' + attr(ent.logo) + '" alt="Logo actuel">' : '<span class="logo-somepre" style="width:110px"></span>')
            + '<p>Logo imprimé sur les devis (PNG ou SVG, 300 Ko max).</p>'
            + '<input type="file" id="fichierLogo" accept="image/png,image/jpeg,image/svg+xml" class="hidden">'
            + '<button type="button" class="btn btn-sm" id="btnLogo">Changer</button></div></fieldset>'
            + '<fieldset class="gx-fs"><legend>Coordonnées</legend>' + ch('adresse', 'Adresse', true) + ch('cp', 'Code postal')
            + ch('ville', 'Ville') + ch('tel', 'Téléphone') + ch('site', 'Site web') + '</fieldset>'
            + '<div class="gx-enr" id="barreEnt" hidden><span>Modifications non enregistrées</span>'
            + '<button type="button" class="btn btn-sm" id="btnAnnulerEnt">Annuler</button>'
            + '<button type="button" class="btn btn-arc btn-sm" id="btnEnregistrerEntreprise">Enregistrer</button></div>'
            + '</div><div class="gx-apercu"><div class="eyebrow">Aperçu sur le devis client</div><div class="gx-feuille" id="gxFeuille"></div></div></div>';
    }
    function apercuDevis() {
        const v = k => esc((($('#ent_' + k) || {}).value || '').trim());
        const exemple = Object.keys(etat.devis).map(k => etat.devis[k]).filter(d => d.affaire)
            .sort((x, y) => String(y.date).localeCompare(String(x.date)))[0];
        $('#gxFeuille').innerHTML = '<div class="gx-f-haut">'
            + (etat.entreprise.logo ? '<img src="' + attr(etat.entreprise.logo) + '" alt="">' : '<span></span>')
            + '<div class="gx-f-coord"><b>' + v('nom') + ' ' + v('forme') + '</b><br>' + v('adresse') + '<br>'
            + v('cp') + ' ' + v('ville') + (v('tel') ? '<br>Tél. ' + v('tel') : '') + (v('site') ? '<br>' + v('site') : '') + '</div></div><hr>'
            + '<div class="gx-f-titre">DEVIS ' + esc(exemple ? exemple.affaire : 'N°') + '</div>'
            + '<div>Client : ' + esc(exemple ? exemple.client : '—') + '</div>'
            + '<i style="width:92%"></i><i style="width:76%"></i><i style="width:84%"></i>'
            + '<div class="gx-f-pied">' + v('nom') + ' ' + v('forme') + (v('siret') ? ' · SIRET ' + v('siret') : '')
            + (v('tva') ? ' · TVA ' + v('tva') : '') + '</div>';
    }
    function brancherEntreprise() {
        const initial = {};
        CHAMPS_ENT.forEach(k => { initial[k] = etat.entreprise[k] || ''; });
        const majBarre = () => {
            $('#barreEnt').hidden = CHAMPS_ENT.every(k => $('#ent_' + k).value === initial[k]) && !etat.logoModifie;
        };
        apercuDevis();
        majBarre();
        $$('#gestionContenu [data-ent]').forEach(i2 => i2.addEventListener('input', () => { apercuDevis(); majBarre(); }));
        $('#btnAnnulerEnt').addEventListener('click', () => {
            etat.logoModifie = false;
            etat.entreprise = Object.assign({}, etat.entrepriseServeur || etat.entreprise);
            rendreGestion();
        });
        $('#btnLogo').addEventListener('click', () => $('#fichierLogo').click());
        $('#fichierLogo').addEventListener('change', () => {
            const f = $('#fichierLogo').files[0];
            if (!f) return;
            if (f.size > 300 * 1024) { toast('Logo trop lourd (300 Ko maximum)', true); return; }
            const lecteur = new FileReader();
            lecteur.onload = () => {
                // garder les champs saisis, remplacer seulement le logo
                if (!etat.entrepriseServeur) etat.entrepriseServeur = Object.assign({}, etat.entreprise);
                CHAMPS_ENT.forEach(k => { etat.entreprise[k] = $('#ent_' + k).value; });
                etat.entreprise.logo = lecteur.result;
                etat.logoModifie = true;
                rendreGestion();
            };
            lecteur.readAsDataURL(f);
        });
        $('#btnEnregistrerEntreprise').addEventListener('click', async () => {
            const corps = { logo: etat.entreprise.logo || '' };
            CHAMPS_ENT.forEach(k => { corps[k] = $('#ent_' + k).value.trim(); });
            try {
                const r = await api('/entreprise', 'POST', corps);
                etat.entreprise = r.entreprise;
                etat.entrepriseServeur = null;
                etat.logoModifie = false;
                rendreGestion();
                toast('Coordonnées enregistrées');
            } catch (err) { toast(err.message, true); }
        });
    }

    /* ── Clients : recherche, filtres, tableau + panneau du client ── */
    function statsClient(c) {
        const affaires = etat.affaires.filter(a => a.clientId === c.id);
        const ids = new Set(affaires.map(a => a.id));
        let heures = 0, derniere = '';
        etat.entries.forEach(e => {
            if (!ids.has(e.affaireId)) return;
            heures += parseFloat(e.hours) || 0;
            if (String(e.date) > derniere) derniere = String(e.date);
        });
        return { total: affaires.length, enCours: affaires.filter(a => stadeDe(a) === 'en_cours').length,
                 heures: heures, derniere: derniere || null };
    }
    const FILTRES_CLIENTS = [['tous', 'Tous'], ['actifs', 'Affaire en cours'], ['dormants', 'Sans activité depuis 3 mois']];
    function panneauClients() {
        const incomplets = etat.clients.filter(clientIncomplet).length;
        return enteteGestion('Clients', 'Retrouvez un client, ses affaires en cours et les informations reprises sur ses devis.',
                '<button type="button" class="btn btn-arc btn-sm" id="btnNouveauClient">' + SVG_G.plus + 'Nouveau client</button>')
            + (incomplets ? '<div class="gx-bandeau">⚠ <span><b>' + incomplets + (incomplets > 1 ? ' clients n\x27ont' : ' client n\x27a')
                + '</b> pas d\x27adresse ou de n° de TVA. Ces informations manquent sur leurs devis.</span></div>' : '')
            + '<div class="gx-outils"><input type="search" id="rechClients" placeholder="Rechercher un client" value="'
            + attr(etat.clientsRecherche) + '" aria-label="Rechercher un client">'
            + '<div class="gx-filtres">' + FILTRES_CLIENTS.map(f => '<button type="button" class="gx-filtre" data-cfiltre="' + f[0]
                + '" aria-pressed="' + (etat.clientsFiltre === f[0]) + '">' + f[1] + '</button>').join('') + '</div></div>'
            + '<div class="gx-clients' + (etat.clientOuvert ? ' avec-tiroir' : '') + '"><div class="gx-liste-clients" id="listeClientsG"></div>'
            + '<div id="tiroirClient"></div></div>';
    }
    function rendreListeClients() {
        const q = etat.clientsRecherche.trim().toLowerCase();
        const lignes = etat.clients.map(c => ({ c: c, s: statsClient(c) }))
            .filter(x => (!q || x.c.name.toLowerCase().indexOf(q) !== -1)
                && (etat.clientsFiltre === 'tous' || (etat.clientsFiltre === 'actifs' ? x.s.enCours > 0 : joursDepuis(x.s.derniere) > 90)))
            .sort((x, y) => String(y.s.derniere || '').localeCompare(String(x.s.derniere || '')) || x.c.name.localeCompare(y.c.name));
        const etatFiche = c => clientIncomplet(c) ? '<span class="gx-pastille warn">À compléter</span>' : '<span class="gx-pastille ok">Complète</span>';
        $('#listeClientsG').innerHTML = lignes.length
            ? '<div class="gx-table"><table><thead><tr><th>Client</th><th class="d">En cours</th><th class="d">Affaires</th>'
              + '<th class="d">Heures pointées</th><th>Dernière activité</th><th>Fiche</th></tr></thead><tbody>'
              + lignes.map(x => '<tr data-gclient="' + attr(x.c.id) + '" tabindex="0" aria-selected="' + (etat.clientOuvert === x.c.id) + '">'
                + '<td class="gx-cnom">' + esc(x.c.name) + '</td>'
                + '<td class="d">' + (x.s.enCours ? '<span class="gx-pastille arc">' + x.s.enCours + '</span>' : '<span class="gx-vide">—</span>') + '</td>'
                + '<td class="d">' + x.s.total + '</td>'
                + '<td class="d">' + (x.s.heures ? h1(x.s.heures) + ' h' : '<span class="gx-vide">—</span>') + '</td>'
                + '<td>' + (depuisQuand(x.s.derniere) || '<span class="gx-vide">aucune</span>') + '</td>'
                + '<td>' + etatFiche(x.c) + '</td></tr>').join('') + '</tbody></table></div>'
              + '<div class="gx-cartes">' + lignes.map(x => '<button type="button" class="gx-ccarte" data-gclient="' + attr(x.c.id) + '">'
                + '<span class="gx-ccarte-t"><b>' + esc(x.c.name) + '</b><span>' + (x.s.enCours ? x.s.enCours + ' en cours · ' : '')
                + x.s.total + (x.s.total > 1 ? ' affaires' : ' affaire') + ' · ' + (depuisQuand(x.s.derniere) || 'aucune activité') + '</span></span>'
                + etatFiche(x.c) + '</button>').join('') + '</div>'
            : '<div class="gx-vide-bloc">Aucun client ne correspond.</div>';
        $$('#listeClientsG [data-gclient]').forEach(r => {
            r.addEventListener('click', () => ouvrirTiroirClient(r.dataset.gclient));
            r.addEventListener('keydown', ev => { if (ev.key === 'Enter') ouvrirTiroirClient(r.dataset.gclient); });
        });
    }
    function ouvrirTiroirClient(id) {
        const c = etat.clients.find(x => x.id === id);
        if (!c) { etat.clientOuvert = null; return; }
        etat.clientOuvert = id;
        etat.ficheClientId = id; // pour la modale des interlocuteurs
        const s = statsClient(c);
        const contacts = c.contacts || [];
        document.querySelector('.gx-clients').classList.add('avec-tiroir');
        $('#tiroirClient').innerHTML = '<div class="gx-tiroir"><div class="gx-tiroir-tete"><h3>' + esc(c.name) + '</h3>'
            + '<button type="button" class="gx-fermer" id="fermerTiroir" aria-label="Fermer">×</button></div>'
            + '<div class="gx-chiffres"><div><b>' + s.enCours + '</b><span>en cours</span></div><div><b>' + s.total
            + '</b><span>affaires</span></div><div><b>' + Math.round(s.heures) + '</b><span>heures</span></div></div>'
            + '<div class="gx-champ"><label for="tcAdresse">Adresse</label><input id="tcAdresse" placeholder="À compléter : imprimée sur le devis" value="' + attr(c.adresse || '') + '"></div>'
            + '<div class="gx-champ"><label for="tcTva">N° TVA intracommunautaire</label><input id="tcTva" placeholder="À compléter" value="' + attr(c.tva || '') + '"></div>'
            + '<div><div class="eyebrow" style="margin-bottom:6px">Interlocuteurs</div>'
            + (contacts.length ? '<div class="gx-contacts">' + contacts.map((p, i) => '<button type="button" class="gx-contact" data-tcontact="' + i + '">'
                + '<b>' + esc(p.nom) + '</b><span>' + esc([p.fonction, p.email, p.tel].filter(Boolean).join(' · ') || 'Aucune coordonnée') + '</span></button>').join('') + '</div>' : '')
            + '<button type="button" class="btn btn-sm gx-ajout-contact" id="tcAjoutContact">' + SVG_G.plus + 'Ajouter un interlocuteur</button></div>'
            + '<div class="gx-tiroir-actions"><button type="button" class="btn btn-sm" id="tcFiche">Fiche complète et affaires</button>'
            + '<button type="button" class="btn btn-sm" id="tcRenommer">Renommer</button></div></div>';
        $('#fermerTiroir').addEventListener('click', () => {
            etat.clientOuvert = null;
            $('#tiroirClient').innerHTML = '';
            document.querySelector('.gx-clients').classList.remove('avec-tiroir');
            rendreListeClients();
        });
        const enregistrerChamp = (champ, cle) => $(champ).addEventListener('change', async () => {
            try {
                await api('/clients/' + c.id, 'PUT', { [cle]: $(champ).value.trim() });
                await chargerTout();
                rendreListeClients();
                toast(cle === 'tva' ? 'N° TVA enregistré' : 'Adresse enregistrée');
            } catch (err) { toast(err.message, true); }
        });
        enregistrerChamp('#tcAdresse', 'adresse');
        enregistrerChamp('#tcTva', 'tva');
        $('#tcAjoutContact').addEventListener('click', () => ouvrirPersonne(null));
        $$('#tiroirClient [data-tcontact]').forEach(b => b.addEventListener('click', () => ouvrirPersonne(parseInt(b.dataset.tcontact, 10))));
        $('#tcFiche').addEventListener('click', () => { etat.ficheClientId = c.id; rendreFicheClient(); aller('ficheClient'); });
        $('#tcRenommer').addEventListener('click', () => ouvrirModalClient(c));
        rendreListeClients();
        if (matchMedia('(max-width:720px)').matches) $('#tiroirClient').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function brancherClients() {
        rendreListeClients();
        $('#btnNouveauClient').addEventListener('click', () => ouvrirModalClient(null));
        $('#rechClients').addEventListener('input', ev => { etat.clientsRecherche = ev.target.value; rendreListeClients(); });
        $$('#gestionContenu [data-cfiltre]').forEach(b => b.addEventListener('click', () => {
            etat.clientsFiltre = b.dataset.cfiltre;
            $$('#gestionContenu [data-cfiltre]').forEach(x => x.setAttribute('aria-pressed', x === b));
            rendreListeClients();
        }));
        if (etat.clientOuvert) ouvrirTiroirClient(etat.clientOuvert);
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
            if (etat.vue === 'gestion') rendreGestion(); else rendreFicheClient();
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

    /* ── Postes & taux : deux groupes, glisser-déposer, nom et taux modifiables sur place ── */
    function heuresPoste30j() {
        const limite = new Date(Date.now() - 30 * JOUR_MS).toISOString();
        const h = {};
        etat.entries.forEach(e => {
            if (String(e.date) < limite) return;
            h[e.posteId] = (h[e.posteId] || 0) + (parseFloat(e.hours) || 0);
        });
        return h;
    }
    function panneauPostes() {
        const h30 = heuresPoste30j();
        const max = Math.max(1, ...etat.postes.map(p => h30[p.id] || 0));
        const ligne = p => '<div class="gx-poste" draggable="true" data-gposte="' + attr(p.id) + '">'
            + '<span class="gx-poignee" title="Glisser pour réordonner">' + SVG_G.poignee + '</span>'
            + '<input class="gx-pnom" value="' + attr(p.name) + '" data-pnom="' + attr(p.id) + '" aria-label="Nom du poste">'
            + '<span class="gx-activite"><span class="gx-jauge"><i style="width:' + Math.round((h30[p.id] || 0) / max * 100) + '%"></i></span>'
            + '<span>' + (h30[p.id] ? h1(h30[p.id]) + ' h' : 'aucune') + '</span></span>'
            + '<label class="gx-taux"><input type="number" min="0" step="1" value="' + (parseFloat(p.tauxHoraire) || 0)
            + '" data-taux="' + attr(p.id) + '" aria-label="Taux horaire ' + attr(p.name) + '"><span>€/h</span></label>'
            + '<div class="gx-menu-zone"><button type="button" class="gx-menu-btn" data-pmenu="' + attr(p.id) + '" aria-label="Actions pour ' + attr(p.name) + '" aria-expanded="false">' + SVG_G.dots + '</button>'
            + '<div class="gx-menu" hidden>'
            + '<button type="button" data-pmonter="' + attr(p.id) + '">Monter</button>'
            + '<button type="button" data-pdescendre="' + attr(p.id) + '">Descendre</button>'
            + '<button type="button" data-pmachine="' + attr(p.id) + '">' + (p.isMachine ? 'Passer en main-d\x27œuvre' : 'Passer en machine') + '</button>'
            + '<button type="button" class="rouge" data-psuppr="' + attr(p.id) + '">Supprimer…</button></div></div></div>';
        const legende = '<div class="gx-legende"><span></span><span>Poste</span><span>Pointé sur 30 jours</span><span>Taux facturé</span><span></span></div>';
        const groupe = (titre, sous, liste, g) => '<div class="gx-carte gx-gpostes" data-ggroupe="' + g + '"><div class="gx-gtitre"><h3>' + titre
            + '</h3><span>' + sous + '</span></div>' + legende + (liste.map(ligne).join('') || '<div class="gx-vide-bloc">Aucun poste.</div>') + '</div>';
        const mo = etat.postes.filter(p => !p.isMachine), ma = etat.postes.filter(p => p.isMachine);
        return enteteGestion('Postes & taux', 'Le taux horaire sert au chiffrage des devis et au prix de vente réel des affaires.',
                '<button type="button" class="btn btn-arc btn-sm" id="btnNouveauPoste">' + SVG_G.plus + 'Nouveau poste</button>')
            + '<form class="gx-ajout-poste" id="formPoste" hidden><input type="text" id="ajPoste" placeholder="Nom du poste" aria-label="Nom du nouveau poste">'
            + '<label class="check"><input type="checkbox" id="ajPosteMachine"><span>Machine</span></label>'
            + '<button type="submit" class="btn btn-arc btn-sm">Ajouter</button></form>'
            + groupe('Main-d\x27œuvre', mo.length + (mo.length > 1 ? ' postes' : ' poste'), mo, 'mo')
            + groupe('Machines', ma.length + (ma.length > 1 ? ' postes' : ' poste') + ' · temps machine', ma, 'ma');
    }
    async function enregistrerOrdrePostes(ordre) {
        try {
            await api('/postes/reorder', 'POST', { postesOrder: ordre.map((id, k) => ({ id: id, order: k })) });
            await chargerTout(); rendreGestion(); toast('Ordre des postes mis à jour');
        } catch (err) { toast(err.message, true); }
    }
    function brancherPostes() {
        $('#btnNouveauPoste').addEventListener('click', () => { $('#formPoste').hidden = false; $('#ajPoste').focus(); });
        $('#formPoste').addEventListener('submit', async ev => {
            ev.preventDefault();
            const nom = $('#ajPoste').value.trim();
            if (!nom) { $('#ajPoste').focus(); return; }
            try {
                await api('/postes', 'POST', { name: nom, isMachine: $('#ajPosteMachine').checked });
                await chargerTout(); rendreGestion(); toast('Poste « ' + nom + ' » ajouté');
            } catch (err) { toast(err.message, true); }
        });
        $$('#gestionContenu [data-pnom]').forEach(i2 => i2.addEventListener('change', async () => {
            const p = etat.postes.find(x => x.id === i2.dataset.pnom);
            const nom = i2.value.trim();
            if (!nom) { i2.value = p.name; return; }
            if (nom === p.name) return;
            try {
                await api('/postes/' + p.id, 'PUT', { name: nom });
                await chargerTout(); toast('Poste renommé en « ' + nom + ' »');
            } catch (err) { toast(err.message, true); }
        }));
        $$('#gestionContenu [data-taux]').forEach(i2 => i2.addEventListener('change', async () => {
            const p = etat.postes.find(x => x.id === i2.dataset.taux);
            try {
                await api('/postes/' + p.id, 'PUT', { tauxHoraire: parseFloat(i2.value) || 0 });
                await chargerTout(); toast('Taux ' + p.name + ' : ' + (parseFloat(i2.value) || 0) + ' €/h');
            } catch (err) { toast(err.message, true); }
        }));
        // menus « ⋯ »
        $$('#gestionContenu [data-pmenu]').forEach(b => b.addEventListener('click', ev => {
            ev.stopPropagation();
            const m = b.nextElementSibling, ouvrirMenu = m.hidden;
            $$('#gestionContenu .gx-menu').forEach(x => { x.hidden = true; });
            $$('#gestionContenu [data-pmenu]').forEach(x => x.setAttribute('aria-expanded', 'false'));
            m.hidden = !ouvrirMenu; b.setAttribute('aria-expanded', String(ouvrirMenu));
        }));
        const ids = () => etat.postes.map(p => p.id);
        const deplacer = (id, sens) => {
            const L = ids(), i2 = L.indexOf(id), j2 = i2 + sens;
            if (i2 < 0 || j2 < 0 || j2 >= L.length) return;
            L.splice(j2, 0, L.splice(i2, 1)[0]);
            enregistrerOrdrePostes(L);
        };
        $$('#gestionContenu [data-pmonter]').forEach(b => b.addEventListener('click', () => deplacer(b.dataset.pmonter, -1)));
        $$('#gestionContenu [data-pdescendre]').forEach(b => b.addEventListener('click', () => deplacer(b.dataset.pdescendre, 1)));
        $$('#gestionContenu [data-pmachine]').forEach(b => b.addEventListener('click', async () => {
            const p = etat.postes.find(x => x.id === b.dataset.pmachine);
            try {
                await api('/postes/' + p.id, 'PUT', { isMachine: !p.isMachine });
                await chargerTout(); rendreGestion();
                toast(p.name + (p.isMachine ? ' passe en main-d\x27œuvre' : ' passe en machine'));
            } catch (err) { toast(err.message, true); }
        }));
        $$('#gestionContenu [data-psuppr]').forEach(b => b.addEventListener('click', async () => {
            const p = etat.postes.find(x => x.id === b.dataset.psuppr);
            const n = etat.entries.filter(e => e.posteId === p.id).length;
            if (!confirm('Supprimer le poste « ' + p.name + ' » ?' + (n ? '\n' + n + ' saisies y sont rattachées : elles resteront, sans poste.' : ''))) return;
            try {
                await api('/postes/' + p.id, 'DELETE');
                await chargerTout(); rendreGestion(); toast('Poste supprimé');
            } catch (err) { toast(err.message, true); }
        }));
        // glisser-déposer (ordinateur) à l'intérieur d'un même groupe
        let glisse = null;
        $$('#gestionContenu .gx-poste').forEach(l => {
            l.addEventListener('dragstart', ev => {
                if (ev.target.closest('input')) { ev.preventDefault(); return; }
                glisse = l; l.classList.add('glisse'); ev.dataTransfer.effectAllowed = 'move';
            });
            l.addEventListener('dragend', () => { l.classList.remove('glisse'); $$('.gx-poste.cible').forEach(x => x.classList.remove('cible')); });
            l.addEventListener('dragover', ev => {
                if (!glisse || glisse === l || glisse.parentNode !== l.parentNode) return;
                ev.preventDefault();
                $$('.gx-poste.cible').forEach(x => x.classList.remove('cible'));
                l.classList.add('cible');
            });
            l.addEventListener('drop', ev => {
                ev.preventDefault();
                if (!glisse || glisse === l || glisse.parentNode !== l.parentNode) return;
                const L = ids();
                L.splice(L.indexOf(glisse.dataset.gposte), 1);
                L.splice(L.indexOf(l.dataset.gposte), 0, glisse.dataset.gposte);
                enregistrerOrdrePostes(L);
            });
        });
    }
    // un clic ailleurs referme les menus « ⋯ » de Gestion
    document.addEventListener('click', ev => {
        if (ev.target.closest('.gx-menu-zone')) return;
        $$('#gestionContenu .gx-menu').forEach(m => { m.hidden = true; });
    });

    /* ── Utilisateurs : une carte par personne, actions dans un menu ── */
    const TEINTES_USERS = ['#4DA6FF', '#2FD07A', '#E0A54A', '#B18CFF', '#FF8A7A', '#5FD3D3', '#F2C94C'];
    function panneauUtilisateurs() {
        const limite = new Date(Date.now() - 30 * JOUR_MS).toISOString();
        return enteteGestion('Utilisateurs', 'Les comptes qui pointent à l\x27atelier. Chacun se connecte avec son nom et son mot de passe.')
            + '<div class="gx-users">' + utilisateursAtelier().map((u, i) => {
                const saisies = etat.entries.filter(e => String(e.enteredBy || '').toLowerCase() === u.name.toLowerCase());
                const derniere = saisies.reduce((m, e) => String(e.date) > m ? String(e.date) : m, '');
                const h30 = saisies.filter(e => String(e.date) >= limite).reduce((s2, e) => s2 + (parseFloat(e.hours) || 0), 0);
                const actifU = joursDepuis(derniere || null) <= 14;
                return '<div class="gx-carte gx-user"><div class="gx-user-haut">'
                    + '<span class="gx-avatar" style="background:' + TEINTES_USERS[i % TEINTES_USERS.length] + '">' + esc(initiales(u.name)) + '</span>'
                    + '<span class="gx-user-nom"><b>' + esc(u.name) + '</b><span>' + (derniere ? 'Dernière saisie ' + depuisQuand(derniere) : 'Aucune saisie') + '</span></span>'
                    + '<div class="gx-menu-zone"><button type="button" class="gx-menu-btn" data-umenu aria-label="Actions pour ' + attr(u.name) + '" aria-expanded="false">' + SVG_G.dots + '</button>'
                    + '<div class="gx-menu" hidden><button type="button" data-ren-user="' + attr(u.id) + '">Renommer</button>'
                    + '<button type="button" data-code-user="' + attr(u.id) + '">Changer le mot de passe</button>'
                    + '<button type="button" class="rouge" data-suppr-user="' + attr(u.id) + '">Supprimer le compte…</button></div></div></div>'
                    + '<div class="gx-user-stats"><div><b>' + h1(h30) + ' h</b><span>sur 30 jours</span></div><div><b>' + saisies.length + '</b><span>saisies au total</span></div></div>'
                    + '<div>' + (actifU ? '<span class="gx-pastille ok">Actif</span>' : '<span class="gx-pastille neutre">' + (derniere ? 'Inactif' : 'Jamais pointé') + '</span>') + '</div>'
                    + '<div class="gx-confirm" data-uconfirm="' + attr(u.id) + '" hidden><span>Supprimer ' + esc(u.name) + ' ? Ses ' + saisies.length
                    + ' saisies restent enregistrées à son nom.</span><div><button type="button" class="btn btn-sm" data-uannule>Annuler</button>'
                    + '<button type="button" class="btn btn-sm btn-danger" data-uconfirme="' + attr(u.id) + '">Supprimer</button></div></div></div>';
            }).join('')
            + '<form class="gx-carte gx-user gx-user-ajout" id="formUser">'
            + '<b>' + SVG_G.plus + 'Ajouter un utilisateur</b>'
            + '<input type="text" id="ajUserNom" placeholder="Nom" aria-label="Nom" autocomplete="off">'
            + '<input type="password" id="ajUserCode" placeholder="Mot de passe" aria-label="Mot de passe" autocomplete="new-password">'
            + '<button type="submit" class="btn btn-arc btn-sm">Ajouter</button></form></div>';
    }
    function brancherUtilisateurs() {
        $$('#gestionContenu [data-umenu]').forEach(b => b.addEventListener('click', ev => {
            ev.stopPropagation();
            const m = b.nextElementSibling, ouvrirMenu = m.hidden;
            $$('#gestionContenu .gx-menu').forEach(x => { x.hidden = true; });
            m.hidden = !ouvrirMenu; b.setAttribute('aria-expanded', String(ouvrirMenu));
        }));
        $('#formUser').addEventListener('submit', async ev => {
            ev.preventDefault();
            const nom = $('#ajUserNom').value.trim();
            const code = $('#ajUserCode').value.trim();
            if (!nom || !code) { toast('Nom et mot de passe requis', true); return; }
            try {
                await api('/users', 'POST', { name: nom, password: code });
                await chargerTout(); rendreGestion(); toast(nom + ' ajouté');
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
            const code = prompt('Nouveau mot de passe pour ' + u.name + ' :');
            if (!code || !code.trim()) return;
            try {
                await api('/users/' + u.id, 'PUT', { password: code.trim() });
                await chargerTout(); toast('Mot de passe de ' + u.name + ' modifié');
            } catch (err) { toast(err.message, true); }
        }));
        $$('#gestionContenu [data-suppr-user]').forEach(b => b.addEventListener('click', () => {
            b.closest('.gx-menu').hidden = true;
            $('#gestionContenu [data-uconfirm="' + b.dataset.supprUser + '"]').hidden = false;
        }));
        $$('#gestionContenu [data-uannule]').forEach(b => b.addEventListener('click', () => { b.closest('.gx-confirm').hidden = true; }));
        $$('#gestionContenu [data-uconfirme]').forEach(b => b.addEventListener('click', async () => {
            try {
                await api('/users/' + b.dataset.uconfirme, 'DELETE');
                await chargerTout(); rendreGestion(); toast('Utilisateur supprimé');
            } catch (err) { toast(err.message, true); }
        }));
    }

    /* ── Achats & fournisseurs : deux bibliothèques de libellés, avec leur usage ── */
    function usageBibliotheques() {
        const achats = {}, fourn = {};
        Object.keys(etat.devis).forEach(k => {
            ((etat.devis[k].data || {}).achats || []).forEach(a => {
                if ((parseFloat(a.prixUnit) || 0) > 0) achats[a.nom] = (achats[a.nom] || 0) + 1;
                if (a.fournisseur) fourn[a.fournisseur] = (fourn[a.fournisseur] || 0) + 1;
            });
        });
        return { achats: achats, fournisseurs: fourn };
    }
    function panneauBibliotheques() {
        const u = usageBibliotheques();
        const bloc = (k, titre, sous, liste, usage, unite) => '<div class="gx-carte gx-biblio"><div><h3>' + titre + '</h3><p>' + sous + '</p></div>'
            + '<div class="gx-puces">' + (liste.map((n, i) => '<span class="gx-puce">' + esc(n) + ' <small>'
                + (usage[n] ? usage[n] + ' ' + unite : 'jamais utilisé') + '</small><button type="button" data-bretire="' + k + ':' + i
                + '" aria-label="Retirer ' + attr(n) + '">×</button></span>').join('') || '<span class="gx-vide">Aucun libellé.</span>') + '</div>'
            + '<form class="gx-ajout-ligne" data-bajout="' + k + '"><input id="bib_' + k + '" placeholder="Ajouter un libellé, puis Entrée" aria-label="Ajouter à ' + titre + '">'
            + '<button type="submit" class="btn btn-sm">Ajouter</button></form></div>';
        return enteteGestion('Achats & fournisseurs', 'Les libellés proposés quand on remplit les achats d\x27un devis ou d\x27une affaire.')
            + '<div class="gx-biblios">'
            + bloc('achats', 'Achats types', 'Lignes pré-remplies dans chaque nouveau devis.', etat.achatsBib, u.achats, 'devis chiffrés')
            + bloc('fournisseurs', 'Fournisseurs', 'Proposés dans la colonne Fournisseur.', etat.fournisseursBib, u.fournisseurs, 'lignes')
            + '</div>';
    }
    function brancherBibliotheques() {
        const cle = { achats: 'achatsBib', fournisseurs: 'fournisseursBib' };
        const sauver = async k => { await api('/' + k, 'POST', { [k]: etat[cle[k]] }); };
        $$('#gestionContenu [data-bajout]').forEach(f => f.addEventListener('submit', async ev => {
            ev.preventDefault();
            const k = f.dataset.bajout, v = $('#bib_' + k).value.trim();
            if (!v) return;
            if (etat[cle[k]].some(x => x.toLowerCase() === v.toLowerCase())) { toast('« ' + v + ' » existe déjà', true); return; }
            try {
                etat[cle[k]].push(v);
                await sauver(k);
                rendreGestion(); toast('« ' + v + ' » ajouté');
                $('#bib_' + k).focus();
            } catch (err) { etat[cle[k]].pop(); toast(err.message, true); }
        }));
        $$('#gestionContenu [data-bretire]').forEach(b => b.addEventListener('click', async () => {
            const [k, i] = b.dataset.bretire.split(':');
            const [retire] = etat[cle[k]].splice(parseInt(i, 10), 1);
            try {
                await sauver(k);
                rendreGestion(); toast('« ' + retire + ' » retiré');
            } catch (err) { etat[cle[k]].splice(parseInt(i, 10), 0, retire); toast(err.message, true); }
        }));
    }

    Object.assign(PANNEAUX_GESTION, {
        entreprise: [panneauEntreprise, brancherEntreprise],
        clients: [panneauClients, brancherClients],
        utilisateurs: [panneauUtilisateurs, brancherUtilisateurs],
        postes: [panneauPostes, brancherPostes],
        biblio: [panneauBibliotheques, brancherBibliotheques]
    });

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
        root.classList.add('theme-fondu');
        clearTimeout(etat._fonduT);
        etat._fonduT = setTimeout(() => root.classList.remove('theme-fondu'), 420);
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
        if (admin) { etat.cascadeAffaires = true; rendreListeAffaires(); }
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
