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
        document.getElementById('devisAppBtn').style.display = 'block';
    } else {
        userIcon.textContent = '👤';
        userTypeText.textContent = currentUser.name;
        document.getElementById('managementTabBtn').style.display = 'none';
        document.getElementById('devisAppBtn').style.display = 'none';
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

            // Trier les postes par ordre
            postes.sort((a, b) => {
                const orderA = a.order !== undefined ? a.order : 999;
                const orderB = b.order !== undefined ? b.order : 999;
                return orderA - orderB;
            });

            // Sauvegarder seulement les postes, pas tout le localStorage
            localStorage.setItem('affaires_postes', JSON.stringify(postes));

            // Synchroniser vers devis_app
            syncPostesVersDevisApp();
            return;
        }
    } catch (error) {
        console.warn('⚠️ Serveur inaccessible pour postes');
    }

    // Fallback: charger depuis localStorage
    const saved = localStorage.getItem('affaires_postes');
    postes = saved ? JSON.parse(saved) : [];

    // Synchroniser vers devis_app même en fallback
    syncPostesVersDevisApp();
}

// Fonction pour synchroniser les postes vers devis_app
function syncPostesVersDevisApp() {
    try {
        // Charger les données actuelles de devis_app s'il y en a
        const devisData = localStorage.getItem('devis_somepre');
        let devisObj = devisData ? JSON.parse(devisData) : null;

        if (devisObj && devisObj.data) {
            // Créer des maps pour conserver les heures/temps existants
            const travailMap = {};
            const machineMap = {};

            if (devisObj.data.travail) {
                devisObj.data.travail.forEach(p => {
                    travailMap[p.nom] = p;
                });
            }

            if (devisObj.data.machine) {
                devisObj.data.machine.forEach(m => {
                    machineMap[m.nom] = m;
                });
            }

            // Séparer les postes en deux catégories
            const postesTravail = [];
            const postesMachine = [];

            postes.forEach(poste => {
                if (poste.isMachine) {
                    // Poste machine : va dans la catégorie machine
                    const existant = machineMap[poste.name];
                    postesMachine.push({
                        nom: poste.name,
                        // PRIORITÉ: taux personnalisé existant > taux du serveur > défaut
                        taux: existant ? existant.taux : (poste.tauxHoraire || 46),
                        temps: existant ? existant.temps : 0
                    });
                } else {
                    // Poste normal : va dans la catégorie travail
                    const existant = travailMap[poste.name];
                    postesTravail.push({
                        nom: poste.name,
                        // PRIORITÉ: taux personnalisé existant > taux du serveur > défaut
                        taux: existant ? existant.taux : (poste.tauxHoraire || 75),
                        semaines: existant ? existant.semaines : [0, 0, 0, 0, 0, 0, 0, 0]
                    });
                }
            });

            // Mettre à jour les catégories
            devisObj.data.travail = postesTravail;
            devisObj.data.machine = postesMachine;

            // Préserver les fournisseurs existants
            if (!devisObj.fournisseurs || devisObj.fournisseurs.length === 0) {
                devisObj.fournisseurs = [
                    'Fournisseur A',
                    'Fournisseur B',
                    'Fournisseur C',
                    'Sous-traitant X',
                    'Sous-traitant Y'
                ];
            }

            // Sauvegarder les modifications
            localStorage.setItem('devis_somepre', JSON.stringify(devisObj));
            console.log('✅ Postes synchronisés vers devis_app (Travail + Machine)');
        }

        // Aussi sauvegarder une copie des postes pour usage futur
        localStorage.setItem('devis_postes_biblioth que', JSON.stringify(postes));
    } catch (error) {
        console.error('Erreur synchronisation postes vers devis_app:', error);
    }
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
        return;
    }

    // Grouper les entrées par affaire (le client est dérivé de l'affaire)
    const grouped = {};
    let totalHours = 0;

    entries.forEach(entry => {
        const affaire = affaires.find(a => a.id === entry.affaireId);
        const isArchived = affaire && (affaire.statut === 'archivee' || affaire.statut === 'terminee');

        // Ne jamais afficher les affaires archivées/terminées pour personne
        if (isArchived) {
            return;
        }

        // Pour UTILISATEURS : voir uniquement leurs propres entrées
        if (!isAdmin() && entry.enteredBy && entry.enteredBy !== currentUser.name) {
            return;
        }

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
                ${affaire && affaire.description ? `<div class="entry-info" style="color: #888; font-size: 0.8rem; font-style: italic; margin-top: 3px;">💬 ${escapeHtml(affaire.description)}</div>` : ''}
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

    // Grouper par client
    const affairesParClient = {};
    affairesToDisplay.forEach(item => {
        const clientName = item.client ? item.client.name : 'Client inconnu';
        if (!affairesParClient[clientName]) {
            affairesParClient[clientName] = {
                client: item.client,
                affaires: []
            };
        }
        affairesParClient[clientName].affaires.push(item);
    });

    // Trier les clients par ordre alphabétique
    const clientsTriees = Object.keys(affairesParClient).sort((a, b) => a.localeCompare(b));

    // Générer le HTML groupé par client
    container.innerHTML = clientsTriees.map(clientName => {
        const groupe = affairesParClient[clientName];

        // Trier les affaires du client par nom
        groupe.affaires.sort((a, b) =>
            (a.affaire.name || '').localeCompare(b.affaire.name || '')
        );

        // Calculer le total d'heures pour ce client
        const totalHeuresClient = groupe.affaires.reduce((sum, item) => sum + item.totalHours, 0);

        return `
            <div style="margin-bottom: 16px; border-left: 4px solid #1e88e5; padding-left: 12px;">
                <div style="font-weight: 800; margin-bottom: 8px; font-size: 1rem; display: flex; align-items: center; gap: 10px;">
                    <span style="background: linear-gradient(135deg, #2196F3 0%, #1565c0 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; font-size: 1.05rem;">👥 ${escapeHtml(clientName)}</span>
                    <span style="background: linear-gradient(135deg, #2196F3 0%, #1565c0 100%); padding: 3px 12px; border-radius: 14px; font-size: 0.75rem; font-weight: 700; color: white; box-shadow: 0 2px 4px rgba(33, 150, 243, 0.3);">${totalHeuresClient.toFixed(1)}h</span>
                </div>
                <div style="display: flex; flex-direction: column; gap: 6px; margin-left: 8px;">
                    ${groupe.affaires.map(item => {
                        const { affaire, totalHours } = item;
                        const description = affaire.description ? affaire.description : 'Pas de description';
                        const tooltipText = `${affaire.name}\n${description}\n${totalHours.toFixed(1)}h enregistrées`;

                        return `
                            <button
                                onclick="quickSelectAffaire('${affaire.clientId}', '${affaire.id}')"
                                title="${tooltipText.replace(/"/g, '&quot;')}"
                                style="
                                    padding: 8px 12px;
                                    border: 1px solid rgba(33, 150, 243, 0.3);
                                    border-radius: 12px;
                                    background: linear-gradient(135deg, rgba(33, 150, 243, 0.08) 0%, rgba(21, 101, 192, 0.08) 100%);
                                    cursor: pointer;
                                    transition: all 0.2s ease;
                                    font-size: 0.85rem;
                                    font-weight: 600;
                                    display: flex;
                                    flex-direction: column;
                                    align-items: flex-start;
                                    gap: 3px;
                                    text-align: left;
                                    box-shadow: 0 1px 3px rgba(33, 150, 243, 0.1);
                                "
                                onmouseover="this.style.background='linear-gradient(135deg, rgba(33, 150, 243, 0.18) 0%, rgba(21, 101, 192, 0.18) 100%)'; this.style.borderColor='#2196F3'; this.style.boxShadow='0 2px 6px rgba(33, 150, 243, 0.2)';"
                                onmouseout="this.style.background='linear-gradient(135deg, rgba(33, 150, 243, 0.08) 0%, rgba(21, 101, 192, 0.08) 100%)'; this.style.borderColor='rgba(33, 150, 243, 0.3)'; this.style.boxShadow='0 1px 3px rgba(33, 150, 243, 0.1)';"
                            >
                                <div style="display: flex; align-items: center; gap: 6px; width: 100%;">
                                    <span style="color: #1565c0;">📁 ${escapeHtml(affaire.name)}</span>
                                    <span style="background: linear-gradient(135deg, #2196F3 0%, #1565c0 100%); padding: 3px 8px; border-radius: 10px; font-size: 0.75rem; font-weight: 600; color: white; margin-left: auto; box-shadow: 0 1px 3px rgba(33, 150, 243, 0.3);">${totalHours.toFixed(1)}h</span>
                                </div>
                                ${affaire.description ? `<div style="font-size: 0.7rem; color: white; font-style: italic; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; background: rgba(21, 101, 192, 0.7); padding: 2px 6px; border-radius: 6px; margin-top: 2px;">💬 ${escapeHtml(affaire.description)}</div>` : ''}
                            </button>
                        `;
                    }).join('')}
                </div>
            </div>
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

    isFormActive = true; // Bloquer la synchronisation
    console.log('🔒 Formulaire d\'édition ouvert - synchronisation bloquée');

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

    // Désactiver le bouton de soumission et afficher un indicateur de chargement
    const submitBtn = document.querySelector('#entryForm button[type="submit"]');
    const submitBtnText = document.getElementById('submitBtnText');
    const originalText = submitBtnText.textContent;

    submitBtn.disabled = true;
    submitBtnText.innerHTML = '⏳ Enregistrement...';

    try {
        // Vérifier que l'utilisateur peut modifier cette entrée
        if (editingId) {
            const entry = entries.find(e => e.id === editingId);
            if (entry && !isAdmin() && entry.enteredBy !== currentUser.name) {
                alert('Vous ne pouvez modifier que vos propres saisies');
                return;
            }
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
    } catch (error) {
        console.error('❌ Erreur lors de la soumission:', error);
        alert('Une erreur est survenue. Veuillez réessayer.');
    } finally {
        // Réactiver le bouton et restaurer le texte
        submitBtn.disabled = false;
        submitBtnText.textContent = originalText;
    }
}

function updateSelects() {
    const clientSelect = document.getElementById('client');
    const posteSelect = document.getElementById('poste');
    const newAffaireClientSelect = document.getElementById('newAffaireClient');

    // Sauvegarder les valeurs actuellement sélectionnées
    const savedClientValue = clientSelect ? clientSelect.value : '';
    const savedPosteValue = posteSelect ? posteSelect.value : '';
    const savedNewAffaireClientValue = newAffaireClientSelect ? newAffaireClientSelect.value : '';

    if (clientSelect) {
        clientSelect.innerHTML = '<option value="">Sélectionner un client</option>' +
            clients.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
        // Restaurer la valeur sélectionnée si elle existe toujours
        if (savedClientValue && clients.some(c => c.id === savedClientValue)) {
            clientSelect.value = savedClientValue;
        }
    }

    if (posteSelect) {
        posteSelect.innerHTML = '<option value="">Sélectionner un poste</option>' +
            postes.map(p => {
                const machineLabel = p.isMachine ? ' ⚙️ Machine' : '';
                return `<option value="${p.id}">${escapeHtml(p.name)}${machineLabel}</option>`;
            }).join('');
        // Restaurer la valeur sélectionnée si elle existe toujours
        if (savedPosteValue && postes.some(p => p.id === savedPosteValue)) {
            posteSelect.value = savedPosteValue;
        }
    }

    if (newAffaireClientSelect) {
        newAffaireClientSelect.innerHTML = '<option value="">Sélectionner un client</option>' +
            clients.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
        // Restaurer la valeur sélectionnée si elle existe toujours
        if (savedNewAffaireClientValue && clients.some(c => c.id === savedNewAffaireClientValue)) {
            newAffaireClientSelect.value = savedNewAffaireClientValue;
        }
    }

    updateAffairesSelect();
}

function updateAffairesSelect() {
    const clientSelect = document.getElementById('client');
    const affaireSelect = document.getElementById('affaire');

    if (!clientSelect || !affaireSelect) return;

    // Sauvegarder la valeur actuellement sélectionnée
    const savedAffaireValue = affaireSelect.value;

    const clientId = clientSelect.value;

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

    // Restaurer la valeur sélectionnée si elle existe toujours pour ce client
    if (savedAffaireValue && (savedAffaireValue === '__new__' || clientAffaires.some(a => a.id === savedAffaireValue))) {
        affaireSelect.value = savedAffaireValue;
    }
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

    // Mettre à jour les selects de clients dans la modal
    updateAffaireModalClients();
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

// Fonction pour préparer et transférer les données vers devis_app
function preparerDevisApp(affaireId) {
    const affaire = affaires.find(a => a.id === affaireId);
    if (!affaire) return;

    const client = clients.find(c => c.id === affaire.clientId);

    // Récupérer toutes les entrées de cette affaire
    const affaireEntries = entries.filter(e => e.affaireId === affaireId);

    // Grouper les heures par poste (travail)
    const heuresParPoste = {};
    affaireEntries.forEach(entry => {
        const poste = postes.find(p => p.id === entry.posteId);
        if (poste && !poste.isMachine) {
            const posteName = poste.name;
            if (!heuresParPoste[posteName]) {
                heuresParPoste[posteName] = {
                    nom: posteName,
                    taux: poste.tauxHoraire || 75,
                    totalHeures: 0
                };
            }
            heuresParPoste[posteName].totalHeures += parseFloat(entry.hours) || 0;
        }
    });

    // Grouper les heures par machine
    const heuresParMachine = {};
    affaireEntries.forEach(entry => {
        const poste = postes.find(p => p.id === entry.posteId);
        if (poste && poste.isMachine) {
            const machineName = poste.name;
            if (!heuresParMachine[machineName]) {
                heuresParMachine[machineName] = 0;
            }
            heuresParMachine[machineName] += parseFloat(entry.hours) || 0;
        }
    });

    // Récupérer les machines depuis les postes avec isMachine: true et leurs heures réelles
    const machines = postes
        .filter(p => p.isMachine)
        .sort((a, b) => (a.order || 999) - (b.order || 999))
        .map(machine => ({
            nom: machine.name,
            taux: machine.tauxHoraire || 46,
            temps: heuresParMachine[machine.name] || 0
        }));

    // Préparer les données pour devis_app avec la structure exacte attendue
    const devisData = {
        client: client ? client.name : '',
        numCommande: '',
        affaire: affaire.name,
        date: new Date().toISOString().split('T')[0],
        coeffMarge: 1.20,
        data: {
            travail: postes
                .filter(p => !p.isMachine)
                .sort((a, b) => (a.order || 999) - (b.order || 999))
                .map(poste => {
                    const heures = heuresParPoste[poste.name];
                    return {
                        nom: poste.name,
                        taux: poste.tauxHoraire || 75,
                        semaines: heures ? [heures.totalHeures, 0, 0, 0, 0, 0, 0, 0] : [0, 0, 0, 0, 0, 0, 0, 0]
                    };
                }),
            machine: machines,
            achats: [
                { nom: 'Carcasse', fournisseur: '', quantite: 1, prixUnit: 0 },
                { nom: 'Éléments carcasse', fournisseur: '', quantite: 1, prixUnit: 0 },
                { nom: 'Matière première', fournisseur: '', quantite: 1, prixUnit: 0 },
                { nom: 'Traitement thermique', fournisseur: '', quantite: 1, prixUnit: 0 },
                { nom: 'Bloc chaud', fournisseur: '', quantite: 1, prixUnit: 0 },
                { nom: 'Sous-traitance', fournisseur: '', quantite: 1, prixUnit: 0 },
                { nom: 'Transport', fournisseur: '', quantite: 1, prixUnit: 0 }
            ]
        },
        fournisseurs: [
            'Fournisseur A',
            'Fournisseur B',
            'Fournisseur C',
            'Sous-traitant X',
            'Sous-traitant Y'
        ]
    };

    // Sauvegarder dans localStorage pour devis_app
    localStorage.setItem('devis_somepre', JSON.stringify(devisData));

    // Construire l'URL complète pour devis_app
    const baseUrl = window.location.origin + window.location.pathname.replace('index.html', '');
    const devisUrl = baseUrl + 'devis_app.html';

    // Ouvrir devis_app dans un nouvel onglet
    const newWindow = window.open(devisUrl, '_blank');

    if (!newWindow) {
        alert('⚠️ Le popup a été bloqué par votre navigateur.\n\nVeuillez autoriser les popups pour ce site, puis réessayez.\n\nVous pouvez aussi ouvrir manuellement devis_app.html - les données ont été sauvegardées.');
    }
}

// Fonction pour ouvrir devis_app depuis le bouton admin
function ouvrirDevisApp() {
    // Construire l'URL complète pour devis_app
    const baseUrl = window.location.origin + window.location.pathname.replace('index.html', '');
    const devisUrl = baseUrl + 'devis_app.html';

    // Ouvrir devis_app dans un nouvel onglet
    const newWindow = window.open(devisUrl, '_blank');

    if (!newWindow) {
        alert('⚠️ Le popup a été bloqué par votre navigateur.\n\nVeuillez autoriser les popups pour ce site, puis réessayez.');
    }
}

async function toggleAffaireStatut(id, nouveauStatut) {
    const affaire = affaires.find(a => a.id === id);

    // Si on termine l'affaire, générer le PDF d'abord
    if (nouveauStatut === 'terminee' && affaire) {
        if (!confirm(`Terminer l'affaire "${affaire.name}" ?\n\nUn PDF récapitulatif sera automatiquement généré et les données seront transférées vers le devis.`)) {
            return;
        }

        // Générer le PDF
        generateAffairePDF(id);

        // Préparer et ouvrir devis_app avec les données
        preparerDevisApp(id);
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
    // Rendre les statistiques
    renderAffairesStats();

    const container = document.getElementById('affairesList');
    if (!affaires || affaires.length === 0) {
        container.innerHTML = '<p style="color: #666; text-align: center; padding: 40px;">Aucune affaire créée</p>';
        return;
    }

    // Filtrer par statut
    const filterValue = document.getElementById('filterStatut')?.value || 'en_cours';
    let filtered = affaires;
    if (filterValue !== 'all') {
        filtered = affaires.filter(a => (a.statut || 'en_cours') === filterValue);
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

    // Tri
    const sortValue = document.getElementById('sortAffaires')?.value || 'recent';
    if (sortValue === 'name') {
        filtered.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortValue === 'hours') {
        filtered.sort((a, b) => {
            const hoursA = entries.filter(e => e.affaireId === a.id).reduce((sum, e) => sum + parseFloat(e.hours || 0), 0);
            const hoursB = entries.filter(e => e.affaireId === b.id).reduce((sum, e) => sum + parseFloat(e.hours || 0), 0);
            return hoursB - hoursA;
        });
    }

    // Grouper par client
    const groupedByClient = {};
    filtered.forEach(affaire => {
        const clientId = affaire.clientId || 'no-client';
        if (!groupedByClient[clientId]) {
            groupedByClient[clientId] = [];
        }
        groupedByClient[clientId].push(affaire);
    });

    // Générer le HTML
    let html = '';
    Object.keys(groupedByClient).forEach(clientId => {
        const client = clients.find(c => c.id === clientId);
        const clientName = client ? client.name : 'Sans client';
        const clientAffaires = groupedByClient[clientId];

        html += `
            <div class="client-group">
                <div class="client-group-header">
                    <div class="client-group-title">
                        🏢 ${escapeHtml(clientName)}
                        <span class="client-group-count">${clientAffaires.length}</span>
                    </div>
                </div>
                <div class="affaires-grid">
                    ${clientAffaires.map(affaire => renderAffaireCard(affaire)).join('')}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function renderAffaireCard(affaire) {
    const statut = affaire.statut || 'en_cours';
    const statutLabel = statut === 'en_cours' ? '✅ En cours' : statut === 'terminee' ? '✓ Terminée' : '📦 Archivée';

    // Compter les heures
    const heuresTotal = entries
        .filter(e => e.affaireId === affaire.id)
        .reduce((sum, e) => sum + parseFloat(e.hours || 0), 0);

    return `
        <div class="affaire-card" id="affaire-${affaire.id}">
            <div class="affaire-card-header">
                <div style="flex: 1;">
                    <div class="affaire-card-title">${escapeHtml(affaire.name)}</div>
                    <span class="affaire-card-badge ${statut}">${statutLabel}</span>
                </div>
            </div>
            ${affaire.description ? `
                <div class="affaire-card-description">${escapeHtml(affaire.description)}</div>
            ` : ''}
            <div class="affaire-card-hours">
                ⏱️ ${heuresTotal.toFixed(2)}h
            </div>
            <div class="affaire-card-actions">
                <button class="affaire-card-btn affaire-card-btn-primary" onclick="preparerDevisApp('${affaire.id}')">
                    📄 Devis
                </button>
                <button class="affaire-card-btn affaire-card-btn-menu" onclick="toggleAffaireMenu(event, '${affaire.id}')">
                    ⋮
                </button>
            </div>
            ${renderAffaireMenu(affaire)}
        </div>
    `;
}

function renderAffaireMenu(affaire) {
    const statut = affaire.statut || 'en_cours';
    return `
        <div class="affaire-menu" id="menu-${affaire.id}">
            <div class="affaire-menu-item" onclick="openEditAffaireModal('${affaire.id}')">
                ✏️ Modifier
            </div>
            ${statut === 'en_cours' ? `
                <div class="affaire-menu-item" onclick="changeAffaireStatut('${affaire.id}', 'terminee')">
                    ✓ Terminer
                </div>
            ` : statut === 'terminee' ? `
                <div class="affaire-menu-item" onclick="changeAffaireStatut('${affaire.id}', 'en_cours')">
                    ↺ Réactiver
                </div>
                <div class="affaire-menu-item" onclick="changeAffaireStatut('${affaire.id}', 'archivee')">
                    📦 Archiver
                </div>
            ` : `
                <div class="affaire-menu-item" onclick="changeAffaireStatut('${affaire.id}', 'en_cours')">
                    ↺ Réactiver
                </div>
            `}
            <div class="affaire-menu-item danger" onclick="confirmDeleteAffaire('${affaire.id}')">
                🗑️ Supprimer
            </div>
        </div>
    `;
}

function renderAffairesStats() {
    const statsContainer = document.getElementById('affairesStats');
    if (!statsContainer) return;

    // Calculer les statistiques
    const enCours = affaires.filter(a => (a.statut || 'en_cours') === 'en_cours').length;
    const terminees = affaires.filter(a => a.statut === 'terminee').length;
    const archivees = affaires.filter(a => a.statut === 'archivee').length;
    const totalHeures = entries.reduce((sum, e) => sum + parseFloat(e.hours || 0), 0);

    statsContainer.innerHTML = `
        <div class="stat-card">
            <span class="stat-value">${enCours}</span>
            <span class="stat-label">✅ En cours</span>
        </div>
        <div class="stat-card">
            <span class="stat-value">${terminees}</span>
            <span class="stat-label">✓ Terminées</span>
        </div>
        <div class="stat-card">
            <span class="stat-value">${archivees}</span>
            <span class="stat-label">📦 Archivées</span>
        </div>
        <div class="stat-card">
            <span class="stat-value">${totalHeures.toFixed(0)}h</span>
            <span class="stat-label">⏱️ Total</span>
        </div>
    `;
}

function filterAffaires(filter) {
    // La fonction est maintenant appelée par le select, pas besoin de gérer les boutons
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

    // Populer le select client dans la modal
    updateAffaireModalClients();
});

// ===== FONCTIONS MODAL AFFAIRE =====

function openAffaireModal() {
    isFormActive = true; // Bloquer la synchronisation pendant la saisie
    console.log('🔒 Formulaire affaire ouvert - synchronisation bloquée');

    const modal = document.getElementById('affaireModal');
    const title = document.getElementById('affaireModalTitle');
    const submitText = document.getElementById('affaireModalSubmitText');

    // Réinitialiser le formulaire
    document.getElementById('affaireModalId').value = '';
    document.getElementById('affaireModalName').value = '';
    document.getElementById('affaireModalClient').value = '';
    document.getElementById('affaireModalDescription').value = '';

    // Mettre à jour les textes
    title.textContent = '➕ Nouvelle affaire';
    submitText.textContent = 'Créer';

    // Afficher la modal
    modal.classList.add('active');
}

function openEditAffaireModal(affaireId) {
    const affaire = affaires.find(a => a.id === affaireId);
    if (!affaire) return;

    isFormActive = true; // Bloquer la synchronisation pendant la saisie
    console.log('🔒 Formulaire affaire ouvert - synchronisation bloquée');

    const modal = document.getElementById('affaireModal');
    const title = document.getElementById('affaireModalTitle');
    const submitText = document.getElementById('affaireModalSubmitText');

    // Remplir le formulaire
    document.getElementById('affaireModalId').value = affaire.id;
    document.getElementById('affaireModalName').value = affaire.name;
    document.getElementById('affaireModalClient').value = affaire.clientId || '';
    document.getElementById('affaireModalDescription').value = affaire.description || '';

    // Mettre à jour les textes
    title.textContent = '✏️ Modifier l\'affaire';
    submitText.textContent = 'Modifier';

    // Fermer le menu
    closeAllMenus();

    // Afficher la modal
    modal.classList.add('active');
}

function closeAffaireModal() {
    isFormActive = false; // Réactiver la synchronisation
    console.log('🔓 Formulaire affaire fermé - synchronisation réactivée');

    const modal = document.getElementById('affaireModal');
    modal.classList.remove('active');
}

function updateAffaireModalClients() {
    const select = document.getElementById('affaireModalClient');
    if (!select) return;

    // Sauvegarder la valeur actuellement sélectionnée (la synchro auto reconstruit
    // cette liste toutes les 30s : sans ça, le client saisi est perdu)
    const savedValue = select.value;

    select.innerHTML = '<option value="">Sélectionner un client</option>';
    clients.forEach(client => {
        const option = document.createElement('option');
        option.value = client.id;
        option.textContent = client.name;
        select.appendChild(option);
    });

    // Restaurer la valeur sélectionnée si elle existe toujours
    if (savedValue && clients.some(c => c.id === savedValue)) {
        select.value = savedValue;
    }

    // Aussi mettre à jour l'ancien select si il existe
    const oldSelect = document.getElementById('newAffaireClient');
    if (oldSelect) {
        const savedOldValue = oldSelect.value;

        oldSelect.innerHTML = '<option value="">Sélectionner un client</option>';
        clients.forEach(client => {
            const option = document.createElement('option');
            option.value = client.id;
            option.textContent = client.name;
            oldSelect.appendChild(option);
        });

        if (savedOldValue && clients.some(c => c.id === savedOldValue)) {
            oldSelect.value = savedOldValue;
        }
    }
}

async function saveAffaire(event) {
    event.preventDefault();

    const id = document.getElementById('affaireModalId').value;
    const name = document.getElementById('affaireModalName').value.trim();
    const clientId = document.getElementById('affaireModalClient').value;
    const description = document.getElementById('affaireModalDescription').value.trim();

    if (!clientId) {
        alert('Veuillez sélectionner un client');
        return;
    }

    if (!name) {
        alert('Veuillez saisir un nom d\'affaire');
        return;
    }

    try {
        let response;

        if (id) {
            // Modification
            response = await fetch(`${API_URL}/affaires/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, clientId, description })
            });
        } else {
            // Création (l'id est généré par le serveur)
            response = await fetch(`${API_URL}/affaires`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, clientId, description, statut: 'en_cours' })
            });
        }

        // Vérifier que le serveur a bien accepté : sans ça l'échec est silencieux
        if (!response.ok) {
            throw new Error(`Erreur serveur ${response.status}`);
        }

        // Recharger et rafraîchir
        await loadAffaires();
        renderAffaires();
        updateSelects();
        closeAffaireModal();
        showNotification(id ? '✅ Affaire modifiée' : '✅ Affaire créée', 'success');
    } catch (error) {
        console.error('Erreur lors de la sauvegarde:', error);
        alert('Erreur lors de la sauvegarde de l\'affaire');
    }
}

// ===== FONCTIONS MENU CONTEXTUEL =====

function toggleAffaireMenu(event, affaireId) {
    event.stopPropagation();

    // Fermer tous les autres menus
    document.querySelectorAll('.affaire-menu').forEach(menu => {
        if (menu.id !== `menu-${affaireId}`) {
            menu.classList.remove('active');
        }
    });

    // Toggle le menu actuel
    const menu = document.getElementById(`menu-${affaireId}`);
    if (menu) {
        menu.classList.toggle('active');
    }
}

function closeAllMenus() {
    document.querySelectorAll('.affaire-menu').forEach(menu => {
        menu.classList.remove('active');
    });
}

function confirmDeleteAffaire(affaireId) {
    closeAllMenus();
    deleteAffaire(affaireId);
}

// Fermer les menus quand on clique ailleurs
document.addEventListener('click', (event) => {
    if (!event.target.closest('.affaire-card-btn-menu')) {
        closeAllMenus();
    }
});

// Fermer la modal en cliquant à l'extérieur
document.addEventListener('click', (event) => {
    const modal = document.getElementById('affaireModal');
    if (event.target === modal) {
        closeAffaireModal();
    }
});

async function addPoste() {
    const input = document.getElementById('newPoste');
    const checkboxMachine = document.getElementById('newPosteMachine');
    const name = input.value.trim();
    const isMachine = checkboxMachine.checked;

    if (!name) {
        alert('Veuillez entrer un nom de poste');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/postes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, isMachine })
        });

        if (response.ok) {
            input.value = '';
            checkboxMachine.checked = false;
            // Recharger toutes les données depuis le serveur
            await loadPostes();
            renderPostes();
            updateSelects();
            // Synchroniser vers devis_app
            syncPostesVersDevisApp();
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

// Déplacer un poste dans l'ordre
async function movePoste(posteId, direction) {
    const index = postes.findIndex(p => p.id === posteId);
    if (index === -1) return;

    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= postes.length) return;

    // Échanger les éléments
    [postes[index], postes[newIndex]] = [postes[newIndex], postes[index]];

    // Mettre à jour les champs 'order' de tous les postes
    for (let i = 0; i < postes.length; i++) {
        postes[i].order = i;
    }

    // Mettre à jour l'affichage immédiatement pour la réactivité
    renderPostes();
    localStorage.setItem('affaires_postes', JSON.stringify(postes));
    syncPostesVersDevisApp();

    // Sauvegarder TOUS les ordres en une seule requête atomique pour éviter la corruption
    try {
        const postesOrder = postes.map(p => ({ id: p.id, order: p.order }));
        const response = await fetch(`${API_URL}/postes/reorder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ postesOrder })
        });

        if (!response.ok) {
            throw new Error(`Erreur HTTP ${response.status}`);
        }

        console.log('✅ Ordre des postes sauvegardé sur le serveur');
    } catch (error) {
        console.error('❌ Erreur sauvegarde ordre postes:', error);
    }
}

function renderPostes() {
    const container = document.getElementById('postesList');
    if (!postes || postes.length === 0) {
        container.innerHTML = '<p style="color: #666; text-align: center; padding: 40px;">Aucun poste créé</p>';
        return;
    }

    const html = postes.map((poste, index) => {
        // Compter le nombre d'entrées pour ce poste
        const nbEntries = entries.filter(e => e.posteId === poste.id).length;
        const totalHeures = entries
            .filter(e => e.posteId === poste.id)
            .reduce((sum, e) => sum + parseFloat(e.hours || 0), 0);

        const machineBadge = poste.isMachine
            ? '<span style="background: linear-gradient(135deg, #FF9800 0%, #F57C00 100%); color: white; padding: 3px 10px; border-radius: 12px; font-size: 0.75rem; font-weight: 600; margin-left: 8px;">⚙️ Machine</span>'
            : '';

        // Boutons de déplacement discrets
        const isFirst = index === 0;
        const isLast = index === postes.length - 1;
        const moveButtons = `
            <button class="btn btn-secondary" onclick="movePoste('${poste.id}', -1)" ${isFirst ? 'disabled' : ''}
                style="padding: 4px 8px; font-size: 0.85rem; min-width: 32px; ${isFirst ? 'opacity: 0.5; cursor: not-allowed;' : ''}" title="Monter">
                ⬆️
            </button>
            <button class="btn btn-secondary" onclick="movePoste('${poste.id}', 1)" ${isLast ? 'disabled' : ''}
                style="padding: 4px 8px; font-size: 0.85rem; min-width: 32px; ${isLast ? 'opacity: 0.5; cursor: not-allowed;' : ''}" title="Descendre">
                ⬇️
            </button>
        `;

        return `
            <div class="admin-card">
                <div class="item-header">
                    <div class="item-title">
                        <span>🔧 ${escapeHtml(poste.name)}</span>
                        ${machineBadge}
                    </div>
                </div>
                <div class="item-info">
                    <strong>Entrées:</strong> ${nbEntries} | <strong>Total heures:</strong> ${totalHeures.toFixed(2)}h
                </div>
                <div class="item-actions">
                    ${moveButtons}
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

    // Pour les postes, récupérer l'information isMachine
    let machineCheckbox = '';
    if (type === 'poste') {
        const poste = postes.find(p => p.id === id);
        const isChecked = poste && poste.isMachine ? 'checked' : '';
        machineCheckbox = `
            <label style="display: flex; align-items: center; gap: 8px; margin-top: 15px; font-size: 0.9rem; color: #bbb;">
                <input type="checkbox" id="modalMachineCheckbox" ${isChecked} style="width: 18px; height: 18px; cursor: pointer;">
                <span>⚙️ Temps machine</span>
            </label>
        `;
    }

    const modalHTML = `
        <div class="modal-overlay" onclick="closeConfirmModal(event)">
            <div class="modal-box" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3>✏️ Renommer ${typeLabels[type]}</h3>
                </div>
                <div class="modal-body">
                    <p>Nouveau nom pour <strong>${currentName}</strong> :</p>
                    <input type="text" class="modal-input" id="modalRenameInput" value="${currentName}" autofocus>
                    ${machineCheckbox}
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
        console.log(`Renommage ${type} ${id} vers "${newName}"`);
        const url = `${API_URL}${endpoints[type]}`;
        console.log('URL:', url);

        // Préparer le body avec le nom et isMachine si c'est un poste
        let bodyData = { name: newName };
        if (type === 'poste') {
            const machineCheckbox = document.getElementById('modalMachineCheckbox');
            if (machineCheckbox) {
                bodyData.isMachine = machineCheckbox.checked;
            }
        }

        const response = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyData)
        });

        console.log('Response status:', response.status);

        if (response.ok) {
            closeConfirmModal();
            showNotification('✓ Renommé avec succès', 'success');

            // Recharger les données avec cache buster
            const cacheBuster = `?t=${Date.now()}`;
            if (type === 'client') {
                await loadClients(cacheBuster);
                renderClients();
            } else if (type === 'affaire') {
                await loadAffaires(cacheBuster);
                renderAffaires();
            } else if (type === 'poste') {
                await loadPostes(cacheBuster);
                renderPostes();
                // Synchroniser vers devis_app
                syncPostesVersDevisApp();
            } else if (type === 'user') {
                await loadUsers(cacheBuster);
                renderUsers();
            }
            updateSelects();
        } else {
            const errorText = await response.text();
            console.error('Erreur serveur:', errorText);
            alert('Erreur lors du renommage: ' + (errorText || response.status));
        }
    } catch (error) {
        console.error('Erreur:', error);
        alert('Erreur de connexion: ' + error.message);
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
                // Synchroniser vers devis_app
                syncPostesVersDevisApp();
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



