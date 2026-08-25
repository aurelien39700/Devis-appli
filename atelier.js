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
    const STADES = [
        { k: 'brouillon', lab: 'Devis à chiffrer' },
        { k: 'envoye',    lab: 'Chez le client' },
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

    /* ═══════════════ chargement des données ═══════════════ */
    async function chargerTout() {
        const [tout, devisListe, entreprise] = await Promise.all([
            api('/entries?_t=' + Date.now()),
            api('/devis?_t=' + Date.now()).catch(() => ({ devis: [] })),
            api('/entreprise?_t=' + Date.now()).catch(() => ({ entreprise: {} }))
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
        $('#syncEtat').textContent = 'Synchronisé';
        $('#syncEtat').classList.remove('hors');
    }

    function heuresAffaire(id) {
        return etat.entries.filter(e => e.affaireId === id)
            .reduce((s, e) => s + (parseFloat(e.hours) || 0), 0);
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
                     fiche: ['Affaire', ''], gestion: ['Référentiel', 'Gestion'] };

    function aller(vue) {
        etat.vue = vue;
        $$('.view').forEach(v => v.classList.toggle('is-on', v.dataset.vue === vue));
        $$('.nav-item').forEach(b => b.classList.toggle('is-on',
            b.dataset.vue === vue || (vue === 'fiche' && b.dataset.vue === 'affaires')));
        const t = TITRES[vue];
        $('#crumbTop').textContent = t[0];
        $('#crumbMain').textContent = vue === 'fiche'
            ? ((etat.affaires.find(a => a.id === etat.ficheId) || {}).name || '') : t[1];
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

    /* ═══════════════ POINTAGE ═══════════════ */
    function rendrePointage() {
        const enCours = etat.affaires.filter(a => stadeDe(a) === 'en_cours');
        $('#qaListe').innerHTML = enCours.length ? enCours.map(a => {
            const c = etat.clients.find(x => x.id === a.clientId);
            return '<button class="qa-btn" data-qa="' + attr(a.id) + '">'
                + '<span class="qa-client">' + esc(c ? c.name : '') + '</span>'
                + '<span class="qa-nom">' + esc(a.name) + '</span>'
                + '<span class="qa-h">' + h1(heuresAffaire(a.id)) + ' h pointées</span></button>';
        }).join('') : '<p style="color:var(--ink-dim);">Aucune affaire en cours.</p>';

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
        }).join('') : '<p style="color:var(--ink-dim);">Aucune saisie aujourd\'hui. '
            + 'Appuyez sur + pour commencer.</p>';

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
                + '<span class="e neutre">sans devis</span></div>';
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
                + '</div>';
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
            const liste = etat.affaires.filter(a => stadeDe(a) === s.k);
            if (!liste.length) return '';
            return '<div class="groupe-stade">'
                + '<div class="eyebrow section-lab">' + s.lab + ' · ' + liste.length + '</div>'
                + '<div class="grille">' + liste.map(carteAffaire).join('') + '</div></div>';
        }).join('');

        const archivees = etat.affaires.filter(a => stadeDe(a) === 'archivee');
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

        $$('#listeAffaires [data-fiche]').forEach(cbtn => cbtn.addEventListener('click', () => {
            etat.ficheId = cbtn.dataset.fiche;
            ouvrirFiche();
        }));
    }

    /* ── nouvelle affaire (démarre en brouillon de devis) ── */
    $('#btnNouvelle').addEventListener('click', () => {
        $('#naClient').innerHTML = '<option value="">Sélectionner un client</option>'
            + etat.clients.map(c => '<option value="' + attr(c.id) + '">' + esc(c.name) + '</option>').join('');
        $('#naNom').value = '';
        $('#naDesc').value = '';
        ouvrir('scrimAffaire');
    });

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
                achats: [
                    'Carcasse', 'Éléments carcasse', 'Matière première', 'Traitement thermique',
                    'Bloc chaud', 'Sous-traitance', 'Transport'
                ].map(n => ({ nom: n, fournisseur: '', quantite: 1, prixUnit: 0 }))
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
                return '<button class="btn btn-arc btn-sm" data-cycle="envoye">Envoyer au client</button>';
            case 'envoye':
                return '<button class="btn btn-sm" data-cycle="brouillon">Repasser en brouillon</button>'
                    + '<button class="btn btn-sm" data-voir-lien>Voir le lien client</button>'
                    + '<button class="btn btn-ok btn-sm" data-cycle="en_cours">Le client a accepté</button>';
            case 'en_cours':
                return '<button class="btn btn-sm" data-cycle="terminee">Terminer l\'affaire</button>';
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

        const bud = s.totaux.budgetHeures;
        const reel = s.totaux.reelHeures;
        const ecart = reel - bud, cEcart = cls(ecart);

        /* ── lignes : celles du devis + le pointé hors devis ── */
        const reelParNom = {};
        s.postes.forEach(p => { reelParNom[p.nom] = p; });
        let lignes = '';
        if (d) {
            const rendreLigne = (ligne, type, i) => {
                const b = type === 't'
                    ? (ligne.semaines || []).reduce((x, y) => x + (parseFloat(y) || 0), 0)
                    : (parseFloat(ligne.temps) || 0);
                const r = reelParNom[ligne.nom] ? reelParNom[ligne.nom].reelHeures : 0;
                const e = r - b, cc = cls(e);
                const ech = Math.max(b, r) || 1;
                return '<tr><td class="nom">' + esc(ligne.nom)
                    + (type === 'm' ? '<span class="mach">MACHINE</span>' : '') + '</td>'
                    + '<td class="bud">' + (modifiable
                        ? '<input type="number" min="0" step="0.5" value="' + b
                          + '" data-bud="' + type + i + '" aria-label="Budget ' + attr(ligne.nom) + '">'
                        : '<span class="fixe">' + h1(b) + '</span>') + '</td>'
                    + '<td class="reel">' + h1(r) + '</td>'
                    + '<td class="ec ' + cc + '">' + ((b === 0 && r === 0) ? '—' : sgn(e, h1)) + '</td>'
                    + '<td class="conso"><div class="mini">'
                    + '<div class="fill ' + cc + '" style="width:' + Math.round(r / ech * 100) + '%"></div>'
                    + (b > 0 ? '<div class="cible" style="left:' + Math.round(b / ech * 100) + '%"></div>' : '')
                    + '</div></td>'
                    + '<td class="eur">' + eur(b * (parseFloat(ligne.taux) || 0)) + '</td></tr>';
            };
            lignes += (d.data.travail || []).map((l, i) => rendreLigne(l, 't', i)).join('');
            lignes += (d.data.machine || []).map((l, i) => rendreLigne(l, 'm', i)).join('');
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
                + '<span class="tot">' + eur(m.achats) + '</span></div>'
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
                        + '<td class="txt"><input type="text" value="' + attr(ac.fournisseur || '')
                        + '" placeholder="Fournisseur" data-achat="fournisseur" data-i="' + i + '"></td>'
                        + '<td class="qte"><input type="number" min="0" step="1" value="'
                        + (parseFloat(ac.quantite) || 0) + '" data-achat="quantite" data-i="' + i + '"></td>'
                        + '<td class="qte"><input type="number" min="0" step="0.01" value="'
                        + (parseFloat(ac.prixUnit) || 0) + '" data-achat="prixUnit" data-i="' + i + '"></td>'
                        + '<td class="eur" style="color:var(--ink);">' + eur(mt) + '</td>'
                        + '<td style="text-align:right;"><button class="btn btn-sm btn-danger" '
                        + 'data-suppr-achat="' + i + '">✕</button></td></tr>';
                }).join('')
                + '</tbody></table></div>'
                + (modifiable
                    ? '<div style="margin-top:11px;"><button class="btn btn-sm" data-ajout-achat>'
                      + 'Ajouter une ligne d\'achat</button></div>' : '')
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
                + '<label>Description sur le devis client '
                + '<small>le client ne voit que cette note et les montants — jamais le détail des postes</small></label>'
                + '<input type="text" value="' + attr(d.noteClient || '')
                + '" placeholder="Ex : Conception et réalisation — reprise 4 empreintes" data-devis="noteClient">'
                + '<div class="conds-devis">'
                + '<div class="cd"><label>Délai</label><input type="text" value="' + attr(d.delai || '')
                + '" placeholder="Ex : 6 semaines" data-devis="delai"></div>'
                + '<div class="cd"><label>Règlement</label><select data-devis="reglement">'
                + Object.keys(REGLEMENTS).map(k => '<option value="' + k + '"'
                    + (k === (d.reglement || 'virement_45j') ? ' selected' : '') + '>'
                    + REGLEMENTS[k] + '</option>').join('')
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

            + (!d
                ? '<div class="cycle"><span class="eyebrow">Affaire sans devis — le pointage est libre, '
                  + 'aucun budget à comparer</span>'
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

            + '<div class="bilan">'
            + '<div class="case budget"><div class="case-lab"><i class="sw"></i>Heures budgétées</div>'
            + '<div class="case-val">' + h1(bud) + '<small>h</small></div>'
            + '<div class="case-sous">le devis de cette affaire</div></div>'
            + '<div class="case reel"><div class="case-lab"><i class="sw"></i>Heures pointées</div>'
            + '<div class="case-val">' + h1(reel) + '<small>h</small></div>'
            + '<div class="case-sous">saisies par l\'atelier</div></div>'
            + '<div class="case ' + cEcart + '"><div class="case-lab"><i class="sw"></i>Écart</div>'
            + '<div class="case-val">' + sgn(ecart, h1) + '<small>h</small></div>'
            + '<div class="case-sous">' + (Math.abs(ecart) < 0.005 ? 'pile sur le budget'
                : ecart > 0 ? 'de dépassement' : 'de marge restante') + '</div></div></div>'

            + '<div class="bloc"><div class="titre"><h2>Devis et heures</h2>'
            + (d && modifiable
                ? '<a class="btn btn-sm" style="text-decoration:none;" '
                  + 'href="devis_app.html?affaire=' + encodeURIComponent(a.id) + '" target="_blank" rel="noopener">'
                  + 'Éditeur détaillé</a>' : '')
            + '<span class="tot">' + eur(m.heures) + '</span></div>'
            + '<div class="tbl"><table><thead><tr>'
            + '<th>Poste</th>'
            + '<th class="c"><i class="sw" style="background:var(--m-bud);"></i>Budget h</th>'
            + '<th class="c"><i class="sw" style="background:var(--m-reel);"></i>Pointé h</th>'
            + '<th class="c">Écart</th><th>Avancement</th><th class="c">Montant</th>'
            + '</tr></thead><tbody>' + lignes
            + '<tr class="total"><td>Total</td>'
            + '<td class="bud" style="color:var(--m-bud-ink);">' + h1(bud) + '</td>'
            + '<td class="reel">' + h1(reel) + '</td>'
            + '<td class="ec ' + cEcart + '">' + sgn(ecart, h1) + '</td>'
            + '<td></td><td class="eur">' + eur(m.heures) + '</td></tr>'
            + '</tbody></table></div>'
            + (d
                ? (modifiable
                    ? '<div class="verrou" style="color:var(--m-bud-ink);">'
                      + '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/></svg>'
                      + 'Les heures budgétées se modifient ici et s\'enregistrent sur l\'affaire.</div>'
                    : '<div class="verrou"><svg viewBox="0 0 24 24">'
                      + '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>'
                      + 'Devis ' + (stade === 'envoye' ? 'envoyé' : 'verrouillé')
                      + ' : repassez en brouillon pour modifier le budget.'
                      + ((d.delai || d.reglement)
                          ? '<span class="verrou-conds">'
                            + (d.delai ? 'Délai ' + esc(d.delai) : '')
                            + (d.delai && d.reglement ? ' · ' : '')
                            + (d.reglement ? esc(REGLEMENTS[d.reglement] || d.reglement) : '')
                            + '</span>' : '')
                      + '</div>')
                : '')
            + conditionsHtml
            + '</div>'

            + achatsHtml

            + (d
                ? '<div class="bloc"><div class="titre"><h2>Synthèse financière</h2></div>'
                  + '<div class="syn">'
                  + '<div class="si"><div class="si-lab">Heures</div><div class="si-val">' + eur(m.heures) + '</div></div>'
                  + '<div class="si"><div class="si-lab">Achats</div><div class="si-val">' + eur(m.achats) + '</div></div>'
                  + '<div class="si prix"><div class="si-lab">Prix de vente HT</div><div class="si-val">' + eur(prix) + '</div></div>'
                  + '<div class="si marge"><div class="si-lab">Marge</div><div class="si-val">' + eur(prix - cout) + '</div></div>'
                  + '</div>'
                  + '<div class="syn-coeff"><span>Coefficient de marge</span>'
                  + '<input type="number" step="0.05" min="1" value="' + coeff + '" data-devis="coeffMarge"'
                  + (modifiable ? '' : ' disabled') + '>'
                  + (modifiable ? '' : '<span>— verrouillé avec le devis</span>') + '</div>'
                  + '</div>'
                : '');

        brancherFiche(a, d, modifiable);
    }

    /* ── enregistrement du devis de la fiche ── */
    let minuteurDevis = null;
    function etatSauve(texte, classe) {
        const el = $('#etatSauve');
        if (!el) return;
        el.textContent = texte;
        el.className = 'etat-sauve' + (classe ? ' ' + classe : '');
    }
    function programmerEnregistrement() {
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
                reglement: d.reglement, echeances: d.echeances
            });
            etat.devisLocal = sauve;
            etat.devis[etat.ficheId] = sauve;
            const heure = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            etatSauve('Enregistré à ' + heure);
        } catch (err) {
            etatSauve('Échec de l\'enregistrement', 'erreur');
            toast(err.message, true);
        }
    }

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
                             en_cours: 'Affaire en cours',
                             terminee: 'Affaire terminée',
                             archivee: 'Affaire archivée' }[cible] || 'Statut mis à jour');
            } catch (err) { toast(err.message, true); }
        }));
        const voirLien = document.querySelector('#ficheContenu [data-voir-lien]');
        if (voirLien) voirLien.addEventListener('click', montrerLienClient);
    }

    // Recalcule bilan/synthèse de la fiche depuis le devis local, sans
    // toucher aux champs en cours de frappe.
    function rafraichirSyntheseFiche() {
        const d = etat.devisLocal;
        if (!d) return;
        // pas de rechargement complet : re-render différé quand la frappe se calme
        clearTimeout(rafraichirSyntheseFiche._t);
        rafraichirSyntheseFiche._t = setTimeout(async () => {
            try {
                etat.syntheseLocale = await api('/affaires/' + etat.ficheId + '/synthese?_t=' + Date.now());
            } catch (e) { /* la fiche garde ses chiffres actuels */ }
            if (etat.vue === 'fiche' && document.activeElement.tagName !== 'INPUT'
                && document.activeElement.tagName !== 'SELECT') {
                rendreFiche();
            }
        }, 1400);
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

    /* ═══════════════ GESTION ═══════════════ */
    function rendreGestion() {
        const ent = etat.entreprise;
        const ch = (k, label, valeur) =>
            '<div class="ch"><label>' + label + '</label>'
            + '<input type="text" value="' + attr(valeur || '') + '" data-ent="' + k + '"></div>';

        $('#gestionContenu').innerHTML =
            /* ── entreprise ── */
            '<div class="bloc gest-large"><div class="titre"><h2>Entreprise</h2>'
            + '<span class="eyebrow" style="margin-left:auto;">Reprises sur les devis envoyés aux clients</span></div>'
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
            + '<button class="btn btn-arc btn-sm" id="btnEnregistrerEntreprise">Enregistrer</button></div>'
            + '</div>'

            /* ── clients ── */
            + '<div class="bloc"><div class="titre"><h2>Clients</h2></div>'
            + etat.clients.map(c => {
                const n = etat.affaires.filter(a => a.clientId === c.id).length;
                return '<div class="ligne-g"><span class="n">' + esc(c.name) + '</span>'
                    + '<span class="m">' + n + ' affaire' + (n > 1 ? 's' : '') + '</span>'
                    + '<div class="acts">'
                    + '<button class="btn btn-sm" data-ren-client="' + attr(c.id) + '">✎</button>'
                    + '<button class="btn btn-sm btn-danger" data-suppr-client="' + attr(c.id) + '">✕</button>'
                    + '</div></div>';
            }).join('')
            + '<div class="ajout"><input type="text" id="ajClient" placeholder="Nouveau client">'
            + '<button class="btn btn-arc btn-sm" id="btnAjClient">Ajouter</button></div></div>'

            /* ── postes ── */
            + '<div class="bloc"><div class="titre"><h2>Postes</h2></div>'
            + etat.postes.map(p =>
                '<div class="ligne-g"><span class="n">' + esc(p.name)
                + (p.isMachine ? '<span class="mach">MACHINE</span>' : '') + '</span>'
                + '<input type="number" min="0" step="1" class="taux-inline" value="'
                + (p.tauxHoraire || 0) + '" data-taux="' + attr(p.id) + '" title="Taux €/h">'
                + '<span class="m">€/h</span>'
                + '<div class="acts">'
                + '<button class="btn btn-sm" data-ren-poste="' + attr(p.id) + '">✎</button>'
                + '<button class="btn btn-sm btn-danger" data-suppr-poste="' + attr(p.id) + '">✕</button>'
                + '</div></div>').join('')
            + '<div class="ajout"><input type="text" id="ajPoste" placeholder="Nouveau poste">'
            + '<label class="check"><input type="checkbox" id="ajPosteMachine"><span>Machine</span></label>'
            + '<button class="btn btn-arc btn-sm" id="btnAjPoste">Ajouter</button></div></div>'

            /* ── utilisateurs ── */
            + '<div class="bloc"><div class="titre"><h2>Utilisateurs</h2></div>'
            + etat.users.filter(u => u.name !== 'Admin').map(u => {
                const n = etat.entries.filter(e => e.enteredBy === u.name).length;
                return '<div class="ligne-g"><span class="n">' + esc(u.name) + '</span>'
                    + '<span class="m">' + n + ' saisie' + (n > 1 ? 's' : '') + '</span>'
                    + '<div class="acts">'
                    + '<button class="btn btn-sm" data-ren-user="' + attr(u.id) + '">✎</button>'
                    + '<button class="btn btn-sm" data-code-user="' + attr(u.id) + '">Code</button>'
                    + '<button class="btn btn-sm btn-danger" data-suppr-user="' + attr(u.id) + '">✕</button>'
                    + '</div></div>';
            }).join('')
            + '<div class="ajout"><input type="text" id="ajUserNom" placeholder="Nom">'
            + '<input type="password" id="ajUserCode" placeholder="Mot de passe">'
            + '<button class="btn btn-arc btn-sm" id="btnAjUser">Ajouter</button></div></div>';

        brancherGestion();
    }

    function brancherGestion() {
        /* entreprise */
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
            $$('#gestionContenu [data-ent]').forEach(i => { corps[i.dataset.ent] = i.value.trim(); });
            try {
                const r = await api('/entreprise', 'POST', corps);
                etat.entreprise = r.entreprise;
                toast('Coordonnées enregistrées');
            } catch (err) { toast(err.message, true); }
        });

        /* clients */
        $('#btnAjClient').addEventListener('click', async () => {
            const nom = $('#ajClient').value.trim();
            if (!nom) { $('#ajClient').focus(); return; }
            try {
                await api('/clients', 'POST', { name: nom });
                await chargerTout(); rendreGestion(); toast('Client ajouté');
            } catch (err) { toast(err.message, true); }
        });
        $$('#gestionContenu [data-ren-client]').forEach(b => b.addEventListener('click', async () => {
            const c = etat.clients.find(x => x.id === b.dataset.renClient);
            const nom = prompt('Nouveau nom du client :', c.name);
            if (!nom || nom.trim() === c.name) return;
            try {
                await api('/clients/' + c.id, 'PUT', { name: nom.trim() });
                await chargerTout(); rendreGestion(); toast('Client renommé');
            } catch (err) { toast(err.message, true); }
        }));
        $$('#gestionContenu [data-suppr-client]').forEach(b => b.addEventListener('click', async () => {
            const c = etat.clients.find(x => x.id === b.dataset.supprClient);
            if (!confirm('Supprimer le client « ' + c.name + ' » et ses affaires associées ?')) return;
            try {
                await api('/clients/' + c.id, 'DELETE');
                await chargerTout(); rendreGestion(); toast('Client supprimé');
            } catch (err) { toast(err.message, true); }
        }));

        /* postes */
        $('#btnAjPoste').addEventListener('click', async () => {
            const nom = $('#ajPoste').value.trim();
            if (!nom) { $('#ajPoste').focus(); return; }
            try {
                await api('/postes', 'POST', { name: nom, isMachine: $('#ajPosteMachine').checked });
                await chargerTout(); rendreGestion(); toast('Poste ajouté');
            } catch (err) { toast(err.message, true); }
        });
        $$('#gestionContenu [data-taux]').forEach(i => i.addEventListener('change', async () => {
            try {
                await api('/postes/' + i.dataset.taux, 'PUT',
                    { tauxHoraire: parseFloat(i.value) || 0 });
                await chargerTout(); toast('Taux mis à jour');
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

        /* utilisateurs */
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
        $('#lienAncienne').classList.toggle('hidden', !admin);
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
