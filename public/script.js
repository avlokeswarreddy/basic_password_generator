const state = {
  masterPassword: '',
  entries: [],
  editingId: null,
};

const setupScreen = document.getElementById('setupScreen');
const unlockScreen = document.getElementById('unlockScreen');
const vaultScreen = document.getElementById('vaultScreen');
const setupForm = document.getElementById('setupForm');
const unlockForm = document.getElementById('unlockForm');
const entryForm = document.getElementById('entryForm');
const setupMessage = document.getElementById('setupMessage');
const unlockMessage = document.getElementById('unlockMessage');
const searchInput = document.getElementById('searchInput');
const resultCount = document.getElementById('resultCount');
const passwordList = document.getElementById('passwordList');
const formTitle = document.getElementById('formTitle');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const logoutBtn = document.getElementById('logoutBtn');
const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
const entryModal = document.getElementById('entryModal');
const addPasswordBtn = document.getElementById('addPasswordBtn');
const closeModalBtn = document.getElementById('closeModalBtn');

async function fetchConfig() {
  const response = await fetch('/api/config');
  const data = await response.json();
  return data.hasMasterPassword;
}

function setScreen(screenName) {
  setupScreen.classList.toggle('active', screenName === 'setup');
  setupScreen.classList.toggle('hidden', screenName !== 'setup');

  unlockScreen.classList.toggle('active', screenName === 'unlock');
  unlockScreen.classList.toggle('hidden', screenName !== 'unlock');

  vaultScreen.classList.toggle('active', screenName === 'vault');
  vaultScreen.classList.toggle('hidden', screenName !== 'vault');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function resetForm() {
  entryForm.reset();
  state.editingId = null;
  formTitle.textContent = 'Add Password';
}

function openEntryModal() {
  entryModal.classList.remove('hidden');
  document.getElementById('websiteInput').focus();
}

function closeEntryModal() {
  resetForm();
  entryModal.classList.add('hidden');
}

function populateForm(entry) {
  document.getElementById('websiteInput').value = entry.website;
  document.getElementById('usernameInput').value = entry.username;
  document.getElementById('passwordInput').value = entry.password;
  document.getElementById('noteInput').value = entry.note || '';
  state.editingId = entry.id;
  formTitle.textContent = 'Edit Password';
  cancelEditBtn.classList.remove('hidden');
}

async function loadEntries() {
  const search = searchInput.value.trim();

  const response = await fetch(`/api/entries?search=${encodeURIComponent(search)}`, {
    headers: {
      'X-Master-Password': state.masterPassword,
    },
  });

  if (!response.ok) {
    state.entries = [];
    passwordList.innerHTML = '<div class="empty-state">Unable to load entries.</div>';
    return;
  }

  state.entries = await response.json();
  renderEntries();
}

function renderEntries() {
  const entries = [...state.entries].reverse();
  resultCount.textContent = `${entries.length} item${entries.length === 1 ? '' : 's'}`;

  if (!entries.length) {
    passwordList.innerHTML = '<div class="empty-state">No passwords match your search.</div>';
    return;
  }

  passwordList.innerHTML = entries
    .map(
      (entry) => `
        <article class="password-item">
          <div class="password-header">
            <h4>${escapeHtml(entry.website)}</h4>
            <div class="item-actions">
              <button class="action-btn" type="button" data-action="edit" data-id="${entry.id}">Edit</button>
              <button class="action-btn delete-btn" type="button" data-action="delete" data-id="${entry.id}">Delete</button>
            </div>
          </div>
          <div class="meta-row">
            <div>
              <strong>Username</strong>
              <div>${escapeHtml(entry.username)}</div>
            </div>
            <div>
              <strong>Password</strong>
              <div class="password-value">${escapeHtml(entry.password)}</div>
            </div>
          </div>
          ${entry.note ? `<div class="note-text">${escapeHtml(entry.note)}</div>` : ''}
        </article>
      `,
    )
    .join('');
}

async function handleSetup(event) {
  event.preventDefault();

  const password = document.getElementById('setupPassword').value;
  const confirmPassword = document.getElementById('setupConfirmPassword').value;

  if (password.length < 4) {
    setupMessage.textContent = 'Master password must be at least 4 characters long.';
    return;
  }

  if (password !== confirmPassword) {
    setupMessage.textContent = 'Passwords do not match.';
    return;
  }

  const response = await fetch('/api/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });

  const data = await response.json();
  if (!response.ok) {
    setupMessage.textContent = data.error || 'Unable to create vault.';
    return;
  }

  setupForm.reset();
  setupMessage.textContent = 'Vault created successfully.';
  setScreen('unlock');
}

async function handleUnlock(event) {
  event.preventDefault();
  const password = document.getElementById('unlockPassword').value;

  const response = await fetch('/api/unlock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });

  const data = await response.json();
  if (!response.ok) {
    unlockMessage.textContent = data.error || 'Incorrect master password.';
    return;
  }

  state.masterPassword = password;
  unlockForm.reset();
  unlockMessage.textContent = '';
  setScreen('vault');
  loadEntries();
}

async function handleEntrySubmit(event) {
  event.preventDefault();

  const website = document.getElementById('websiteInput').value.trim();
  const username = document.getElementById('usernameInput').value.trim();
  const password = document.getElementById('passwordInput').value.trim();
  const note = document.getElementById('noteInput').value.trim();

  if (!website || !username || !password) {
    return;
  }

  const payload = {
    website,
    username,
    password,
    note,
    masterPassword: state.masterPassword,
  };

  const method = state.editingId ? 'PUT' : 'POST';
  const url = state.editingId ? `/api/entries/${state.editingId}` : '/api/entries';

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Master-Password': state.masterPassword,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const data = await response.json();
    alert(data.error || 'Unable to save password.');
    return;
  }

  closeEntryModal();
  loadEntries();
}

async function handleListClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const { action, id } = button.dataset;
  const entry = state.entries.find((item) => String(item.id) === String(id));

  if (!entry) return;

  if (action === 'edit') {
    populateForm(entry);
    openEntryModal();
  }

  if (action === 'delete') {
    const confirmed = window.confirm(`Delete ${entry.website} from your vault?`);
    if (!confirmed) return;

    const response = await fetch(`/api/entries/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Password': state.masterPassword,
      },
      body: JSON.stringify({ masterPassword: state.masterPassword }),
    });

    if (!response.ok) {
      const data = await response.json();
      alert(data.error || 'Unable to delete entry.');
      return;
    }

    if (state.editingId === Number(id)) closeEntryModal();
    loadEntries();
  }
}

function handleLogout() {
  state.masterPassword = '';
  closeEntryModal();
  setScreen('unlock');
  document.getElementById('unlockPassword').focus();
}

async function handleForgotPassword() {
  const confirmed = window.confirm('This will clear your saved vault and allow you to create a new master password. Continue?');
  if (!confirmed) return;

  const response = await fetch('/api/reset-vault', { method: 'DELETE' });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    unlockMessage.textContent = data.error || 'Unable to reset the vault.';
    return;
  }

  state.masterPassword = '';
  state.entries = [];
  passwordList.innerHTML = '<div class="empty-state">No passwords match your search.</div>';
  document.getElementById('unlockForm').reset();
  unlockMessage.textContent = 'Vault reset. Please create a new master password.';
  setScreen('setup');
  setupForm.reset();
  setupMessage.textContent = '';
}

setupForm.addEventListener('submit', handleSetup);
unlockForm.addEventListener('submit', handleUnlock);
entryForm.addEventListener('submit', handleEntrySubmit);
searchInput.addEventListener('input', loadEntries);
passwordList.addEventListener('click', handleListClick);
cancelEditBtn.addEventListener('click', closeEntryModal);
logoutBtn.addEventListener('click', handleLogout);
forgotPasswordBtn.addEventListener('click', handleForgotPassword);
addPasswordBtn.addEventListener('click', () => {
  resetForm();
  openEntryModal();
});
closeModalBtn.addEventListener('click', closeEntryModal);
entryModal.addEventListener('click', (event) => {
  if (event.target === entryModal) closeEntryModal();
});

async function initialize() {
  const hasMasterPassword = await fetchConfig();
  setScreen(hasMasterPassword ? 'unlock' : 'setup');
  if (!hasMasterPassword) {
    return;
  }
  document.getElementById('unlockPassword').focus();
}

initialize();
