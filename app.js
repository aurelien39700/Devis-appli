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
let editingId = null;
let currentUser = null;
let currentTab = 'entries';

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

function setupLoginForm() {
    const loginForm = document.getElementById('loginForm');
    const userTypeBtns = document.querySelectorAll('.user-type-btn');
    let selectedType = 'user';

    userTypeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            userTypeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedType = btn.dataset.type;
        });
    });

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const code = document.getElementById('accessCode').value;

        if (selectedType === 'admin' && code === USER_CODES.admin) {
            login('admin');
        } else if (selectedType === 'user' && code === USER_CODES.user) {
            login('user');
        } else {
            showError('Code d\'accès incorrect');
        }
    });
}

function login(userType) {
    currentUser = { type: userType };
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    document.getElementById('accessCode').value = '';
    hideError();
    showApp();
}

function logout() {
    if (confirm('Voulez-vous vraiment vous déconnecter ?')) {
        currentUser = null;
        localStorage.removeItem('currentUser');
        document.getElementById('appScreen').classList.add('hidden');
        document.getElementById('loginScreen').classList.remove('hidden');
        document.getElementById('addBtn').style.display = 'none';
        document.querySelector('.email-btn').style.display = 'none';
    }
}

function showApp() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('appScreen').classList.remove('hidden');
    document.getElementById('addBtn').style.display = 'block';
    document.querySelector('.email-btn').style.display = 'block';

    const userIcon = document.getElementById('userIcon');
    const userTypeText = document.getElementById('userType');

    if (currentUser.type === 'admin') {
        userIcon.textContent = '👨‍💼';
        userTypeText.textContent = 'Administrateur';
        document.getElementById('managementTabBtn').style.display = 'block';
    } else {
        userIcon.textContent = '👤';
        userTypeText.textContent = 'Utilisateur';
    }

    loadAllData();
    setupEventListeners();
}

function setupEventListeners() {
    document.getElementById('entryForm').addEventListener('submit', handleSubmit);
    document.getElementById('client').addEventListener('change', updateAffairesSelect);
    document.getElementById('modal').addEventListener('click', (e) => {
        if (e.target.id === 'modal') {
            closeModal();
        }
    });
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

// ===== CHARGEMENT DES DONNÉES =====

async function loadAllData() {
    await Promise.all([
        loadEntries(),
        loadClients(),
        loadAffaires(),
        loadPostes()
    ]);
    updateSelects();
}

async function loadEntries() {
    try {
        const response = await fetch(`${API_URL}/entries`);
        if (response.ok) {
            const data = await response.json();
            entries = data.entries || [];
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
    renderEntries();
}

async function loadClients() {
    try {
        const response = await fetch(`${API_URL}/clients`);
        if (response.ok) {
            const data = await response.json();
            clients = data.clients || [];
            localStorage.setItem('affaires_clients', JSON.stringify(clients));
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
            localStorage.setItem('affaires_affaires', JSON.stringify(affaires));
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
            localStorage.setItem('affaires_postes', JSON.stringify(postes));
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
    if (!isAdmin()) {
        alert('Seuls les administrateurs peuvent supprimer les entrées');
        return;
    }

    if (!confirm('Supprimer cette entrée ?')) return;

    try {
        const response = await fetch(`${API_URL}/entries/${id}`, {
            method: 'DELETE'
        });
        if (response.ok) {
            entries = entries.filter(e => e.id !== id);
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
            return `<span style="display: inline-block; background: rgba(233, 69, 96, 0.15); padding: 3px 8px; border-radius: 12px; font-size: 0.85rem; margin-right: 5px; margin-bottom: 5px;">🔧 ${escapeHtml(posteName)}: ${hours.toFixed(1)}h</span>`;
        }).join('');

        // Détails des saisies individuelles pour les admins
        const detailsHTML = isAdmin() ? `
            <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.1);">
                <div style="font-size: 0.85rem; color: #888; margin-bottom: 8px;">Détails des saisies :</div>
                ${group.entries.map(entry => {
                    const date = new Date(entry.date).toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric'
                    });
                    const poste = postes.find(p => p.id === entry.posteId);
                    return `
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; padding: 5px 10px; background: rgba(255,255,255,0.03); border-radius: 6px;">
                            <div style="display: flex; flex-direction: column; gap: 2px;">
                                <span style="font-size: 0.8rem; color: #999;">📅 ${date}</span>
                                <span style="font-size: 0.75rem; color: #777;">🔧 ${escapeHtml(poste ? poste.name : 'Inconnu')}</span>
                            </div>
                            <span style="font-size: 0.8rem; color: #e94560; font-weight: 600;">${entry.hours}h</span>
                            <div style="display: flex; gap: 5px;">
                                <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem;" onclick="editEntry('${entry.id}')">✏️</button>
                                <button class="btn btn-danger" style="padding: 4px 8px; font-size: 0.75rem;" onclick="deleteEntry('${entry.id}')">🗑️</button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        ` : '';

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

    container.innerHTML = Object.values(grouped).map(group => {
        const client = clients.find(c => c.id === group.clientId);
        const affaire = affaires.find(a => a.id === group.affaireId);

        return `
            <button
                onclick="quickSelectAffaire('${group.clientId}', '${group.affaireId}')"
                style="
                    padding: 10px 16px;
                    border: 2px solid rgba(233, 69, 96, 0.3);
                    border-radius: 20px;
                    background: rgba(233, 69, 96, 0.1);
                    color: #e94560;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    font-size: 0.9rem;
                    font-weight: 500;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                "
                onmouseover="this.style.background='rgba(233, 69, 96, 0.2)'; this.style.borderColor='#e94560';"
                onmouseout="this.style.background='rgba(233, 69, 96, 0.1)'; this.style.borderColor='rgba(233, 69, 96, 0.3)';"
            >
                <span>👥 ${escapeHtml(client ? client.name : 'Client inconnu')}</span>
                <span style="opacity: 0.7;">•</span>
                <span>📁 ${escapeHtml(affaire ? affaire.name : 'Affaire inconnue')}</span>
                <span style="background: rgba(233, 69, 96, 0.3); padding: 2px 8px; border-radius: 10px; font-size: 0.8rem;">${group.totalHours.toFixed(1)}h</span>
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
    updateSelects();
    document.getElementById('modal').classList.add('active');
    document.getElementById('modalTitle').textContent = 'Nouvelle entrée';
    document.getElementById('submitBtnText').textContent = 'Ajouter';
    document.getElementById('entryForm').reset();
    editingId = null;
}

function closeModal() {
    document.getElementById('modal').classList.remove('active');
    editingId = null;
}

function editEntry(id) {
    if (!isAdmin()) {
        alert('Seuls les administrateurs peuvent modifier les entrées');
        return;
    }

    const entry = entries.find(e => e.id === id);
    if (!entry) return;

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

    const entryData = {
        clientId: document.getElementById('client').value,
        affaireId: document.getElementById('affaire').value,
        posteId: document.getElementById('poste').value,
        hours: document.getElementById('hours').value
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
    const clientAffaires = affaires.filter(a => a.clientId === clientId);

    affaireSelect.innerHTML = '<option value="">Sélectionner une affaire</option>' +
        clientAffaires.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('');
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
            localStorage.setItem('affaires_clients', JSON.stringify(clients));
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
            localStorage.setItem('affaires_clients', JSON.stringify(clients));
            localStorage.setItem('affaires_affaires', JSON.stringify(affaires));
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
    const name = input.value.trim();

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
            body: JSON.stringify({ name, clientId })
        });

        if (response.ok) {
            const newAffaire = await response.json();
            affaires.push(newAffaire);
            localStorage.setItem('affaires_affaires', JSON.stringify(affaires));
            input.value = '';
            document.getElementById('newAffaireClient').value = '';
            renderAffaires();
            updateSelects();
        }
    } catch (error) {
        console.error('Erreur:', error);
        alert('Erreur lors de l\'ajout de l\'affaire');
    }
}

async function deleteAffaire(id) {
    if (!confirm('Supprimer cette affaire ?')) return;

    try {
        const response = await fetch(`${API_URL}/affaires/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            affaires = affaires.filter(a => a.id !== id);
            localStorage.setItem('affaires_affaires', JSON.stringify(affaires));
            renderAffaires();
            updateSelects();
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

    container.innerHTML = affaires.map(affaire => {
        const client = clients.find(c => c.id === affaire.clientId);
        return `
            <div class="item-tag">
                <span>${escapeHtml(affaire.name)} <small style="color: #888;">(${client ? escapeHtml(client.name) : 'Client inconnu'})</small></span>
                <button class="delete-btn" onclick="deleteAffaire('${affaire.id}')">×</button>
            </div>
        `;
    }).join('');
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
            localStorage.setItem('affaires_postes', JSON.stringify(postes));
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
            localStorage.setItem('affaires_postes', JSON.stringify(postes));
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

// ===== EMAIL =====

function sendEmail() {
    if (entries.length === 0) {
        alert('Aucune entrée à envoyer');
        return;
    }

    let totalHours = 0;
    let body = 'RAPPORT HEURES DE TRAVAIL\n';
    body += '========================\n\n';

    entries.forEach(entry => {
        totalHours += parseFloat(entry.hours) || 0;
        const date = new Date(entry.date).toLocaleDateString('fr-FR');
        const client = clients.find(c => c.id === entry.clientId);
        const affaire = affaires.find(a => a.id === entry.affaireId);
        const poste = postes.find(p => p.id === entry.posteId);

        body += `Client: ${client ? client.name : 'Inconnu'}\n`;
        body += `Affaire: ${affaire ? affaire.name : 'Inconnue'}\n`;
        body += `Poste: ${poste ? poste.name : 'Inconnu'}\n`;
        body += `Heures: ${entry.hours}h\n`;
        body += `Date: ${date}\n`;
        body += '------------------------\n';
    });

    body += `\nTOTAL: ${totalHours} heures\n`;

    const subject = `Rapport Heures Travail - ${new Date().toLocaleDateString('fr-FR')}`;
    const mailtoLink = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    window.location.href = mailtoLink;
}
