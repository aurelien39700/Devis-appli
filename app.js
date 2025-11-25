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
let lastSaveTime = 0; // Timestamp de la dernière sauvegarde

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    setupLoginForm();
    updateDateTime();
    setInterval(updateDateTime, 1000); // Mettre à jour l'heure chaque seconde
});

// ===== AFFICHAGE HEURE EN TEMPS RÉEL =====

function updateDateTime() {
    const timeElement = document.querySelector('.time-display');
    const dateElement = document.querySelector('.date-display');
    if (!timeElement || !dateElement) return;

    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();

    // Nom du jour en français
    const jours = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const nomJour = jours[now.getDay()];

    timeElement.textContent = `🕐 ${hours}:${minutes}:${seconds}`;
    dateElement.textContent = `📅 ${nomJour} ${day}/${month}/${year}`;
}

// ===== FONCTION DE NOTIFICATION =====

function showNotification(message, type = 'success') {
    // Créer l'élément de notification
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 25px;
        background: ${type === 'success' ? '#4CAF50' : '#f44336'};
        color: white;
        border-radius: 10px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        font-size: 1rem;
        animation: slideIn 0.3s ease-out;
    `;

    // Ajouter l'animation CSS
    if (!document.getElementById('notification-style')) {
        const style = document.createElement('style');
        style.id = 'notification-style';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(400px); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(400px); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(notification);

    // Retirer automatiquement après 3 secondes
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

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
    // Synchroniser toutes les 30 secondes avec cache-busting
    if (syncInterval) {
        clearInterval(syncInterval);
    }
    syncInterval = setInterval(async () => {
        // Ne pas synchroniser si l'utilisateur est en train de saisir dans le modal
        if (isFormActive) {
            console.log('⏸️ Synchronisation ignorée - formulaire actif');
            return;
        }

        // Ne pas synchroniser si une sauvegarde a eu lieu il y a moins de 5 secondes
        const timeSinceLastSave = Date.now() - lastSaveTime;
        if (timeSinceLastSave < 5000) {
            console.log('⏸️ Synchronisation ignorée - sauvegarde récente (il y a ' + Math.round(timeSinceLastSave / 1000) + 's)');
            return;
        }

        try {
            console.log('🔄 Synchronisation automatique...');

            // Forcer le rechargement depuis le serveur (bypass cache)
            await loadAllData(true);

            // Rafraîchir tous les affichages
            renderEntries();
            renderClients();
            renderAffaires();
            renderPostes();
            updateSelects();

            console.log('✅ Données synchronisées');
        } catch (error) {
            console.error('❌ Erreur de synchronisation:', error);
        }
    }, 30000); // 30 secondes comme demandé
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

    // Fermeture du modal avec le bouton × (ajout d'un écouteur direct)
    const closeButtons = document.querySelectorAll('.modal-close');
    closeButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('🔘 Bouton × cliqué (addEventListener)');
            closeModal();
        });
    });

    // Fermeture du modal avec les boutons Annuler
    const cancelButtons = document.querySelectorAll('.btn-secondary');
    cancelButtons.forEach(btn => {
        if (btn.textContent.includes('Annuler')) {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('🔘 Bouton Annuler cliqué (addEventListener)');
                closeModal();
            });
        }
    });

    // Fermeture du modal en cliquant sur l'overlay
    document.getElementById('modal').addEventListener('click', (e) => {
        if (e.target.id === 'modal') {
            console.log('🔘 Overlay cliqué');
            closeModal();
        }
    });

    // Fermeture du modal avec la touche Échap
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' || e.key === 'Esc') {
            const modal = document.getElementById('modal');
            if (modal && modal.classList.contains('active')) {
                console.log('⌨️ Touche Échap pressée');
                closeModal();
            }
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

async function loadAllData(bypassCache = false) {
    // Ajouter un timestamp pour forcer le bypass du cache
    const cacheBuster = bypassCache ? `?_t=${Date.now()}` : '';

    await Promise.all([
        loadEntries(cacheBuster),
        loadClients(cacheBuster),
        loadAffaires(cacheBuster),
        loadPostes(cacheBuster),
        loadUsers(cacheBuster)
    ]);

    updateSelects();
    renderEntries(); // Re-render après que tout soit chargé
}

async function loadEntries(cacheBuster = '') {
    // Essayer de charger depuis le serveur EN PRIORITÉ
    try {
        const response = await fetch(`${API_URL}/entries${cacheBuster}`, {
            timeout: 3000, // 3 secondes max
            cache: cacheBuster ? 'no-store' : 'default', // Forcer no-cache si cacheBuster
            headers: cacheBuster ? { 'Cache-Control': 'no-cache, no-store, must-revalidate' } : {}
        });
        if (response.ok) {
            const data = await response.json();

            // PRIORITÉ AU SERVEUR : écraser complètement les données locales
            entries = data.entries || [];
            clients = data.clients || [];
            affaires = data.affaires || [];
            postes = data.postes || [];
            users = data.users || [];

            saveToLocalStorage();
            updateSyncStatus('synced', 'Synchronisé ✓');
            return;
        }
    } catch (error) {
        console.warn('⚠️ Serveur inaccessible, utilisation des données locales');
        updateSyncStatus('offline', 'Mode local 💾');
    }

    // FALLBACK : Si le serveur est inaccessible, utiliser localStorage
    const saved = localStorage.getItem('affaires_entries');
    entries = saved ? JSON.parse(saved) : [];
}

async function loadClients(cacheBuster = '') {
    // Priorité au serveur
    try {
        const response = await fetch(`${API_URL}/clients${cacheBuster}`, {
            cache: cacheBuster ? 'no-store' : 'default',
            headers: cacheBuster ? { 'Cache-Control': 'no-cache, no-store, must-revalidate' } : {}
        });
        if (response.ok) {
            const data = await response.json();
            const serverClients = data.clients || [];

            // PRIORITÉ AU SERVEUR : écraser complètement
            clients = serverClients;

            // Sauvegarder seulement les clients, pas tout le localStorage
            localStorage.setItem('affaires_clients', JSON.stringify(clients));
        }
    } catch (error) {
        console.warn('⚠️ Serveur inaccessible pour clients');
        // Fallback: charger depuis localStorage
        const saved = localStorage.getItem('affaires_clients');
        clients = saved ? JSON.parse(saved) : [];
    }
}

async function loadAffaires(cacheBuster = '') {
    // Priorité au serveur
    try {
        const response = await fetch(`${API_URL}/affaires${cacheBuster}`, {
            cache: cacheBuster ? 'no-store' : 'default',
            headers: cacheBuster ? { 'Cache-Control': 'no-cache, no-store, must-revalidate' } : {}
        });
        if (response.ok) {
            const data = await response.json();
            const serverAffaires = data.affaires || [];

            // PRIORITÉ AU SERVEUR : écraser complètement
            affaires = serverAffaires;

            // Sauvegarder seulement les affaires, pas tout le localStorage
            localStorage.setItem('affaires_affaires', JSON.stringify(affaires));
            return;
        }
    } catch (error) {
        console.warn('⚠️ Serveur inaccessible pour affaires');
    }

    // Fallback: charger depuis localStorage
    const saved = localStorage.getItem('affaires_affaires');
    affaires = saved ? JSON.parse(saved) : [];
}

async function loadPostes(cacheBuster = '') {
    // Priorité au serveur
    try {
        const response = await fetch(`${API_URL}/postes${cacheBuster}`, {
            cache: cacheBuster ? 'no-store' : 'default',
            headers: cacheBuster ? { 'Cache-Control': 'no-cache, no-store, must-revalidate' } : {}
        });
        if (response.ok) {
            const data = await response.json();
            const serverPostes = data.postes || [];

            // PRIORITÉ AU SERVEUR : écraser complètement
            postes = serverPostes;

            // Sauvegarder seulement les postes, pas tout le localStorage
            localStorage.setItem('affaires_postes', JSON.stringify(postes));
            return;
        }
    } catch (error) {
        console.warn('⚠️ Serveur inaccessible pour postes');
    }

    // Fallback: charger depuis localStorage
    const saved = localStorage.getItem('affaires_postes');
    postes = saved ? JSON.parse(saved) : [];
}

function updateSyncStatus(status, message) {
    const el = document.getElementById('syncStatus');
    el.textContent = message;
    el.className = `sync-status ${status}`;
}

// ===== GESTION DES ENTRÉES =====

async function saveEntry(entry) {
    // Générer un ID temporaire local
    entry.id = entry.id || Date.now().toString();
    entry.date = entry.date || new Date().toISOString();

    updateSyncStatus('saving', '💾 Sauvegarde en cours...');

    // PRIORITÉ: Essayer de sauvegarder sur le serveur D'ABORD
    try {
        const response = await fetch(`${API_URL}/entries`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entry),
            timeout: 5000 // 5 secondes max
        });

        if (response.ok) {
            const serverEntry = await response.json();
            // Utiliser l'entrée retournée par le serveur (avec l'ID serveur)
            entries.push(serverEntry);
            saveToLocalStorage();
            renderEntries();
            updateSyncStatus('synced', '✓ Synchronisé avec le serveur');
            console.log('✅ Entrée sauvegardée sur le serveur:', serverEntry);

            // Marquer le timestamp de la dernière sauvegarde
            lastSaveTime = Date.now();

            // Recharger toutes les données pour être certain de la cohérence
            setTimeout(() => loadAllData(true), 500);
            return true;
        } else {
            throw new Error('Erreur serveur: ' + response.status);
        }
    } catch (error) {
        console.warn('⚠️ Impossible de sauvegarder sur le serveur:', error);
        // FALLBACK: Sauvegarder localement
        entries.push(entry);
        saveToLocalStorage();
        renderEntries();
        updateSyncStatus('offline', '💾 Sauvegardé localement (serveur inaccessible)');
        lastSaveTime = Date.now();
        return false;
    }
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
        updateSyncStatus('syncing', 'Suppression en cours...');
        const response = await fetch(`${API_URL}/entries/${id}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error('Erreur serveur lors de la suppression');
        }

        // Suppression réussie sur le serveur, mettre à jour localement
        entries = entries.filter(e => e.id !== id);
        saveToLocalStorage();
        updateSyncStatus('synced', '✓ Supprimé et synchronisé');

        // Re-charger depuis le serveur pour être sûr
        setTimeout(() => loadAllData(), 1000);
    } catch (error) {
        console.error('❌ Erreur de suppression:', error);
        alert('Erreur: Impossible de supprimer l\'entrée. Vérifiez votre connexion.');
        updateSyncStatus('error', '✗ Erreur de suppression');
        // Ne PAS supprimer localement si le serveur a échoué !
    }
    renderEntries();
}

function saveToLocalStorage() {
    localStorage.setItem('affaires_entries', JSON.stringify(entries));
    localStorage.setItem('affaires_clients', JSON.stringify(clients));
    localStorage.setItem('affaires_affaires', JSON.stringify(affaires));
    localStorage.setItem('affaires_postes', JSON.stringify(postes));
    localStorage.setItem('affaires_users', JSON.stringify(users));

    // Sauvegarder aussi un timestamp de dernière modification
    localStorage.setItem('affaires_lastUpdate', new Date().toISOString());
}

// Fonction pour exporter toutes les données en JSON téléchargeable
function exportDataToFile() {
    const data = {
        entries: entries,
        clients: clients,
        affaires: affaires,
        postes: postes,
        users: users,
        exportDate: new Date().toISOString()
    };

    const dataStr = JSON.stringify(data, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `suivi-affaires-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    console.log('📥 Export des données créé:', link.download);
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

    // Grouper les entrées par affaire (le client est dérivé de l'affaire)
    const grouped = {};
    let totalHours = 0;

    entries.forEach(entry => {
        totalHours += parseFloat(entry.hours) || 0;
        const key = entry.affaireId;

        if (!grouped[key]) {
            grouped[key] = {
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
        const affaire = affaires.find(a => a.id === group.affaireId);
        // Dériver le client depuis l'affaire (source unique de vérité)
        const client = affaire ? clients.find(c => c.id === affaire.clientId) : null;

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

    // Récupérer TOUTES les affaires en cours, même celles sans heures
    const affairesEnCours = affaires.filter(a => !a.statut || a.statut === 'en_cours');

    if (affairesEnCours.length === 0) {
        card.style.display = 'none';
        return;
    }

    card.style.display = 'block';

    // Créer un tableau combinant les affaires avec heures et celles sans
    const affairesToDisplay = affairesEnCours.map(affaire => {
        const existingGroup = grouped[affaire.id];
        return {
            affaireId: affaire.id,
            totalHours: existingGroup ? existingGroup.totalHours : 0,
            affaire: affaire,
            client: clients.find(c => c.id === affaire.clientId)
        };
    });

    // Trier par nombre d'heures décroissant, puis par nom d'affaire
    affairesToDisplay.sort((a, b) => {
        if (b.totalHours !== a.totalHours) {
            return b.totalHours - a.totalHours;
        }
        return (a.affaire.name || '').localeCompare(b.affaire.name || '');
    });

    container.innerHTML = affairesToDisplay.map(item => {
        const { affaire, client, totalHours } = item;

        return `
            <button
                onclick="quickSelectAffaire('${affaire.clientId}', '${affaire.id}')"
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
                <span>📁 ${escapeHtml(affaire.name)}</span>
                <span style="background: rgba(33, 150, 243, 0.3); padding: 2px 8px; border-radius: 10px; font-size: 0.8rem;">${totalHours.toFixed(1)}h</span>
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
    console.log('🔒 Formulaire ouvert - synchronisation bloquée');
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
    console.log('🔓 closeModal() appelée');
    isFormActive = false; // Réactiver la synchronisation
    console.log('🔓 Formulaire fermé - synchronisation réactivée');

    const modal = document.getElementById('modal');
    if (modal) {
        modal.classList.remove('active');
        console.log('✅ Modal fermé avec succès');
    } else {
        console.error('❌ Modal introuvable !');
    }

    const newAffaireGroup = document.getElementById('newAffaireGroup');
    if (newAffaireGroup) {
        newAffaireGroup.style.display = 'none';
    }

    editingId = null;
}

// Exposer closeModal globalement pour être sûr qu'il est accessible
window.closeModal = closeModal;

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

    // Dériver le clientId depuis l'affaire
    const affaire = affaires.find(a => a.id === entry.affaireId);
    document.getElementById('client').value = affaire ? affaire.clientId : '';
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

        if (!clientId) {
            alert('Veuillez d\'abord sélectionner un client');
            return;
        }

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
                affaireId = newAffaire.id;
                // Recharger toutes les affaires depuis le serveur
                await loadAffaires();
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
                    // Recharger tous les postes depuis le serveur
                    await loadPostes();
                    soudurePoste = postes.find(p => p.name.toLowerCase() === 'soudure');
                }
            } catch (error) {
                console.error('Erreur:', error);
            }
        }

        posteId = soudurePoste.id;
    }

    // Ne pas stocker clientId dans l'entrée - il sera dérivé de l'affaire
    const entryData = {
        affaireId: affaireId,
        posteId: posteId,
        hours: document.getElementById('hours').value,
        enteredBy: currentUser.name
    };

    console.log('📝 Création entrée:', entryData);
    console.log('📁 Affaire sélectionnée:', affaires.find(a => a.id === affaireId));

    if (editingId) {
        await updateEntry(editingId, entryData);
        closeModal();
    } else {
        const success = await saveEntry(entryData);
        if (success) {
            // Attendre un peu que le serveur traite complètement la requête
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        closeModal();

        // Afficher une notification de succès
        showNotification('✅ Entrée ajoutée avec succès', 'success');
    }
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
            input.value = '';
            // Recharger toutes les données depuis le serveur pour garantir la cohérence
            await loadClients();
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
        // Afficher un indicateur de chargement
        const button = event?.target;
        if (button) {
            button.disabled = true;
            button.textContent = '⏳';
        }

        const response = await fetch(`${API_URL}/clients/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            console.log('✅ Client supprimé avec succès');

            // Supprimer immédiatement de l'affichage pour un feedback instantané
            clients = clients.filter(c => c.id !== id);
            renderClients();

            // Recharger toutes les données depuis le serveur pour être sûr
            await Promise.all([loadClients(), loadAffaires(), loadEntries()]);
            renderClients();
            renderAffaires();
            renderEntries();
            updateSelects();

            // Afficher une notification de succès
            showNotification('✅ Client supprimé avec succès');
        } else {
            throw new Error('Échec de la suppression');
        }
    } catch (error) {
        console.error('❌ Erreur:', error);
        alert('Erreur lors de la suppression. Veuillez réessayer.');

        // Recharger pour être sûr d'avoir l'état correct
        await loadClients();
        renderClients();
    }
}

function renderClients() {
    const container = document.getElementById('clientsList');
    if (!clients || clients.length === 0) {
        container.innerHTML = '<p style="color: #666; text-align: center; padding: 40px;">Aucun client créé</p>';
        return;
    }

    const html = clients.map(client => {
        // Compter le nombre d'affaires pour ce client
        const nbAffaires = affaires.filter(a => a.clientId === client.id).length;

        return `
            <div class="admin-card">
                <div class="item-header">
                    <div class="item-title">
                        <span>👥 ${escapeHtml(client.name)}</span>
                    </div>
                </div>
                <div class="item-info">
                    <strong>Affaires:</strong> ${nbAffaires} affaire${nbAffaires > 1 ? 's' : ''}
                </div>
                <div class="item-actions">
                    <button class="btn btn-secondary" onclick="openRenameModal('client', '${client.id}', '${escapeHtml(client.name).replace(/'/g, "\\'")}')">
                        ✏️ Renommer
                    </button>
                    <button class="btn btn-danger" onclick="openDeleteModal('client', '${client.id}', '${escapeHtml(client.name).replace(/'/g, "\\'")}')">
                        🗑️ Supprimer
                    </button>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
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
            input.value = '';
            if (descriptionInput) descriptionInput.value = '';
            document.getElementById('newAffaireClient').value = '';
            // Recharger toutes les données depuis le serveur
            await loadAffaires();
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
            // Recharger toutes les données depuis le serveur
            await loadAffaires();
            renderAffaires();
            updateSelects();
        }
    } catch (error) {
        console.error('Erreur:', error);
        alert('Erreur lors de la mise à jour du statut');
    }
}

async function deleteAffaire(id) {
    if (!confirm('Supprimer définitivement cette affaire et toutes ses entrées ? Cette action est irréversible.')) return;

    try {
        // Afficher un indicateur de chargement
        const button = event?.target;
        if (button) {
            button.disabled = true;
            button.textContent = '⏳';
        }

        // Le serveur supprime automatiquement l'affaire ET toutes ses entrées en cascade
        const response = await fetch(`${API_URL}/affaires/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            console.log('✅ Affaire supprimée avec succès');

            // Supprimer immédiatement de l'affichage
            affaires = affaires.filter(a => a.id !== id);
            entries = entries.filter(e => e.affaireId !== id);
            renderAffaires();
            renderEntries();

            // Recharger toutes les données depuis le serveur (cascade suppression)
            await Promise.all([loadAffaires(), loadEntries()]);

            // Rafraîchir l'affichage
            renderAffaires();
            updateSelects();
            renderEntries();

            showNotification('✅ Affaire supprimée avec succès');
        } else {
            throw new Error('Échec de la suppression');
        }
    } catch (error) {
        console.error('❌ Erreur:', error);
        alert('Erreur lors de la suppression. Veuillez réessayer.');

        // Recharger pour avoir l'état correct
        await Promise.all([loadAffaires(), loadEntries()]);
        renderAffaires();
        renderEntries();
    }
}

let currentAffaireFilter = 'all';
let currentSearchTerm = '';

function renderAffaires() {
    const container = document.getElementById('affairesList');
    if (!affaires || affaires.length === 0) {
        container.innerHTML = '<p style="color: #666; text-align: center; padding: 40px;">Aucune affaire créée</p>';
        return;
    }

    // Filtrer par statut
    let filtered = affaires;
    if (currentAffaireFilter !== 'all') {
        filtered = affaires.filter(a => (a.statut || 'en_cours') === currentAffaireFilter);
    }

    // Filtrer par recherche
    if (currentSearchTerm) {
        filtered = filtered.filter(a => {
            const client = clients.find(c => c.id === a.clientId);
            const clientName = client ? client.name.toLowerCase() : '';
            const affaireName = a.name.toLowerCase();
            const search = currentSearchTerm.toLowerCase();
            return affaireName.includes(search) || clientName.includes(search);
        });
    }

    if (filtered.length === 0) {
        container.innerHTML = '<p style="color: #666; text-align: center; padding: 40px;">Aucune affaire trouvée</p>';
        return;
    }

    const html = filtered.map(affaire => {
        const client = clients.find(c => c.id === affaire.clientId);
        const statut = affaire.statut || 'en_cours';
        const statutLabel = statut === 'en_cours' ? 'En cours' : statut === 'terminee' ? 'Terminée' : 'Archivée';
        const badgeClass = `badge-${statut}`;

        // Compter les heures
        const heuresTotal = entries
            .filter(e => e.affaireId === affaire.id)
            .reduce((sum, e) => sum + parseFloat(e.hours || 0), 0);

        return `
            <div class="admin-card">
                <div class="item-header">
                    <div class="item-title">
                        <span>${escapeHtml(affaire.name)}</span>
                        <span class="item-badge ${badgeClass}">${statutLabel}</span>
                    </div>
                </div>
                <div class="item-info">
                    <strong>Client:</strong> ${client ? escapeHtml(client.name) : 'Non défini'}
                </div>
                ${affaire.description ? `<div class="item-info"><strong>Description:</strong> ${escapeHtml(affaire.description)}</div>` : ''}
                <div class="item-info">
                    <strong>Heures totales:</strong> ${heuresTotal.toFixed(2)}h
                </div>
                <div class="item-actions">
                    <button class="btn btn-secondary" onclick="openRenameModal('affaire', '${affaire.id}', '${escapeHtml(affaire.name).replace(/'/g, "\\'")}')">
                        ✏️ Renommer
                    </button>
                    ${statut === 'en_cours' ? `
                        <button class="btn btn-success" onclick="changeAffaireStatut('${affaire.id}', 'terminee')">
                            ✓ Terminer
                        </button>
                    ` : statut === 'terminee' ? `
                        <button class="btn btn-secondary" onclick="changeAffaireStatut('${affaire.id}', 'en_cours')">
                            ↺ Réactiver
                        </button>
                        <button class="btn" style="background: rgba(255,152,0,0.2); color: #ff9800;" onclick="changeAffaireStatut('${affaire.id}', 'archivee')">
                            📦 Archiver
                        </button>
                    ` : `
                        <button class="btn btn-secondary" onclick="changeAffaireStatut('${affaire.id}', 'en_cours')">
                            ↺ Réactiver
                        </button>
                    `}
                    <button class="btn btn-danger" onclick="openDeleteModal('affaire', '${affaire.id}', '${escapeHtml(affaire.name).replace(/'/g, "\\'")}')">
                        🗑️ Supprimer
                    </button>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

function filterAffaires(filter, event) {
    currentAffaireFilter = filter;

    // Mise à jour des boutons actifs
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    if (event && event.target) {
        event.target.classList.add('active');
    }

    renderAffaires();
}

// Écouter la recherche
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchAffaires');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            currentSearchTerm = e.target.value;
            renderAffaires();
        });
    }
});

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
            input.value = '';
            // Recharger toutes les données depuis le serveur
            await loadPostes();
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
            // Recharger toutes les données depuis le serveur
            await loadPostes();
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
    if (!postes || postes.length === 0) {
        container.innerHTML = '<p style="color: #666; text-align: center; padding: 40px;">Aucun poste créé</p>';
        return;
    }

    const html = postes.map(poste => {
        // Compter le nombre d'entrées pour ce poste
        const nbEntries = entries.filter(e => e.posteId === poste.id).length;
        const totalHeures = entries
            .filter(e => e.posteId === poste.id)
            .reduce((sum, e) => sum + parseFloat(e.hours || 0), 0);

        return `
            <div class="admin-card">
                <div class="item-header">
                    <div class="item-title">
                        <span>🔧 ${escapeHtml(poste.name)}</span>
                    </div>
                </div>
                <div class="item-info">
                    <strong>Entrées:</strong> ${nbEntries} | <strong>Total heures:</strong> ${totalHeures.toFixed(2)}h
                </div>
                <div class="item-actions">
                    <button class="btn btn-secondary" onclick="openRenameModal('poste', '${poste.id}', '${escapeHtml(poste.name).replace(/'/g, "\\'")}')">
                        ✏️ Renommer
                    </button>
                    <button class="btn btn-danger" onclick="openDeleteModal('poste', '${poste.id}', '${escapeHtml(poste.name).replace(/'/g, "\\'")}')">
                        🗑️ Supprimer
                    </button>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

// ===== GESTION DES UTILISATEURS =====

async function loadUsers(cacheBuster = '') {
    try {
        const response = await fetch(`${API_URL}/users${cacheBuster}`, {
            cache: cacheBuster ? 'no-store' : 'default',
            headers: cacheBuster ? { 'Cache-Control': 'no-cache, no-store, must-revalidate' } : {}
        });
        if (response.ok) {
            const data = await response.json();
            users = data.users || [];
            // Sauvegarder seulement les utilisateurs, pas tout le localStorage
            localStorage.setItem('affaires_users', JSON.stringify(users));
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
            nameInput.value = '';
            passwordInput.value = '';
            // Recharger toutes les données depuis le serveur
            await loadUsers();
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
            // Recharger toutes les données depuis le serveur
            await loadUsers();
            renderUsers();
        }
    } catch (error) {
        console.error('Erreur:', error);
        alert('Erreur lors de la suppression');
    }
}

function renderUsers() {
    const container = document.getElementById('usersList');

    // Filtrer pour exclure l'utilisateur Admin (id = "1")
    const regularUsers = users.filter(u => u.id !== "1" && u.name !== "Admin");

    if (regularUsers.length === 0) {
        container.innerHTML = '<p style="color: #666; text-align: center; padding: 40px;">Aucun utilisateur créé</p>';
        return;
    }

    const html = regularUsers.map(user => {
        // Compter le nombre d'entrées créées par cet utilisateur
        const nbEntries = entries.filter(e => e.enteredBy === user.name).length;
        const totalHeures = entries
            .filter(e => e.enteredBy === user.name)
            .reduce((sum, e) => sum + parseFloat(e.hours || 0), 0);

        return `
            <div class="admin-card">
                <div class="item-header">
                    <div class="item-title">
                        <span>👤 ${escapeHtml(user.name)}</span>
                    </div>
                </div>
                <div class="item-info">
                    <strong>Code:</strong> <span style="letter-spacing: 3px;">••••••</span>
                </div>
                <div class="item-info">
                    <strong>Entrées créées:</strong> ${nbEntries} | <strong>Total heures:</strong> ${totalHeures.toFixed(2)}h
                </div>
                <div class="item-actions">
                    <button class="btn btn-secondary" onclick="openRenameModal('user', '${user.id}', '${escapeHtml(user.name).replace(/'/g, "\\'")}')">
                        ✏️ Renommer
                    </button>
                    <button class="btn" style="background: rgba(255,193,7,0.2); color: #ffc107;" onclick="openChangePasswordModal('${user.id}', '${escapeHtml(user.name).replace(/'/g, "\\'")}')">
                        🔑 Changer code
                    </button>
                    <button class="btn btn-danger" onclick="openDeleteModal('user', '${user.id}', '${escapeHtml(user.name).replace(/'/g, "\\'")}')">
                        🗑️ Supprimer
                    </button>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
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

// ===== MODALES PROFESSIONNELLES =====

function openRenameModal(type, id, currentName) {
    const typeLabels = {
        'client': 'Client',
        'affaire': 'Affaire',
        'poste': 'Poste',
        'user': 'Utilisateur'
    };

    const modalHTML = `
        <div class="modal-overlay" onclick="closeConfirmModal(event)">
            <div class="modal-box" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3>✏️ Renommer ${typeLabels[type]}</h3>
                </div>
                <div class="modal-body">
                    <p>Nouveau nom pour <strong>${currentName}</strong> :</p>
                    <input type="text" class="modal-input" id="modalRenameInput" value="${currentName}" autofocus>
                </div>
                <div class="modal-actions">
                    <button class="btn btn-secondary" onclick="closeConfirmModal()">Annuler</button>
                    <button class="btn btn-primary" onclick="confirmRename('${type}', '${id}')">✓ Renommer</button>
                </div>
            </div>
        </div>
    `;

    document.getElementById('modalContainer').innerHTML = modalHTML;
    setTimeout(() => document.getElementById('modalRenameInput').focus(), 100);
}

function openDeleteModal(type, id, name) {
    const typeLabels = {
        'client': 'le client',
        'affaire': "l'affaire",
        'poste': 'le poste',
        'user': "l'utilisateur"
    };

    const modalHTML = `
        <div class="modal-overlay" onclick="closeConfirmModal(event)">
            <div class="modal-box" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3>🗑️ Confirmation de suppression</h3>
                </div>
                <div class="modal-body">
                    <p style="color: #ff6b6b;">⚠️ Êtes-vous sûr de vouloir supprimer ${typeLabels[type]} :</p>
                    <p style="font-size: 1.2rem; font-weight: 600; color: #fff; margin: 15px 0;">${name}</p>
                    <p style="color: #888;">Cette action est irréversible.</p>
                </div>
                <div class="modal-actions">
                    <button class="btn btn-secondary" onclick="closeConfirmModal()">Annuler</button>
                    <button class="btn btn-danger" onclick="confirmDelete('${type}', '${id}')">🗑️ Supprimer</button>
                </div>
            </div>
        </div>
    `;

    document.getElementById('modalContainer').innerHTML = modalHTML;
}

function closeConfirmModal(event) {
    if (!event || event.target.classList.contains('modal-overlay')) {
        document.getElementById('modalContainer').innerHTML = '';
    }
}

async function confirmRename(type, id) {
    const newName = document.getElementById('modalRenameInput').value.trim();
    if (!newName) {
        alert('Le nom ne peut pas être vide');
        return;
    }

    const endpoints = {
        'client': `/clients/${id}`,
        'affaire': `/affaires/${id}`,
        'poste': `/postes/${id}`,
        'user': `/users/${id}`
    };

    try {
        const response = await fetch(`${API_URL}${endpoints[type]}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName })
        });

        if (response.ok) {
            closeConfirmModal();
            showNotification('✓ Renommé avec succès', 'success');

            // Recharger les données
            if (type === 'client') {
                await loadClients();
                renderClients();
            } else if (type === 'affaire') {
                await loadAffaires();
                renderAffaires();
            } else if (type === 'poste') {
                await loadPostes();
                renderPostes();
            } else if (type === 'user') {
                await loadUsers();
                renderUsers();
            }
            updateSelects();
        } else {
            alert('Erreur lors du renommage');
        }
    } catch (error) {
        console.error('Erreur:', error);
        alert('Erreur de connexion');
    }
}

async function confirmDelete(type, id) {
    const endpoints = {
        'client': `/clients/${id}`,
        'affaire': `/affaires/${id}`,
        'poste': `/postes/${id}`,
        'user': `/users/${id}`
    };

    try {
        const response = await fetch(`${API_URL}${endpoints[type]}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            closeConfirmModal();
            showNotification('✓ Supprimé avec succès', 'success');

            // Recharger les données
            if (type === 'client') {
                await loadClients();
                renderClients();
            } else if (type === 'affaire') {
                await loadAffaires();
                renderAffaires();
            } else if (type === 'poste') {
                await loadPostes();
                renderPostes();
            } else if (type === 'user') {
                await loadUsers();
                renderUsers();
            }
            updateSelects();
        } else {
            alert('Erreur lors de la suppression');
        }
    } catch (error) {
        console.error('Erreur:', error);
        alert('Erreur de connexion');
    }
}

// Alias pour compatibilité avec la nouvelle interface
function changeAffaireStatut(id, nouveauStatut) {
    return toggleAffaireStatut(id, nouveauStatut);
}

// ===== MODALE CHANGEMENT MOT DE PASSE =====

function openChangePasswordModal(userId, userName) {
    const modalHTML = `
        <div class="modal-overlay" onclick="closeConfirmModal(event)">
            <div class="modal-box" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3>🔑 Changer le code</h3>
                </div>
                <div class="modal-body">
                    <p>Nouveau code pour <strong>${userName}</strong> :</p>
                    <div style="position: relative;">
                        <input type="password" class="modal-input" id="modalPasswordInput" placeholder="Entrez le nouveau code" autofocus style="padding-right: 50px;">
                        <button onclick="togglePasswordVisibility()" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: rgba(255,255,255,0.1); border: none; padding: 8px 12px; border-radius: 8px; cursor: pointer; color: #2196F3; font-size: 1.2rem;">
                            👁️
                        </button>
                    </div>
                    <p style="color: #888; font-size: 0.9rem; margin-top: 10px;">
                        ℹ️ Cliquez sur l'œil pour afficher/masquer le code
                    </p>
                </div>
                <div class="modal-actions">
                    <button class="btn btn-secondary" onclick="closeConfirmModal()">Annuler</button>
                    <button class="btn btn-primary" onclick="confirmChangePassword('${userId}')">✓ Changer</button>
                </div>
            </div>
        </div>
    `;

    document.getElementById('modalContainer').innerHTML = modalHTML;
    setTimeout(() => document.getElementById('modalPasswordInput').focus(), 100);
}

function togglePasswordVisibility() {
    const input = document.getElementById('modalPasswordInput');
    if (input.type === 'password') {
        input.type = 'text';
    } else {
        input.type = 'password';
    }
}

async function confirmChangePassword(userId) {
    const newPassword = document.getElementById('modalPasswordInput').value.trim();
    if (!newPassword) {
        alert('Le code ne peut pas être vide');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/users/${userId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: newPassword })
        });

        if (response.ok) {
            closeConfirmModal();
            showNotification('✓ Code modifié avec succès', 'success');

            // Recharger les utilisateurs
            await loadUsers();
            renderUsers();
        } else {
            alert('Erreur lors du changement de code');
        }
    } catch (error) {
        console.error('Erreur:', error);
        alert('Erreur de connexion');
    }
}

// ===== EMAIL =====



