// Configuration API
const API_URL = window.location.origin + '/api';

// Configuration des utilisateurs
const USER_CODES = {
    admin: 'ADMIN',
    user: 'SOMEPRE'
};

// État de l'application
let entries = [];
let clients = [];
let affaires = [];
let postes = [];
let users = [];
let editingId = null;
let currentUser = null;
let currentTab = 'entries';
let syncInterval = null;
let isFormActive = false; // Flag pour savoir si l'utilisateur est en train de saisir

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    setupLoginForm();
});

// ===== AUTHENTIFICATION =====

function checkAuth() {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        showApp();
    }
}

async function setupLoginForm() {
    // Charger les utilisateurs depuis le serveur
    await loadUsersForLogin();

    const loginForm = document.getElementById('loginForm');
    const userTypeBtns = document.querySelectorAll('.user-type-btn');
    const userSelectGroup = document.getElementById('userSelectGroup');
    const accessCodeLabel = document.querySelector('label[for="accessCode"]');
    const accessCodeInput = document.getElementById('accessCode');
    let selectedType = 'user';

    // Fonction pour mettre à jour la liste des utilisateurs
    function updateUserSelect() {
        const userSelect = document.getElementById('userSelect');
        userSelect.innerHTML = '<option value="">Sélectionner votre nom</option>';
        users.forEach(user => {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = user.name;
            userSelect.appendChild(option);
        });
    }

    updateUserSelect();

    // Initialiser l'état du formulaire (par défaut en mode utilisateur)
    const userSelect = document.getElementById('userSelect');
    userSelect.required = true;

    userTypeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            userTypeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedType = btn.dataset.type;

            const userSelect = document.getElementById('userSelect');

            // Afficher/masquer le sélecteur d'utilisateur
            if (selectedType === 'user') {
                userSelectGroup.style.display = 'block';
                userSelect.required = true;
                accessCodeLabel.textContent = 'Mot de passe';
                accessCodeInput.placeholder = 'Entrez votre mot de passe';
            } else {
                userSelectGroup.style.display = 'none';
                userSelect.required = false;
                accessCodeLabel.textContent = 'Code Admin';
                accessCodeInput.placeholder = 'Entrez le code admin';
            }
        });
    });

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const code = document.getElementById('accessCode').value;

        if (selectedType === 'admin' && code === USER_CODES.admin) {
            login('admin', null);
        } else if (selectedType === 'user') {
            const userSelect = document.getElementById('userSelect');
            const selectedUserId = userSelect.value;

            if (!selectedUserId) {
                showError('Veuillez sélectionner votre nom');
                return;
            }

            const user = users.find(u => u.id === selectedUserId);
            if (user && user.password === code) {
                login('user', user);
            } else {
                showError('Mot de passe incorrect');
            }
        } else {
            showError('Code d\'accès incorrect');
        }
    });
}

async function loadUsersForLogin() {
    try {
        const response = await fetch(`${API_URL}/users`);
        if (response.ok) {
            const data = await response.json();
            users = data.users || [];
        }
    } catch (error) {
        console.error('Erreur:', error);
        const saved = localStorage.getItem('affaires_users');
        if (saved) {
            users = JSON.parse(saved);
        }
    }
}

function login(userType, user) {
    if (userType === 'admin') {
        currentUser = { type: 'admin', name: 'Administrateur' };
    } else {
        currentUser = {
            type: 'user',
            name: user.name,
            userId: user.id
        };
    }
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    document.getElementById('accessCode').value = '';
    hideError();
    showApp();
}

function logout() {
    if (confirm('Voulez-vous vraiment vous déconnecter ?')) {
        stopAutoSync();
        currentUser = null;
        localStorage.removeItem('currentUser');
        document.getElementById('appScreen').classList.add('hidden');
        document.getElementById('loginScreen').classList.remove('hidden');
        document.getElementById('addBtn').style.display = 'none';
    }
}

function showApp() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('appScreen').classList.remove('hidden');
    document.getElementById('addBtn').style.display = 'block';

    const userIcon = document.getElementById('userIcon');
    const userTypeText = document.getElementById('userType');

    if (currentUser.type === 'admin') {
        userIcon.textContent = '👨‍💼';
        userTypeText.textContent = currentUser.name;
        document.getElementById('managementTabBtn').style.display = 'block';
    } else {
        userIcon.textContent = '👤';
        userTypeText.textContent = currentUser.name;
    }

    loadAllData();
    setupEventListeners();
    startAutoSync();
}

// Démarrer la synchronisation automatique
function startAutoSync() {
    // Synchroniser toutes les 30 secondes
    if (syncInterval) {
        clearInterval(syncInterval);
    }
    syncInterval = setInterval(async () => {
        // Ne pas synchroniser si l'utilisateur est en train de saisir dans le modal
        if (isFormActive) {
            console.log('Synchronisation ignorée - formulaire actif');
            return;
        }
        try {
            await loadAllData();
        } catch (error) {
            console.error('Erreur de synchronisation:', error);
        }
    }, 30000); // 30 secondes
}

// Arrêter la synchronisation automatique
function stopAutoSync() {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
    }
}

function setupEventListeners() {
    document.getElementById('entryForm').addEventListener('submit', handleSubmit);
    document.getElementById('client').addEventListener('change', updateAffairesSelect);
    document.getElementById('affaire').addEventListener('change', handleAffaireChange);
    document.getElementById('modal').addEventListener('click', (e) => {
        if (e.target.id === 'modal') {
            closeModal();
        }
    });
}

function handleAffaireChange() {
    const affaireSelect = document.getElementById('affaire');
    const newAffaireGroup = document.getElementById('newAffaireGroup');
    const posteGroup = document.querySelector('label[for="poste"]').parentElement;
    const posteSelect = document.getElementById('poste');

    if (affaireSelect.value === '__new__') {
        newAffaireGroup.style.display = 'block';
        posteGroup.style.display = 'none';
        posteSelect.required = false; // Désactiver le required pour nouvelle affaire soudure
    } else {
        newAffaireGroup.style.display = 'none';
        posteGroup.style.display = 'block';
        posteSelect.required = true; // Réactiver le required pour affaires existantes
    }
}

function isAdmin() {
    return currentUser && currentUser.type === 'admin';
}

function showError(message) {
    const errorEl = document.getElementById('errorMessage');
    errorEl.textContent = message;
    errorEl.classList.add('show');
    setTimeout(() => hideError(), 3000);
}

function hideError() {
    const errorEl = document.getElementById('errorMessage');
    errorEl.classList.remove('show');
}

// ===== GESTION DES ONGLETS =====

function switchTab(tabName, evt) {
    currentTab = tabName;

    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    if (evt && evt.target) {
        evt.target.classList.add('active');
    }

    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    if (tabName === 'entries') {
        document.getElementById('entriesTab').classList.add('active');
    } else if (tabName === 'management') {
        document.getElementById('managementTab').classList.add('active');
        loadManagementData();
    }
}

function switchLibrary(libraryName, evt) {
    // Retirer l'active de tous les boutons de bibliothèque
    evt.target.parentElement.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    evt.target.classList.add('active');

    // Cacher toutes les bibliothèques
    document.querySelectorAll('.library-content').forEach(content => content.classList.remove('active'));

    // Afficher la bibliothèque sélectionnée
    const libraryMap = {
        'clients': 'libraryClients',
        'affaires': 'libraryAffaires',
        'postes': 'libraryPostes',
        'users': 'libraryUsers'
    };

    const libraryId = libraryMap[libraryName];
    if (libraryId) {
        document.getElementById(libraryId).classList.add('active');
    }
}

// ===== CHARGEMENT DES DONNÉES =====

async function loadAllData() {
    await Promise.all([
        loadEntries(),
        loadClients(),
        loadAffaires(),
        loadPostes(),
        loadUsers()
    ]);

    updateSelects();
    renderEntries(); // Re-render après que tout soit chargé
}

async function loadEntries() {
    try {
        const response = await fetch(`${API_URL}/entries`);
        if (response.ok) {
            const data = await response.json();
            entries = data.entries || [];
            saveToLocalStorage();
            updateSyncStatus('synced', 'Synchronisé');
        } else {
            throw new Error('Erreur serveur');
        }
    } catch (error) {
        console.error('Erreur de chargement:', error);
        const saved = localStorage.getItem('affaires_entries');
        entries = saved ? JSON.parse(saved) : [];
        updateSyncStatus('error', 'Mode hors-ligne');
    }
}

async function loadClients() {
    try {
        const response = await fetch(`${API_URL}/clients`);
        if (response.ok) {
            const data = await response.json();
            clients = data.clients || [];
            saveToLocalStorage();
        }
    } catch (error) {
        console.error('Erreur de chargement des clients:', error);
        const saved = localStorage.getItem('affaires_clients');
        clients = saved ? JSON.parse(saved) : [];
    }
}

async function loadAffaires() {
    try {
        const response = await fetch(`${API_URL}/affaires`);
        if (response.ok) {
            const data = await response.json();
            affaires = data.affaires || [];
            saveToLocalStorage();
        }
    } catch (error) {
        console.error('Erreur de chargement des affaires:', error);
        const saved = localStorage.getItem('affaires_affaires');
        affaires = saved ? JSON.parse(saved) : [];
    }
}

async function loadPostes() {
    try {
        const response = await fetch(`${API_URL}/postes`);
        if (response.ok) {
            const data = await response.json();
            postes = data.postes || [];
            saveToLocalStorage();
        }
    } catch (error) {
        console.error('Erreur de chargement des postes:', error);
        const saved = localStorage.getItem('affaires_postes');
        postes = saved ? JSON.parse(saved) : [];
    }
}

function updateSyncStatus(status, message) {
    const el = document.getElementById('syncStatus');
    el.textContent = message;
    el.className = `sync-status ${status}`;
}

// ===== GESTION DES ENTRÉES =====

async function saveEntry(entry) {
    try {
        const response = await fetch(`${API_URL}/entries`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entry)
        });
        if (response.ok) {
            const newEntry = await response.json();
            entries.push(newEntry);
            saveToLocalStorage(); // IMPORTANT: Sauvegarder dans localStorage aussi !
            updateSyncStatus('synced', 'Synchronisé');
        } else {
            throw new Error('Erreur serveur');
        }
    } catch (error) {
        console.error('Erreur de sauvegarde:', error);
        entry.id = Date.now().toString();
        entry.date = new Date().toISOString();
        entries.push(entry);
        saveToLocalStorage();
        updateSyncStatus('error', 'Sauvegardé localement');
    }
    renderEntries();
}

async function updateEntry(id, updatedData) {
    try {
        const response = await fetch(`${API_URL}/entries/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedData)
        });
        if (response.ok) {
            const updated = await response.json();
            const index = entries.findIndex(e => e.id === id);
            if (index !== -1) {
                entries[index] = updated;
            }
            saveToLocalStorage(); // IMPORTANT: Sauvegarder dans localStorage aussi !
            updateSyncStatus('synced', 'Synchronisé');
        } else {
            throw new Error('Erreur serveur');
        }
    } catch (error) {
        console.error('Erreur de mise à jour:', error);
        const index = entries.findIndex(e => e.id === id);
        if (index !== -1) {
            entries[index] = { ...entries[index], ...updatedData };
        }
        saveToLocalStorage();
        updateSyncStatus('error', 'Mis à jour localement');
    }
    renderEntries();
}

async function deleteEntry(id) {
    const entry = entries.find(e => e.id === id);

    // Les utilisateurs peuvent supprimer uniquement leurs propres saisies
    if (!isAdmin() && (!entry || entry.enteredBy !== currentUser.name)) {
        alert('Vous ne pouvez supprimer que vos propres saisies');
        return;
    }

    if (!confirm('Supprimer cette entrée ?')) return;

    try {
        const response = await fetch(`${API_URL}/entries/${id}`, {
            method: 'DELETE'
        });
        if (response.ok) {
            entries = entries.filter(e => e.id !== id);
            saveToLocalStorage(); // IMPORTANT: Sauvegarder dans localStorage aussi !
            updateSyncStatus('synced', 'Synchronisé');
        } else {
            throw new Error('Erreur serveur');
        }
    } catch (error) {
        console.error('Erreur de suppression:', error);
        entries = entries.filter(e => e.id !== id);
        saveToLocalStorage();
        updateSyncStatus('error', 'Supprimé localement');
    }
    renderEntries();
}

function saveToLocalStorage() {
    localStorage.setItem('affaires_entries', JSON.stringify(entries));
    localStorage.setItem('affaires_clients', JSON.stringify(clients));
    localStorage.setItem('affaires_affaires', JSON.stringify(affaires));
    localStorage.setItem('affaires_postes', JSON.stringify(postes));
    localStorage.setItem('affaires_users', JSON.stringify(users));
}

function renderEntries() {
    const container = document.getElementById('entriesList');
    const totalEl = document.getElementById('totalHours');

    if (entries.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="12" y1="18" x2="12" y2="12"></line>
                    <line x1="9" y1="15" x2="15" y2="15"></line>
                </svg>
                <p>Aucune entrée</p>
                <p style="font-size: 0.85rem;">Appuyez sur + pour ajouter</p>
            </div>
        `;
        totalEl.textContent = '0h';
        return;
    }

    // Grouper les entrées par client/affaire (sans le poste)
    const grouped = {};
    let totalHours = 0;

    entries.forEach(entry => {
        totalHours += parseFloat(entry.hours) || 0;
        const key = `${entry.clientId}_${entry.affaireId}`;

        if (!grouped[key]) {
            grouped[key] = {
                clientId: entry.clientId,
                affaireId: entry.affaireId,
                totalHours: 0,
                posteDetails: {},
                entries: []
            };
        }

        grouped[key].totalHours += parseFloat(entry.hours) || 0;
        grouped[key].entries.push(entry);

        // Grouper aussi par poste pour les détails
        const poste = postes.find(p => p.id === entry.posteId);
        const posteName = poste ? poste.name : 'Poste inconnu';
        if (!grouped[key].posteDetails[posteName]) {
            grouped[key].posteDetails[posteName] = 0;
        }
        grouped[key].posteDetails[posteName] += parseFloat(entry.hours) || 0;
    });

    // Afficher les groupes
    container.innerHTML = Object.values(grouped).map(group => {
        const client = clients.find(c => c.id === group.clientId);
        const affaire = affaires.find(a => a.id === group.affaireId);

        // Détails par poste
        const postesDetailsHTML = Object.entries(group.posteDetails).map(([posteName, hours]) => {
            return `<span style="display: inline-block; background: rgba(33, 150, 243, 0.15); padding: 3px 8px; border-radius: 12px; font-size: 0.85rem; margin-right: 5px; margin-bottom: 5px;">🔧 ${escapeHtml(posteName)}: ${hours.toFixed(1)}h</span>`;
        }).join('');

        // Détails des saisies individuelles
        const detailsHTML = `
            <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.1);">
                <div style="font-size: 0.85rem; color: #888; margin-bottom: 8px;">Détails des saisies :</div>
                ${group.entries.map(entry => {
                    const date = new Date(entry.date).toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric'
                    });
                    const poste = postes.find(p => p.id === entry.posteId);
                    // Afficher "Saisi par" uniquement pour les admins
                    const enteredByHTML = (isAdmin() && entry.enteredBy) ? `<span style="font-size: 0.75rem; color: #666;">👤 Saisi par: ${escapeHtml(entry.enteredBy)}</span>` : '';
                    // Les utilisateurs voient les boutons uniquement pour leurs propres saisies
                    const canEdit = isAdmin() || entry.enteredBy === currentUser.name;
                    const buttonsHTML = canEdit ? `
                        <div style="display: flex; gap: 5px;">
                            <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem;" onclick="editEntry('${entry.id}')">✏️</button>
                            <button class="btn btn-danger" style="padding: 4px 8px; font-size: 0.75rem;" onclick="deleteEntry('${entry.id}')">🗑️</button>
                        </div>
                    ` : '';
                    return `
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; padding: 5px 10px; background: rgba(255,255,255,0.03); border-radius: 6px;">
                            <div style="display: flex; flex-direction: column; gap: 2px;">
                                <span style="font-size: 0.8rem; color: #999;">📅 ${date}</span>
                                <span style="font-size: 0.75rem; color: #777;">🔧 ${escapeHtml(poste ? poste.name : 'Inconnu')}</span>
                                ${enteredByHTML}
                            </div>
                            <span style="font-size: 0.8rem; color: #2196F3; font-weight: 600;">${entry.hours}h</span>
                            ${buttonsHTML}
                        </div>
                    `;
                }).join('')}
            </div>
        `;

        return `
            <div class="entry-item">
                <div class="entry-header">
                    <span class="entry-client">${escapeHtml(client ? client.name : 'Client inconnu')}</span>
                    <span class="entry-hours">${group.totalHours.toFixed(1)}h</span>
                </div>
                <div class="entry-info">📁 ${escapeHtml(affaire ? affaire.name : 'Affaire inconnue')}</div>
                <div style="margin-top: 8px;">
                    ${postesDetailsHTML}
                </div>
                <div class="entry-info" style="color: #666; font-size: 0.85rem; margin-top: 5px;">
                    ${group.entries.length} saisie${group.entries.length > 1 ? 's' : ''}
                </div>
                ${detailsHTML}
            </div>
        `;
    }).join('');

    totalEl.textContent = `${totalHours.toFixed(1)}h`;

    // Afficher les affaires en cours (accès rapide)
    renderQuickAccess(grouped);
}

function renderQuickAccess(grouped) {
    const container = document.getElementById('quickAccessAffaires');
    const card = document.getElementById('quickAccessCard');

    if (Object.keys(grouped).length === 0) {
        card.style.display = 'none';
        return;
    }

    card.style.display = 'block';

    // Filtrer uniquement les affaires en cours (pour tous)
    let groupsToDisplay = Object.values(grouped).filter(group => {
        const affaire = affaires.find(a => a.id === group.affaireId);
        return affaire && (!affaire.statut || affaire.statut === 'en_cours');
    });

    if (groupsToDisplay.length === 0) {
        card.style.display = 'none';
        return;
    }

    container.innerHTML = groupsToDisplay.map(group => {
        const client = clients.find(c => c.id === group.clientId);
        const affaire = affaires.find(a => a.id === group.affaireId);

        return `
            <button
                onclick="quickSelectAffaire('${group.clientId}', '${group.affaireId}')"
                style="
                    padding: 10px 16px;
                    border: 2px solid rgba(33, 150, 243, 0.3);
                    border-radius: 20px;
                    background: rgba(33, 150, 243, 0.1);
                    color: #2196F3;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    font-size: 0.9rem;
                    font-weight: 500;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                "
                onmouseover="this.style.background='rgba(33, 150, 243, 0.2)'; this.style.borderColor='#2196F3';"
                onmouseout="this.style.background='rgba(33, 150, 243, 0.1)'; this.style.borderColor='rgba(33, 150, 243, 0.3)';"
            >
                <span>👥 ${escapeHtml(client ? client.name : 'Client inconnu')}</span>
                <span style="opacity: 0.7;">•</span>
                <span>📁 ${escapeHtml(affaire ? affaire.name : 'Affaire inconnue')}</span>
                <span style="background: rgba(33, 150, 243, 0.3); padding: 2px 8px; border-radius: 10px; font-size: 0.8rem;">${group.totalHours.toFixed(1)}h</span>
            </button>
        `;
    }).join('');
}

function quickSelectAffaire(clientId, affaireId) {
    openModal();
    document.getElementById('client').value = clientId;
    updateAffairesSelect();
    document.getElementById('affaire').value = affaireId;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== MODAL =====

function openModal() {
    isFormActive = true; // Bloquer la synchronisation
    updateSelects();
    document.getElementById('modal').classList.add('active');
    document.getElementById('modalTitle').textContent = 'Nouvelle entrée';
    document.getElementById('submitBtnText').textContent = 'Ajouter';
    document.getElementById('entryForm').reset();
    document.getElementById('newAffaireGroup').style.display = 'none';
    document.getElementById('newAffaireName').value = '';
    document.getElementById('newAffaireDesc').value = '';
    editingId = null;
}

function closeModal() {
    isFormActive = false; // Réactiver la synchronisation
    document.getElementById('modal').classList.remove('active');
    document.getElementById('newAffaireGroup').style.display = 'none';
    editingId = null;
}

function editEntry(id) {
    const entry = entries.find(e => e.id === id);
    if (!entry) return;

    // Les utilisateurs peuvent modifier uniquement leurs propres saisies
    if (!isAdmin() && entry.enteredBy !== currentUser.name) {
        alert('Vous ne pouvez modifier que vos propres saisies');
        return;
    }

    editingId = id;
    updateSelects();
    document.getElementById('modal').classList.add('active');
    document.getElementById('modalTitle').textContent = 'Modifier l\'entrée';
    document.getElementById('submitBtnText').textContent = 'Mettre à jour';

    document.getElementById('client').value = entry.clientId || '';
    updateAffairesSelect();
    document.getElementById('affaire').value = entry.affaireId || '';
    document.getElementById('poste').value = entry.posteId || '';
    document.getElementById('hours').value = entry.hours;
}

async function handleSubmit(e) {
    e.preventDefault();

    if (editingId && !isAdmin()) {
        alert('Seuls les administrateurs peuvent modifier les entrées');
        return;
    }

    let affaireId = document.getElementById('affaire').value;
    let isNewSoudureAffaire = false;

    // Si l'utilisateur veut créer une nouvelle affaire de soudure
    if (affaireId === '__new__') {
        const newAffaireName = document.getElementById('newAffaireName').value.trim();
        const newAffaireDesc = document.getElementById('newAffaireDesc').value.trim();
        const clientId = document.getElementById('client').value;

        if (!newAffaireName) {
            alert('Veuillez entrer un nom pour la nouvelle affaire de soudure');
            return;
        }

        isNewSoudureAffaire = true;

        // Créer la nouvelle affaire
        try {
            const response = await fetch(`${API_URL}/affaires`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newAffaireName,
                    clientId: clientId,
                    description: newAffaireDesc
                })
            });

            if (response.ok) {
                const newAffaire = await response.json();
                affaires.push(newAffaire);
                saveToLocalStorage();
                affaireId = newAffaire.id;
                updateSelects();
            } else {
                throw new Error('Erreur serveur');
            }
        } catch (error) {
            console.error('Erreur:', error);
            alert('Erreur lors de la création de l\'affaire');
            return;
        }
    }

    // Pour les nouvelles affaires de soudure, trouver ou créer le poste "Soudure"
    let posteId = document.getElementById('poste').value;
    if (isNewSoudureAffaire) {
        let soudurePoste = postes.find(p => p.name.toLowerCase() === 'soudure');

        if (!soudurePoste) {
            // Créer le poste Soudure
            try {
                const response = await fetch(`${API_URL}/postes`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: 'Soudure' })
                });

                if (response.ok) {
                    soudurePoste = await response.json();
                    postes.push(soudurePoste);
                    saveToLocalStorage();
                }
            } catch (error) {
                console.error('Erreur:', error);
            }
        }

        posteId = soudurePoste.id;
    }

    const entryData = {
        clientId: document.getElementById('client').value,
        affaireId: affaireId,
        posteId: posteId,
        hours: document.getElementById('hours').value,
        enteredBy: currentUser.name
    };

    if (editingId) {
        await updateEntry(editingId, entryData);
    } else {
        await saveEntry(entryData);
    }

    closeModal();
}

function updateSelects() {
    const clientSelect = document.getElementById('client');
    const posteSelect = document.getElementById('poste');
    const newAffaireClientSelect = document.getElementById('newAffaireClient');

    clientSelect.innerHTML = '<option value="">Sélectionner un client</option>' +
        clients.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');

    posteSelect.innerHTML = '<option value="">Sélectionner un poste</option>' +
        postes.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');

    newAffaireClientSelect.innerHTML = '<option value="">Sélectionner un client</option>' +
        clients.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');

    updateAffairesSelect();
}

function updateAffairesSelect() {
    const clientId = document.getElementById('client').value;
    const affaireSelect = document.getElementById('affaire');

    if (!clientId) {
        affaireSelect.innerHTML = '<option value="">Sélectionner d\'abord un client</option>';
        affaireSelect.disabled = true;
        return;
    }

    affaireSelect.disabled = false;
    let clientAffaires = affaires.filter(a => a.clientId === clientId);

    // Filtrer les affaires en cours (ignorer les terminées)
    clientAffaires = clientAffaires.filter(a => !a.statut || a.statut === 'en_cours');

    let optionsHTML = '<option value="">Sélectionner une affaire</option>';

    // Ajouter l'option pour créer une nouvelle affaire (utilisateurs uniquement)
    if (!isAdmin()) {
        optionsHTML += '<option value="__new__" style="background: rgba(33, 150, 243, 0.2); font-weight: bold;">➕ Nouvelle affaire de soudure</option>';
    }

    // Ajouter les affaires existantes avec description si disponible
    if (clientAffaires.length > 0) {
        optionsHTML += clientAffaires.map(a => {
            const displayText = a.description
                ? `${escapeHtml(a.name)} - ${escapeHtml(a.description.substring(0, 50))}${a.description.length > 50 ? '...' : ''}`
                : escapeHtml(a.name);
            return `<option value="${a.id}" title="${escapeHtml(a.description || '')}">${displayText}</option>`;
        }).join('');
    } else if (isAdmin()) {
        // Message pour admin si aucune affaire
        optionsHTML += '<option value="" disabled style="color: #888;">Aucune affaire en cours pour ce client</option>';
    }

    affaireSelect.innerHTML = optionsHTML;
}

// ===== GESTION (ADMIN) =====

function loadManagementData() {
    renderClients();
    renderAffaires();
    renderPostes();
    updateSelects();
}

async function addClient() {
    const input = document.getElementById('newClient');
    const name = input.value.trim();

    if (!name) {
        alert('Veuillez entrer un nom de client');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/clients`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });

        if (response.ok) {
            const newClient = await response.json();
            clients.push(newClient);
            saveToLocalStorage();
            input.value = '';
            renderClients();
            updateSelects();
        }
    } catch (error) {
        console.error('Erreur:', error);
        alert('Erreur lors de l\'ajout du client');
    }
}

async function deleteClient(id) {
    if (!confirm('Supprimer ce client ? Cela supprimera aussi ses affaires associées.')) return;

    try {
        const response = await fetch(`${API_URL}/clients/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            clients = clients.filter(c => c.id !== id);
            affaires = affaires.filter(a => a.clientId !== id);
            saveToLocalStorage();
            renderClients();
            renderAffaires();
            updateSelects();
        }
    } catch (error) {
        console.error('Erreur:', error);
        alert('Erreur lors de la suppression');
    }
}

function renderClients() {
    const container = document.getElementById('clientsList');
    if (clients.length === 0) {
        container.innerHTML = '<p style="color: #666;">Aucun client</p>';
        return;
    }

    container.innerHTML = clients.map(client => `
        <div class="item-tag">
            <span>${escapeHtml(client.name)}</span>
            <button class="delete-btn" onclick="deleteClient('${client.id}')">×</button>
        </div>
    `).join('');
}

async function addAffaire() {
    const clientId = document.getElementById('newAffaireClient').value;
    const input = document.getElementById('newAffaire');
    const descriptionInput = document.getElementById('newAffaireDescription');
    const name = input.value.trim();
    const description = descriptionInput ? descriptionInput.value.trim() : '';

    if (!clientId) {
        alert('Veuillez sélectionner un client');
        return;
    }

    if (!name) {
        alert('Veuillez entrer un nom d\'affaire');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/affaires`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, clientId, description })
        });

        if (response.ok) {
            const newAffaire = await response.json();
            affaires.push(newAffaire);
            saveToLocalStorage();
            input.value = '';
            if (descriptionInput) descriptionInput.value = '';
            document.getElementById('newAffaireClient').value = '';
            renderAffaires();
            updateSelects();
        }
    } catch (error) {
        console.error('Erreur:', error);
        alert('Erreur lors de l\'ajout de l\'affaire');
    }
}

async function toggleAffaireStatut(id, nouveauStatut) {
    const affaire = affaires.find(a => a.id === id);

    // Si on termine l'affaire, générer le PDF d'abord
    if (nouveauStatut === 'terminee' && affaire) {
        if (!confirm(`Terminer l'affaire "${affaire.name}" ?\n\nUn PDF récapitulatif sera automatiquement généré.`)) {
            return;
        }
        generateAffairePDF(id);
    }

    try {
        const response = await fetch(`${API_URL}/affaires/${id}/statut`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ statut: nouveauStatut })
        });

        if (response.ok) {
            if (affaire) {
                affaire.statut = nouveauStatut;
                saveToLocalStorage();
                renderAffaires();
                updateSelects();
            }
        }
    } catch (error) {
        console.error('Erreur:', error);
        alert('Erreur lors de la mise à jour du statut');
    }
}

async function deleteAffaire(id) {
    if (!confirm('Supprimer définitivement cette affaire et toutes ses entrées ? Cette action est irréversible.')) return;

    try {
        // Le serveur supprime automatiquement l'affaire ET toutes ses entrées en cascade
        const response = await fetch(`${API_URL}/affaires/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            // Mettre à jour les données locales
            affaires = affaires.filter(a => a.id !== id);
            entries = entries.filter(e => e.affaireId !== id);

            // Sauvegarder dans localStorage
            saveToLocalStorage();

            // Rafraîchir l'affichage
            renderAffaires();
            updateSelects();
            renderEntries();
        }
    } catch (error) {
        console.error('Erreur:', error);
        alert('Erreur lors de la suppression');
    }
}

function renderAffaires() {
    const container = document.getElementById('affairesList');
    if (affaires.length === 0) {
        container.innerHTML = '<p style="color: #666;">Aucune affaire</p>';
        return;
    }

    // Séparer les affaires en cours et terminées
    const affairesEnCours = affaires.filter(a => !a.statut || a.statut === 'en_cours');
    const affairesTerminees = affaires.filter(a => a.statut === 'terminee');

    let html = '';

    if (affairesEnCours.length > 0) {
        html += '<div style="margin-bottom: 20px;"><h4 style="color: #2196F3; font-size: 0.9rem; margin-bottom: 10px;">🚀 En cours</h4>';
        html += affairesEnCours.map(affaire => {
            const client = clients.find(c => c.id === affaire.clientId);
            return `
                <div class="item-tag" style="display: flex; gap: 8px; align-items: center;">
                    <span style="flex: 1;">${escapeHtml(affaire.name)} <small style="color: #888;">(${client ? escapeHtml(client.name) : 'Client inconnu'})</small></span>
                    <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.75rem; background: #4CAF50; border: none;" onclick="toggleAffaireStatut('${affaire.id}', 'terminee')">✓ Terminer</button>
                    <button class="delete-btn" onclick="deleteAffaire('${affaire.id}')">×</button>
                </div>
            `;
        }).join('');
        html += '</div>';
    }

    if (affairesTerminees.length > 0) {
        html += '<div><h4 style="color: #888; font-size: 0.9rem; margin-bottom: 10px;">✓ Terminées / Livrées</h4>';
        html += affairesTerminees.map(affaire => {
            const client = clients.find(c => c.id === affaire.clientId);
            return `
                <div class="item-tag" style="display: flex; gap: 8px; align-items: center; opacity: 0.6;">
                    <span style="flex: 1;">${escapeHtml(affaire.name)} <small style="color: #888;">(${client ? escapeHtml(client.name) : 'Client inconnu'})</small></span>
                    <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.75rem;" onclick="toggleAffaireStatut('${affaire.id}', 'en_cours')">↺ Réactiver</button>
                    <button class="delete-btn" onclick="deleteAffaire('${affaire.id}')">×</button>
                </div>
            `;
        }).join('');
        html += '</div>';
    }

    container.innerHTML = html;
}

async function addPoste() {
    const input = document.getElementById('newPoste');
    const name = input.value.trim();

    if (!name) {
        alert('Veuillez entrer un nom de poste');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/postes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });

        if (response.ok) {
            const newPoste = await response.json();
            postes.push(newPoste);
            saveToLocalStorage();
            input.value = '';
            renderPostes();
            updateSelects();
        }
    } catch (error) {
        console.error('Erreur:', error);
        alert('Erreur lors de l\'ajout du poste');
    }
}

async function deletePoste(id) {
    if (!confirm('Supprimer ce poste ?')) return;

    try {
        const response = await fetch(`${API_URL}/postes/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            postes = postes.filter(p => p.id !== id);
            saveToLocalStorage();
            renderPostes();
            updateSelects();
        }
    } catch (error) {
        console.error('Erreur:', error);
        alert('Erreur lors de la suppression');
    }
}

function renderPostes() {
    const container = document.getElementById('postesList');
    if (postes.length === 0) {
        container.innerHTML = '<p style="color: #666;">Aucun poste</p>';
        return;
    }

    container.innerHTML = postes.map(poste => `
        <div class="item-tag">
            <span>${escapeHtml(poste.name)}</span>
            <button class="delete-btn" onclick="deletePoste('${poste.id}')">×</button>
        </div>
    `).join('');
}

// ===== GESTION DES UTILISATEURS =====

async function loadUsers() {
    try {
        const response = await fetch(`${API_URL}/users`);
        if (response.ok) {
            const data = await response.json();
            users = data.users || [];
            saveToLocalStorage();
        }
    } catch (error) {
        console.error('Erreur:', error);
        const saved = localStorage.getItem('affaires_users');
        if (saved) {
            users = JSON.parse(saved);
        }
    }
    renderUsers();
}

async function addUser() {
    const nameInput = document.getElementById('newUserName');
    const passwordInput = document.getElementById('newUserPassword');
    const name = nameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!name || !password) {
        alert('Veuillez entrer un nom et un mot de passe');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, password })
        });

        if (response.ok) {
            const newUser = await response.json();
            users.push(newUser);
            saveToLocalStorage();
            nameInput.value = '';
            passwordInput.value = '';
            renderUsers();
        }
    } catch (error) {
        console.error('Erreur:', error);
        alert('Erreur lors de l\'ajout de l\'utilisateur');
    }
}

async function deleteUser(id) {
    if (!confirm('Supprimer cet utilisateur ?')) return;

    try {
        const response = await fetch(`${API_URL}/users/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            users = users.filter(u => u.id !== id);
            saveToLocalStorage();
            renderUsers();
        }
    } catch (error) {
        console.error('Erreur:', error);
        alert('Erreur lors de la suppression');
    }
}

function renderUsers() {
    const container = document.getElementById('usersList');
    if (users.length === 0) {
        container.innerHTML = '<p style="color: #666;">Aucun utilisateur</p>';
        return;
    }

    container.innerHTML = users.map(user => `
        <div class="item-tag">
            <span>${escapeHtml(user.name)}</span>
            <button class="delete-btn" onclick="deleteUser('${user.id}')">×</button>
        </div>
    `).join('');
}

// ===== GÉNÉRATION PDF =====

function generateAffairePDF(affaireId) {
    const affaire = affaires.find(a => a.id === affaireId);
    if (!affaire) return;

    const client = clients.find(c => c.id === affaire.clientId);
    const affaireEntries = entries.filter(e => e.affaireId === affaireId);

    if (affaireEntries.length === 0) {
        alert('Aucune entrée pour cette affaire');
        return;
    }

    // Calculer les totaux
    let totalHours = 0;
    const posteHours = {};

    affaireEntries.forEach(entry => {
        totalHours += parseFloat(entry.hours) || 0;
        const poste = postes.find(p => p.id === entry.posteId);
        const posteName = poste ? poste.name : 'Inconnu';
        if (!posteHours[posteName]) {
            posteHours[posteName] = 0;
        }
        posteHours[posteName] += parseFloat(entry.hours) || 0;
    });

    // Créer le PDF avec jsPDF
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // En-tête
    doc.setFontSize(20);
    doc.setTextColor(33, 150, 243); // Bleu
    doc.text('RÉCAPITULATIF D\'AFFAIRE', 105, 20, { align: 'center' });

    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(`Date: ${new Date().toLocaleDateString('fr-FR')}`, 20, 35);

    // Informations affaire
    doc.setFontSize(14);
    doc.setTextColor(33, 150, 243);
    doc.text('INFORMATIONS', 20, 50);

    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text(`Client: ${client ? client.name : 'Inconnu'}`, 20, 60);
    doc.text(`Affaire: ${affaire.name}`, 20, 67);
    if (affaire.description) {
        const descLines = doc.splitTextToSize(`Description: ${affaire.description}`, 170);
        doc.text(descLines, 20, 74);
    }

    // Détails par poste
    let yPos = affaire.description ? 90 : 80;
    doc.setFontSize(14);
    doc.setTextColor(33, 150, 243);
    doc.text('HEURES PAR POSTE', 20, yPos);

    yPos += 10;
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);

    Object.entries(posteHours).forEach(([poste, hours]) => {
        doc.text(`${poste}: ${hours.toFixed(1)}h`, 25, yPos);
        yPos += 7;
    });

    // Total
    yPos += 5;
    doc.setFontSize(14);
    doc.setTextColor(33, 150, 243);
    doc.text(`TOTAL: ${totalHours.toFixed(1)} heures`, 20, yPos);

    // Détail des saisies
    yPos += 15;
    doc.setFontSize(14);
    doc.setTextColor(33, 150, 243);
    doc.text('DÉTAIL DES SAISIES', 20, yPos);

    yPos += 10;
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);

    affaireEntries.forEach((entry, index) => {
        if (yPos > 270) {
            doc.addPage();
            yPos = 20;
        }

        const date = new Date(entry.date).toLocaleDateString('fr-FR');
        const poste = postes.find(p => p.id === entry.posteId);
        const posteName = poste ? poste.name : 'Inconnu';

        doc.text(`${index + 1}. ${date} - ${posteName}: ${entry.hours}h`, 25, yPos);
        if (entry.enteredBy) {
            doc.setTextColor(100, 100, 100);
            doc.text(`   Saisi par: ${entry.enteredBy}`, 25, yPos + 5);
            doc.setTextColor(0, 0, 0);
            yPos += 10;
        } else {
            yPos += 7;
        }
    });

    // Sauvegarder le PDF
    const fileName = `Affaire_${affaire.name.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
}

// ===== EMAIL =====

