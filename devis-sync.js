/* ==========================================================================
   DEVIS — SOMEPRE · rattachement à une affaire
   --------------------------------------------------------------------------
   Chargé APRÈS devis-app.js, dont il ne modifie aucune ligne.

   Sans paramètre ?affaire dans l'URL, ce fichier ne fait rien : le devis
   fonctionne comme avant, dans le localStorage. L'ancienne interface
   (v1.html / devis_v1.html) reste donc opérationnelle.

   Avec ?affaire=<id> :
     - le devis est chargé et enregistré sur le serveur, propre à l'affaire
     - le localStorage sert encore de filet en cas de coupure réseau
     - une comparaison budget / heures réellement saisies s'affiche
   ========================================================================== */
(function () {
    'use strict';

    const API = window.location.origin + '/api';
    const AFFAIRE_ID = new URLSearchParams(window.location.search).get('affaire');
    if (!AFFAIRE_ID) return; // mode local historique : on ne touche à rien

    const $ = s => document.querySelector(s);
    const eur = v => (v || 0).toFixed(2).replace('.', ',')
        .replace(/\B(?=(\d{3})+(?!\d)(?=,))/g, ' ') + ' €';
    const hh = v => (v || 0).toFixed(2).replace('.', ',');
    const esc = s => String(s == null ? '' : s)
        .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    /* ------------------------------------------------ état d'enregistrement */

    function etat(texte, type) {
        const el = $('#etatDevis');
        if (!el) return;
        el.textContent = texte;
        el.className = 'etat-devis' + (type ? ' ' + type : '');
    }

    /* ------------------------------------------------------ enregistrement */

    function payload() {
        return {
            client: $('#client').value,
            numCommande: $('#numCommande').value,
            affaire: $('#affaire').value,
            date: $('#date').value,
            coeffMarge: $('#coeffMarge').value,
            data: data
        };
    }

    async function envoyer() {
        etat('Enregistrement...', 'encours');
        try {
            const r = await fetch(API + '/devis/' + AFFAIRE_ID, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload())
            });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            enAttente = false;
            etat('Enregistré', 'ok');
            rafraichirComparaison();
            return true;
        } catch (e) {
            console.warn('Devis non enregistré sur le serveur :', e);
            etat('Hors ligne — gardé sur cet appareil', 'horsligne');
            return false;
        }
    }

    let minuteur = null;
    let enAttente = false; // une modification attend son envoi au serveur
    // Point de passage unique : les 12 appels de devis-app.js et les
    // écouteurs de champs passent tous par ici.
    window.sauvegarderAuto = function () {
        try {
            localStorage.setItem('devis_affaire_' + AFFAIRE_ID, JSON.stringify(payload()));
        } catch (e) { /* stockage indisponible */ }
        enAttente = true;
        etat('Modifié...', 'encours');
        clearTimeout(minuteur);
        minuteur = setTimeout(envoyer, 900);
    };

    // Fermer l onglet dans les 900 ms suivant la derniere saisie perdait
    // cette saisie (le PUT differe ne partait jamais) : on l envoie
    // immediatement en keepalive.
    window.addEventListener('pagehide', function () {
        if (!enAttente) return;
        clearTimeout(minuteur);
        try {
            fetch(API + '/devis/' + AFFAIRE_ID, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload()),
                keepalive: true
            });
        } catch (e) { /* la copie locale reste */ }
    });

    window.sauvegarder = async function () {
        clearTimeout(minuteur);
        const ok = await envoyer();
        etat(ok ? 'Devis enregistré' : 'Échec de l\'enregistrement', ok ? 'ok' : 'erreur');
    };

    /* ------------------------------------------------------------ chargement */

    async function chargerDevis() {
        // 1. le devis existant de cette affaire
        try {
            const r = await fetch(API + '/devis/' + AFFAIRE_ID + '?_t=' + Date.now(),
                { cache: 'no-store' });
            if (r.ok) {
                const d = await r.json();
                $('#client').value = d.client || '';
                $('#numCommande').value = d.numCommande || '';
                $('#affaire').value = d.affaire || '';
                $('#date').value = d.date || new Date().toISOString().split('T')[0];
                $('#coeffMarge').value = d.coeffMarge || 1.20;
                if (d.data) data = d.data;
                etat('Devis chargé', 'ok');
                return true;
            }
            if (r.status !== 404) throw new Error('HTTP ' + r.status);
        } catch (e) {
            // repli sur la copie locale de CE devis
            try {
                const local = localStorage.getItem('devis_affaire_' + AFFAIRE_ID);
                if (local) {
                    const d = JSON.parse(local);
                    $('#client').value = d.client || '';
                    $('#numCommande').value = d.numCommande || '';
                    $('#affaire').value = d.affaire || '';
                    $('#date').value = d.date || '';
                    $('#coeffMarge').value = d.coeffMarge || 1.20;
                    if (d.data) data = d.data;
                    etat('Hors ligne — copie de cet appareil', 'horsligne');
                    return true;
                }
            } catch (e2) { /* stockage indisponible */ }
            etat('Serveur injoignable', 'erreur');
            return false;
        }
        return false; // 404 : aucun devis encore
    }

    // Premier devis d'une affaire : le chargement d'origine a rempli
    // `data` avec le dernier devis du localStorage global (devis_somepre),
    // qui appartient à une AUTRE affaire — ses heures et surtout ses achats
    // n'ont rien à faire ici. On repart d'une page blanche, achats compris,
    // reconstruits depuis la bibliothèque du serveur.
    function repartirDeZero() {
        (data.travail || []).forEach(function (p) { p.semaines = [0, 0, 0, 0, 0, 0, 0, 0]; });
        (data.machine || []).forEach(function (m) { m.temps = 0; });
        try {
            data.achats = achatsItems.map(function (a) {
                return {
                    nom: typeof a === 'string' ? a : ((a && a.nom) || ''),
                    fournisseur: '', quantite: 1, prixUnit: 0
                };
            });
        } catch (e) {
            (data.achats || []).forEach(function (ac) {
                ac.fournisseur = ''; ac.quantite = 1; ac.prixUnit = 0;
            });
        }
        $('#client').value = '';
        $('#numCommande').value = '';
        $('#affaire').value = '';
        $('#date').value = new Date().toISOString().split('T')[0];
        $('#coeffMarge').value = 1.20;
    }

    // Premier devis d'une affaire : on part des heures déjà pointées,
    // ce que faisait l'ancien bouton « Devis » d'une affaire.
    function amorcerDepuisReel(synthese) {
        if (!synthese) return;
        const parNom = {};
        synthese.postes.forEach(p => { parNom[p.nom] = p.reelHeures; });

        (data.travail || []).forEach(p => {
            const h = parNom[p.nom];
            if (h) p.semaines = [h, 0, 0, 0, 0, 0, 0, 0];
        });
        (data.machine || []).forEach(m => {
            const h = parNom[m.nom];
            if (h) m.temps = h;
        });

        const a = synthese.affaire || {};
        if (!$('#affaire').value) $('#affaire').value = a.name || '';
        etat('Nouveau devis — pré-rempli avec les heures pointées', 'nouveau');
    }

    /* --------------------------------------------------------- comparaison */

    async function rafraichirComparaison() {
        const hote = $('#comparaison');
        if (!hote) return;
        hote.style.display = 'block';
        try {
            const r = await fetch(API + '/affaires/' + AFFAIRE_ID + '/synthese?_t=' + Date.now(),
                { cache: 'no-store' });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            afficherComparaison(await r.json());
        } catch (e) {
            hote.innerHTML = '<div class="section-title">Comparaison</div>'
                + '<p style="color:var(--ink-dim);">Comparaison indisponible (serveur injoignable).</p>';
        }
    }

    function classeEcart(v) {
        if (Math.abs(v) < 0.005) return 'neutre';
        return v > 0 ? 'depasse' : 'sous';
    }
    function signe(v, f) {
        return (v > 0 ? '+' : '') + f(v);
    }

    function afficherComparaison(s) {
        const hote = $('#comparaison');
        if (!hote) return;
        hote.style.display = 'block';
        const t = s.totaux;

        const lignes = s.postes.map(p => {
            const cH = classeEcart(p.ecartHeures);
            const cE = classeEcart(p.ecartMontant);
            return '<tr>'
                + '<td class="poste-name">' + esc(p.nom)
                + (p.machine ? '<span class="mach">MACHINE</span>' : '') + '</td>'
                + '<td class="chiffre">' + hh(p.budgetHeures) + '</td>'
                + '<td class="chiffre">' + hh(p.reelHeures) + '</td>'
                + '<td class="chiffre ecart ' + cH + '">' + signe(p.ecartHeures, hh) + '</td>'
                + '<td class="chiffre">' + eur(p.budgetMontant) + '</td>'
                + '<td class="chiffre">' + eur(p.reelMontant) + '</td>'
                + '<td class="chiffre ecart ' + cE + '">' + signe(p.ecartMontant, eur) + '</td>'
                + '</tr>';
        }).join('');

        const cH = classeEcart(t.ecartHeures);
        const cE = classeEcart(t.ecartMontant);
        const avance = t.budgetHeures > 0
            ? Math.round(t.reelHeures / t.budgetHeures * 100) : 0;

        hote.innerHTML =
            '<div class="section-title">Devis contre heures réelles</div>'
            + (s.aDevis ? '' : '<p class="avis">Aucun devis enregistré pour cette affaire : '
                + 'la colonne budget reste vide tant que vous n\'avez pas saisi de temps ci-dessus.</p>')
            + '<div class="cmp-tuiles">'
            +   '<div class="cmp-tuile"><div class="cmp-lab">Heures budgétées</div>'
            +     '<div class="cmp-val">' + hh(t.budgetHeures) + ' h</div></div>'
            +   '<div class="cmp-tuile"><div class="cmp-lab">Heures pointées</div>'
            +     '<div class="cmp-val">' + hh(t.reelHeures) + ' h</div></div>'
            +   '<div class="cmp-tuile ' + cH + '"><div class="cmp-lab">Écart</div>'
            +     '<div class="cmp-val">' + signe(t.ecartHeures, hh) + ' h</div></div>'
            +   '<div class="cmp-tuile ' + cE + '"><div class="cmp-lab">Écart valorisé</div>'
            +     '<div class="cmp-val">' + signe(t.ecartMontant, eur) + '</div></div>'
            + '</div>'
            + (t.budgetHeures > 0
                ? '<div class="jauge-lab"><span>Avancement contre budget</span>'
                  + '<b class="' + cH + '">' + avance + ' %</b></div>'
                  + '<div class="jauge"><i class="' + cH + '" style="width:'
                  + Math.min(100, avance) + '%"></i></div>'
                : '')
            + '<div class="table-container"><table class="cmp"><thead><tr>'
            +   '<th>Poste</th>'
            +   '<th class="chiffre">Budget h</th><th class="chiffre">Réel h</th>'
            +   '<th class="chiffre">Écart h</th>'
            +   '<th class="chiffre">Budget €</th><th class="chiffre">Réel €</th>'
            +   '<th class="chiffre">Écart €</th>'
            + '</tr></thead><tbody>' + lignes
            + '<tr class="total-row">'
            +   '<td>Total</td>'
            +   '<td class="chiffre">' + hh(t.budgetHeures) + '</td>'
            +   '<td class="chiffre">' + hh(t.reelHeures) + '</td>'
            +   '<td class="chiffre ecart ' + cH + '">' + signe(t.ecartHeures, hh) + '</td>'
            +   '<td class="chiffre">' + eur(t.budgetMontant) + '</td>'
            +   '<td class="chiffre">' + eur(t.reelMontant) + '</td>'
            +   '<td class="chiffre ecart ' + cE + '">' + signe(t.ecartMontant, eur) + '</td>'
            + '</tr></tbody></table></div>';
    }

    /* --------------------------------------------------- retour sur l'onglet */

    window.addEventListener('focus', async function () {
        if (enAttente) return; // la saisie locale prime
        const actif = document.activeElement;
        if (actif && (actif.tagName === 'INPUT' || actif.tagName === 'SELECT'
            || actif.tagName === 'TEXTAREA')) return;
        const ok = await chargerDevis();
        if (ok) {
            renderTravail();
            renderMachine();
            renderAchats();
            calculer();
            rafraichirComparaison();
        }
    });

    /* ------------------------------------------------------------ démarrage */

    const onloadOriginal = window.onload;
    window.onload = async function () {
        // 1. l'initialisation d'origine : bibliothèques, taux, rendu
        if (typeof onloadOriginal === 'function') {
            await onloadOriginal.apply(this, arguments);
        }

        // 2. l'affaire concernée, affichée dans l'en-tête
        let synthese = null;
        try {
            const r = await fetch(API + '/affaires/' + AFFAIRE_ID + '/synthese?_t=' + Date.now(),
                { cache: 'no-store' });
            if (r.ok) synthese = await r.json();
        } catch (e) { /* traité plus bas */ }

        const bandeau = $('#affaireLiee');
        if (bandeau && synthese && synthese.affaire) {
            bandeau.innerHTML = '<span class="lien-lab">Devis de l\'affaire</span>'
                + '<span class="lien-nom">' + esc(synthese.affaire.name) + '</span>'
                + (synthese.affaire.description
                    ? '<span class="lien-desc">' + esc(synthese.affaire.description) + '</span>' : '');
            bandeau.style.display = 'flex';
        }

        // 3. le devis de cette affaire, ou une amorce sur les heures pointées
        const existe = await chargerDevis();
        if (!existe) {
            repartirDeZero();
            if (synthese) amorcerDepuisReel(synthese);
        }

        renderTravail();
        renderMachine();
        renderAchats();
        calculer();

        // 4. la comparaison
        if (synthese) afficherComparaison(synthese); else rafraichirComparaison();
    };
})();
