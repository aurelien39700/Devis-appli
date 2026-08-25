/* ==========================================================================
   SUIVI D'HEURES — SOMEPRE · couche d'affichage v2
   --------------------------------------------------------------------------
   Ce fichier ne contient AUCUNE logique métier.
   Il est chargé APRÈS app.js et se contente de redéfinir les fonctions
   d'affichage (render*, navigation) pour la nouvelle interface.

   Tout le reste — appels API, règles admin/utilisateur, sauvegarde,
   synchronisation, génération PDF, transfert vers le devis — reste dans
   app.js et n'est pas touché. Les deux interfaces partagent donc
   exactement la même logique et les mêmes données.
   ========================================================================== */
(function () {
    'use strict';

    const $ = s => document.querySelector(s);
    const $$ = s => Array.from(document.querySelectorAll(s));
    const esc = s => (typeof escapeHtml === 'function' ? escapeHtml(s) : String(s));
    const h1 = v => (parseFloat(v) || 0).toFixed(1);
    const h2 = v => (parseFloat(v) || 0).toFixed(2);

    const ICON = {
        edit: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/></svg>',
        trash: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>',
        up: '<svg viewBox="0 0 24 24"><path d="M6 14l6-6 6 6"/></svg>',
        down: '<svg viewBox="0 0 24 24"><path d="M6 10l6 6 6-6"/></svg>'
    };


    /* ================================ devis rattachés aux affaires ==== */

    // Devis connus, indexés par affaire. Alimenté par chargerDevis().
    let devisParAffaire = {};

    async function chargerDevis() {
        try {
            const r = await fetch(API_URL + '/devis?_t=' + Date.now(), { cache: 'no-store' });
            if (!r.ok) return;
            const d = await r.json();
            devisParAffaire = {};
            (d.devis || []).forEach(x => { devisParAffaire[x.affaireId] = x; });
        } catch (e) {
            console.warn('Devis non chargés :', e);
        }
    }
    window.chargerDevis = chargerDevis;

    // Heures budgétées d'un devis : semaines des postes + temps machine.
    function budgetHeures(dv) {
        if (!dv || !dv.data) return 0;
        const t = (dv.data.travail || []).reduce((s, p) =>
            s + (p.semaines || []).reduce((a, b) => a + (parseFloat(b) || 0), 0), 0);
        const m = (dv.data.machine || []).reduce((s, x) => s + (parseFloat(x.temps) || 0), 0);
        return t + m;
    }

    function heuresReelles(affaireId) {
        return entries.filter(e => e.affaireId === affaireId)
                      .reduce((s, e) => s + (parseFloat(e.hours) || 0), 0);
    }

    // Le bouton Devis d'une affaire ouvre SON devis, plus un emplacement partagé.
    window.preparerDevisApp = function (affaireId) {
        const base = window.location.origin + window.location.pathname
            .replace(/[^/]*$/, '');
        const url = base + 'devis_app.html?affaire=' + encodeURIComponent(affaireId);
        if (!window.open(url, '_blank')) {
            alert('Le popup a été bloqué par votre navigateur.\n\n'
                + 'Autorisez les popups pour ce site, puis réessayez.');
        }
    };

    /* ====================================================== navigation ==== */

    const CRUMBS = {
        hours: ['Saisie', 'Heures'],
        clients: ['Gestion', 'Bibliothèque des clients'],
        affaires: ['Gestion', 'Gestion des affaires'],
        postes: ['Gestion', 'Bibliothèque des postes'],
        users: ['Gestion', 'Bibliothèque des utilisateurs']
    };

    function placeCursor(el) {
        const nav = $('#nav'), cur = $('#navCursor');
        if (!nav || !cur || !el) return;
        const nb = nav.getBoundingClientRect(), b = el.getBoundingClientRect();
        if (!b.height) { cur.style.opacity = '0'; return; }
        cur.style.opacity = '1';
        cur.style.height = b.height + 'px';
        cur.style.transform = 'translateY(' + (b.top - nb.top + nav.scrollTop) + 'px)';
    }

    function go(view) {
        $$('.nav-item').forEach(b => b.classList.toggle('is-on', b.dataset.view === view));
        $$('.view').forEach(v => v.classList.toggle('is-on', v.dataset.view === view));

        const on = $$('.nav-item').find(b => b.dataset.view === view);
        if (on) placeCursor(on);

        const c = CRUMBS[view] || ['', ''];
        $('#crumbTop').textContent = c[0];
        $('#crumbMain').textContent = c[1];

        // le bouton d'ajout d'entrée n'a de sens que sur l'onglet Heures
        const add = $('#addBtn');
        if (add) add.style.display = (view === 'hours' && currentUser) ? 'grid' : 'none';

        if (view === 'clients') renderClients();
        else if (view === 'affaires') {
            renderAffairesStats();
            renderAffaires();
            // les devis arrivent en différé : on redessine à leur réception
            chargerDevis().then(renderAffaires);
        }
        else if (view === 'postes') renderPostes();
        else if (view === 'users') renderUsers();
        else renderEntries();

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    window.go = go;

    // app.js appelle encore switchTab / switchLibrary : on les redirige.
    window.switchTab = function (tabName) {
        go(tabName === 'management' ? 'clients' : 'hours');
    };
    window.switchLibrary = function (libraryName) { go(libraryName); };

    /* ============================================= après la connexion ==== */

    const _showApp = window.showApp;
    window.showApp = function () {
        _showApp.apply(this, arguments);

        // app.js pilote #managementTabBtn et #devisAppBtn : on aligne le
        // groupe "Outil" sur la visibilité du bouton Devis.
        const admin = (typeof isAdmin === 'function') && isAdmin();
        const grp = $('#devisNavGroup');
        if (grp) grp.style.display = admin ? 'block' : 'none';

        const roleLabel = $('#userRoleLabel');
        if (roleLabel) roleLabel.textContent = admin ? 'Administrateur' : 'Utilisateur';

        const icon = $('#userIcon');
        if (icon) icon.textContent = admin ? '🛠' : '👤';

        chargerDevis();
        go('hours');
    };

    /* =================================================== accès rapide ==== */

    window.renderQuickAccess = function (grouped) {
        const container = $('#quickAccessAffaires');
        const card = $('#quickAccessCard');
        if (!container || !card) return;

        const enCours = affaires.filter(a => !a.statut || a.statut === 'en_cours');
        if (enCours.length === 0) { card.style.display = 'none'; return; }
        card.style.display = 'block';

        const byClient = {};
        enCours.forEach(a => {
            const c = clients.find(x => x.id === a.clientId);
            const name = c ? c.name : 'Client inconnu';
            (byClient[name] = byClient[name] || []).push({
                affaire: a,
                hours: grouped && grouped[a.id] ? grouped[a.id].totalHours : 0
            });
        });

        container.innerHTML = Object.keys(byClient).sort((a, b) => a.localeCompare(b)).map(name => {
            const list = byClient[name].sort((x, y) =>
                (x.affaire.name || '').localeCompare(y.affaire.name || ''));
            const tot = list.reduce((s, i) => s + i.hours, 0);
            return '<div class="qa-client">'
                + '<div class="qa-head"><h3>' + esc(name) + '</h3><div class="rule"></div>'
                + '<span class="qa-total">' + h1(tot) + ' h</span></div>'
                + '<div class="qa-list">' + list.map(i => {
                    const a = i.affaire;
                    return '<button class="qa-btn" onclick="quickSelectAffaire(\'' + a.clientId + '\',\'' + a.id + '\')">'
                        + '<div class="qa-top"><span class="qa-name">' + esc(a.name) + '</span>'
                        + '<span class="qa-h">' + h1(i.hours) + ' h</span></div>'
                        + (a.description ? '<div class="qa-desc">' + esc(a.description) + '</div>' : '')
                        + '</button>';
                }).join('') + '</div></div>';
        }).join('');
    };

    /* ================================================= liste d'entrées ==== */

    window.renderEntries = function () {
        const container = $('#entriesList');
        if (!container) return;

        const admin = isAdmin();
        const scope = $('#entriesScope');
        if (scope) scope.textContent = admin ? 'Toutes les saisies' : 'Mes saisies uniquement';

        // Groupement identique à l'original : par affaire, en excluant les
        // affaires terminées/archivées, et les saisies d'autrui pour un
        // utilisateur non administrateur.
        const grouped = {};
        entries.forEach(entry => {
            const affaire = affaires.find(a => a.id === entry.affaireId);
            if (affaire && (affaire.statut === 'archivee' || affaire.statut === 'terminee')) return;
            if (!admin && entry.enteredBy && entry.enteredBy !== currentUser.name) return;

            const key = entry.affaireId;
            if (!grouped[key]) {
                grouped[key] = { affaireId: key, totalHours: 0, posteDetails: {}, entries: [] };
            }
            grouped[key].totalHours += parseFloat(entry.hours) || 0;
            grouped[key].entries.push(entry);

            const poste = postes.find(p => p.id === entry.posteId);
            const pn = poste ? poste.name : 'Poste inconnu';
            grouped[key].posteDetails[pn] = (grouped[key].posteDetails[pn] || 0) + (parseFloat(entry.hours) || 0);
        });

        const keys = Object.keys(grouped);
        if (keys.length === 0) {
            container.innerHTML = '<div class="empty-state">'
                + '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>'
                + '<polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line>'
                + '<line x1="9" y1="15" x2="15" y2="15"></line></svg>'
                + '<p>Aucune entrée</p><p style="font-size:.85rem;">Appuyez sur + pour ajouter</p></div>';
            renderQuickAccess(grouped);
            return;
        }

        container.innerHTML = keys.map(k => {
            const g = grouped[k];
            const affaire = affaires.find(a => a.id === g.affaireId);
            const client = affaire ? clients.find(c => c.id === affaire.clientId) : null;

            const chips = Object.keys(g.posteDetails).map(n =>
                '<span class="poste-chip">' + esc(n) + ' · ' + h1(g.posteDetails[n]) + ' h</span>').join('');

            const dets = g.entries.slice().sort((x, y) =>
                String(y.date).localeCompare(String(x.date))).map(entry => {
                const d = new Date(entry.date).toLocaleDateString('fr-FR',
                    { day: '2-digit', month: '2-digit', year: 'numeric' });
                const poste = postes.find(p => p.id === entry.posteId);
                const canEdit = admin || entry.enteredBy === currentUser.name;
                return '<div class="det"><div class="det-body">'
                    + '<div class="det-l1">' + d + '</div>'
                    + '<div class="det-l2">' + esc(poste ? poste.name : 'Inconnu') + '</div>'
                    + ((admin && entry.enteredBy) ? '<div class="det-by">Saisi par ' + esc(entry.enteredBy) + '</div>' : '')
                    + '</div>'
                    + '<div class="det-h">' + h1(entry.hours) + ' h</div>'
                    + (canEdit ? '<div class="det-acts">'
                        + '<button class="btn btn-sm" onclick="editEntry(\'' + entry.id + '\')" aria-label="Modifier">' + ICON.edit + '</button>'
                        + '<button class="btn btn-sm btn-danger" onclick="deleteEntry(\'' + entry.id + '\')" aria-label="Supprimer">' + ICON.trash + '</button>'
                        + '</div>' : '')
                    + '</div>';
            }).join('');

            return '<div class="entry-item">'
                + '<div class="entry-header"><span class="entry-client">'
                + esc(client ? client.name : 'Client inconnu') + '</span>'
                + '<span class="entry-hours">' + h1(g.totalHours) + ' h</span></div>'
                + '<div class="entry-info">' + esc(affaire ? affaire.name : 'Affaire inconnue') + '</div>'
                + (affaire && affaire.description
                    ? '<div class="entry-info" style="color:var(--ink-dim);font-size:12px;font-style:italic;margin-top:3px;">'
                      + esc(affaire.description) + '</div>' : '')
                + '<div class="postes-chips">' + chips + '</div>'
                + '<div class="entry-count">' + g.entries.length + ' saisie'
                + (g.entries.length > 1 ? 's' : '') + '</div>'
                + '<div class="details"><div class="details-lab">Détail des saisies</div>' + dets + '</div>'
                + '</div>';
        }).join('');

        renderQuickAccess(grouped);
    };

    /* ========================================================= clients ==== */

    window.renderClients = function () {
        const container = $('#clientsList');
        if (!container) return;

        const badge = $('#badgeClients');
        if (badge) badge.textContent = (clients || []).length;

        if (!clients || clients.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>Aucun client créé</p></div>';
            updateAffaireModalClients();
            return;
        }

        container.innerHTML = clients.map(client => {
            const nb = affaires.filter(a => a.clientId === client.id).length;
            const safe = esc(client.name).replace(/'/g, "\\'");
            return '<div class="admin-card"><div class="item-body">'
                + '<div class="item-title">' + esc(client.name) + '</div>'
                + '<div class="item-info"><b>' + nb + '</b> affaire' + (nb > 1 ? 's' : '') + '</div></div>'
                + '<div class="item-actions">'
                + '<button class="btn btn-sm" onclick="openRenameModal(\'client\',\'' + client.id + '\',\'' + safe + '\')">Renommer</button>'
                + '<button class="btn btn-sm btn-danger" onclick="openDeleteModal(\'client\',\'' + client.id + '\',\'' + safe + '\')">Supprimer</button>'
                + '</div></div>';
        }).join('');

        // Indispensable : réalimente le sélecteur client de la modale affaire.
        updateAffaireModalClients();
    };

    /* ======================================================== affaires ==== */

    window.renderAffairesStats = function () {
        const el = $('#affairesStats');
        if (!el) return;
        const enCours = affaires.filter(a => (a.statut || 'en_cours') === 'en_cours').length;
        const terminees = affaires.filter(a => a.statut === 'terminee').length;
        const archivees = affaires.filter(a => a.statut === 'archivee').length;
        const total = entries.reduce((s, e) => s + (parseFloat(e.hours) || 0), 0);

        el.innerHTML = [
            ['En cours', enCours, '', 'stat--ok'],
            ['Terminées', terminees, '', 'stat--wait'],
            ['Archivées', archivees, '', 'stat--idle'],
            ['Total heures', h1(total).replace('.', ','), 'h', 'stat--arc']
        ].map(c => '<div class="stat ' + c[3] + '"><div class="eyebrow">' + c[0] + '</div>'
            + '<div class="stat-val">' + c[1] + (c[2] ? '<small>' + c[2] + '</small>' : '') + '</div></div>').join('');
    };

    window.renderAffaireMenu = function (affaire) {
        const statut = affaire.statut || 'en_cours';
        let items;
        if (statut === 'en_cours') {
            items = '<div class="affaire-menu-item" onclick="changeAffaireStatut(\'' + affaire.id + '\',\'terminee\')">Terminer</div>';
        } else if (statut === 'terminee') {
            items = '<div class="affaire-menu-item" onclick="changeAffaireStatut(\'' + affaire.id + '\',\'en_cours\')">Réactiver</div>'
                  + '<div class="affaire-menu-item" onclick="changeAffaireStatut(\'' + affaire.id + '\',\'archivee\')">Archiver</div>';
        } else {
            items = '<div class="affaire-menu-item" onclick="changeAffaireStatut(\'' + affaire.id + '\',\'en_cours\')">Réactiver</div>';
        }
        return '<div class="affaire-menu" id="menu-' + affaire.id + '">'
            + '<div class="affaire-menu-item" onclick="openEditAffaireModal(\'' + affaire.id + '\')">Modifier</div>'
            + items
            + '<div class="affaire-menu-item danger" onclick="confirmDeleteAffaire(\'' + affaire.id + '\')">Supprimer</div>'
            + '</div>';
    };


    // Bandeau budget / réel affiché sur la fiche d'une affaire.
    function comparaisonCarte(affaireId, reel) {
        const dv = devisParAffaire[affaireId];
        if (!dv) return '<div class="devis-sans">Aucun devis</div>';

        const budget = budgetHeures(dv);
        if (budget <= 0) return '<div class="devis-sans">Devis sans heures</div>';

        const ecart = reel - budget;
        const pct = Math.round(reel / budget * 100);
        const classe = ecart > 0.005 ? 'depasse' : (ecart < -0.005 ? 'sous' : 'neutre');

        return '<div class="devis-cmp">'
            + '<div class="devis-cmp-top">'
            +   '<span>devis <b>' + h1(budget) + ' h</b></span>'
            +   '<span>pointé <b>' + h1(reel) + ' h</b></span>'
            +   '<span class="e ' + classe + '">' + (ecart > 0 ? '+' : '') + h1(ecart) + ' h</span>'
            + '</div>'
            + '<div class="devis-jauge"><i class="' + classe + '" style="width:'
            + Math.min(100, pct) + '%"></i></div>'
            + '</div>';
    }

    window.renderAffaireCard = function (affaire) {
        const statut = affaire.statut || 'en_cours';
        const label = statut === 'en_cours' ? 'En cours'
                    : statut === 'terminee' ? 'Terminée' : 'Archivée';
        const heures = entries.filter(e => e.affaireId === affaire.id)
            .reduce((s, e) => s + (parseFloat(e.hours) || 0), 0);

        return '<div class="affaire-card" id="affaire-' + affaire.id + '">'
            + '<div class="affaire-card-header"><div style="flex:1;min-width:0;">'
            + '<div class="affaire-card-title">' + esc(affaire.name) + '</div></div>'
            + '<span class="pill ' + statut + '">' + label + '</span></div>'
            + (affaire.description
                ? '<div class="affaire-card-description">' + esc(affaire.description) + '</div>' : '')
            + '<div class="affaire-card-hours">' + h2(heures) + ' h</div>'
            + comparaisonCarte(affaire.id, heures)
            + '<div class="affaire-card-actions">'
            + '<button class="affaire-card-btn affaire-card-btn-primary" onclick="preparerDevisApp(\'' + affaire.id + '\')">Devis</button>'
            + '<button class="affaire-card-btn affaire-card-btn-menu" onclick="toggleAffaireMenu(event,\'' + affaire.id + '\')" aria-label="Plus d\'actions">···</button>'
            + '</div>'
            + renderAffaireMenu(affaire)
            + '</div>';
    };

    window.renderAffaires = function () {
        renderAffairesStats();

        const container = $('#affairesList');
        if (!container) return;

        const badge = $('#badgeAffaires');
        if (badge) badge.textContent = (affaires || []).length;

        if (!affaires || affaires.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>Aucune affaire créée</p></div>';
            return;
        }

        const filterValue = ($('#filterStatut') || {}).value || 'en_cours';
        // copie : on ne réordonne jamais le tableau global
        let filtered = affaires.slice();
        if (filterValue !== 'all') {
            filtered = filtered.filter(a => (a.statut || 'en_cours') === filterValue);
        }

        const term = (typeof currentSearchTerm === 'string' ? currentSearchTerm : '').toLowerCase();
        if (term) {
            filtered = filtered.filter(a => {
                const c = clients.find(x => x.id === a.clientId);
                return (a.name || '').toLowerCase().includes(term)
                    || (c ? c.name.toLowerCase().includes(term) : false);
            });
        }

        if (filtered.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>Aucune affaire trouvée</p></div>';
            return;
        }

        const sortValue = ($('#sortAffaires') || {}).value || 'recent';
        if (sortValue === 'name') {
            filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        } else if (sortValue === 'hours') {
            const hOf = id => entries.filter(e => e.affaireId === id)
                .reduce((s, e) => s + (parseFloat(e.hours) || 0), 0);
            filtered.sort((a, b) => hOf(b.id) - hOf(a.id));
        }

        const byClient = {};
        filtered.forEach(a => {
            const k = a.clientId || 'no-client';
            (byClient[k] = byClient[k] || []).push(a);
        });

        container.innerHTML = Object.keys(byClient).map(cid => {
            const client = clients.find(c => c.id === cid);
            const list = byClient[cid];
            return '<div class="client-group">'
                + '<div class="client-group-header"><div class="client-group-title">'
                + esc(client ? client.name : 'Sans client') + '</div>'
                + '<div class="rule"></div>'
                + '<span class="client-group-count">' + list.length + '</span></div>'
                + '<div class="affaires-grid">' + list.map(renderAffaireCard).join('') + '</div>'
                + '</div>';
        }).join('');
    };

    /* ========================================================== postes ==== */

    window.renderPostes = function () {
        const container = $('#postesList');
        if (!container) return;

        const badge = $('#badgePostes');
        if (badge) badge.textContent = (postes || []).length;

        if (!postes || postes.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>Aucun poste créé</p></div>';
            return;
        }

        container.innerHTML = postes.map((poste, index) => {
            const list = entries.filter(e => e.posteId === poste.id);
            const heures = list.reduce((s, e) => s + (parseFloat(e.hours) || 0), 0);
            const first = index === 0, last = index === postes.length - 1;
            const safe = esc(poste.name).replace(/'/g, "\\'");
            return '<div class="admin-card">'
                + '<div class="ord">'
                + '<button onclick="movePoste(\'' + poste.id + '\',-1)"' + (first ? ' disabled' : '') + ' aria-label="Monter">' + ICON.up + '</button>'
                + '<button onclick="movePoste(\'' + poste.id + '\',1)"' + (last ? ' disabled' : '') + ' aria-label="Descendre">' + ICON.down + '</button>'
                + '</div>'
                + '<div class="item-body"><div class="item-title">' + esc(poste.name)
                + (poste.isMachine ? '<span class="chip-m">MACHINE</span>' : '') + '</div>'
                + '<div class="item-info">' + list.length + ' entrée' + (list.length > 1 ? 's' : '')
                + ' · <b>' + h2(heures) + ' h</b></div></div>'
                + '<div class="item-actions">'
                + '<button class="btn btn-sm" onclick="openRenameModal(\'poste\',\'' + poste.id + '\',\'' + safe + '\')">Renommer</button>'
                + '<button class="btn btn-sm btn-danger" onclick="openDeleteModal(\'poste\',\'' + poste.id + '\',\'' + safe + '\')">Supprimer</button>'
                + '</div></div>';
        }).join('');
    };

    /* ==================================================== utilisateurs ==== */

    window.renderUsers = function () {
        const container = $('#usersList');
        if (!container) return;

        const regular = (users || []).filter(u => u.id !== '1' && u.name !== 'Admin');

        const badge = $('#badgeUsers');
        if (badge) badge.textContent = regular.length;

        if (regular.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>Aucun utilisateur créé</p></div>';
            return;
        }

        container.innerHTML = regular.map(user => {
            const list = entries.filter(e => e.enteredBy === user.name);
            const heures = list.reduce((s, e) => s + (parseFloat(e.hours) || 0), 0);
            const safe = esc(user.name).replace(/'/g, "\\'");
            return '<div class="admin-card"><div class="item-body">'
                + '<div class="item-title">' + esc(user.name) + '</div>'
                + '<div class="item-info">Code ••••••  ·  ' + list.length + ' entrée'
                + (list.length > 1 ? 's' : '') + ' · <b>' + h2(heures) + ' h</b></div></div>'
                + '<div class="item-actions">'
                + '<button class="btn btn-sm" onclick="openRenameModal(\'user\',\'' + user.id + '\',\'' + safe + '\')">Renommer</button>'
                + '<button class="btn btn-sm" onclick="openChangePasswordModal(\'' + user.id + '\',\'' + safe + '\')">Changer code</button>'
                + '<button class="btn btn-sm btn-danger" onclick="openDeleteModal(\'user\',\'' + user.id + '\',\'' + safe + '\')">Supprimer</button>'
                + '</div></div>';
        }).join('');
    };

    /* =================================================== notifications ==== */

    window.showNotification = function (message, type) {
        let el = $('#v2Toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'v2Toast';
            el.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:90;'
                + 'display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:7px;'
                + 'background:var(--panel);color:var(--ink);font-size:13.5px;font-weight:500;'
                + 'box-shadow:var(--shadow);transform:translateY(90px);opacity:0;'
                + 'transition:transform .34s cubic-bezier(.24,1.2,.4,1),opacity .28s;';
            document.body.appendChild(el);
        }
        el.style.border = '1px solid ' + (type === 'error' ? 'var(--stop)' : 'var(--ok)');
        el.textContent = message;
        requestAnimationFrame(() => {
            el.style.transform = 'none';
            el.style.opacity = '1';
        });
        clearTimeout(el._t);
        el._t = setTimeout(() => {
            el.style.transform = 'translateY(90px)';
            el.style.opacity = '0';
        }, 3000);
    };

    /* ========================================================= pupitre ==== */

    document.addEventListener('DOMContentLoaded', () => {
        $$('.nav-item[data-view]').forEach(b =>
            b.addEventListener('click', () => go(b.dataset.view)));

        const tight = $('#tightBtn');
        if (tight) tight.addEventListener('click', () => {
            $('#appScreen').classList.toggle('is-tight');
            setTimeout(() => {
                const on = $$('.nav-item').find(b => b.classList.contains('is-on'));
                if (on) placeCursor(on);
            }, 400);
        });

        const theme = $('#themeBtn');
        if (theme) theme.addEventListener('click', () => {
            const root = document.documentElement;
            const dark = !matchMedia('(prefers-color-scheme: light)').matches;
            const cur = root.getAttribute('data-theme') || (dark ? 'dark' : 'light');
            const next = cur === 'dark' ? 'light' : 'dark';
            root.setAttribute('data-theme', next);
            try { localStorage.setItem('v2_theme', next); } catch (e) { /* stockage indisponible */ }
        });

        try {
            const saved = localStorage.getItem('v2_theme');
            if (saved) document.documentElement.setAttribute('data-theme', saved);
        } catch (e) { /* stockage indisponible */ }

        window.addEventListener('resize', () => {
            const on = $$('.nav-item').find(b => b.classList.contains('is-on'));
            if (on) placeCursor(on);
        });

        /* ---- telephone uniquement : le rail est un tiroir ----
           Sur ordinateur, "is-tight" replie le rail et ces deux
           comportements sont volontairement inactifs. */
        const surTelephone = () => window.matchMedia('(max-width: 720px)').matches;

        // refermer le tiroir apres avoir choisi une rubrique
        $$('.nav-item').forEach(b => b.addEventListener('click', () => {
            if (surTelephone()) $('#appScreen').classList.remove('is-tight');
        }));

        // refermer le tiroir en touchant le voile
        const stage = $('.stage');
        if (stage) stage.addEventListener('click', e => {
            const app = $('#appScreen');
            if (surTelephone() && app.classList.contains('is-tight') && e.target === stage) {
                app.classList.remove('is-tight');
            }
        });
    });
})();
