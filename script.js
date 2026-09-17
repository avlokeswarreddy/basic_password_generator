const STORAGE_KEY = 'passwordManagerVault';
const MASTER_PASSWORD_KEY = 'passwordManagerMasterPassword';

const state = {
  masterPassword: localStorage.getItem(MASTER_PASSWORD_KEY) || '',
  entries: JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'),
  isUnlocked: false,
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

function saveEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries));
}

function setScreen(screenName) {
  setupScreen.classList.toggle('active', screenName === 'setup');
  setupScreen.classList.toggle('hidden', screenName !== 'setup');

  unlockScreen.classList.toggle('active', screenName === 'unlock');
  unlockScreen.classList.toggle('hidden', screenName !== 'unlock');

  vaultScreen.classList.toggle('active', screenName === 'vault');
  vaultScreen.classList.toggle('hidden', screenName !== 'vault');
}

function initScreens() {
  if (!state.masterPassword) {
    setScreen('setup');
    return;
  }

  setScreen('unlock');
}

function clearSetupMessage() {
  setupMessage.textContent = '';
}

function clearUnlockMessage() {
  unlockMessage.textContent = '';
}

function createEntryId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getFilteredEntries() {
  const query = searchInput.value.trim().toLowerCase();

  if (!query) {
    return [...state.entries].reverse();
  }

  return [...state.entries]
    .filter((entry) => {
      const searchable = `${entry.website} ${entry.username}`.toLowerCase();
      return searchable.includes(query);
    })
    .reverse();
}

function renderEntries() {
  const filteredEntries = getFilteredEntries();
  resultCount.textContent = `${filteredEntries.length} item${filteredEntries.length === 1 ? '' : 's'}`;

  if (!filteredEntries.length) {
    passwordList.innerHTML = '<div class="empty-state">No passwords match your search.</div>';
    return;
  }

  const items = filteredEntries
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

  passwordList.innerHTML = items;
}

function resetForm() {
  entryForm.reset();
  state.editingId = null;
  formTitle.textContent = 'Add Password';
  cancelEditBtn.classList.add('hidden');
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

function handlePasswordSubmit(event) {
  event.preventDefault();

  const website = document.getElementById('websiteInput').value.trim();
  const username = document.getElementById('usernameInput').value.trim();
  const password = document.getElementById('passwordInput').value.trim();
  const note = document.getElementById('noteInput').value.trim();

  if (!website || !username || !password) {
    return;
  }

  if (state.editingId) {
    state.entries = state.entries.map((entry) =>
      entry.id === state.editingId ? { ...entry, website, username, password, note } : entry,
    );
  } else {
    state.entries.push({
      id: createEntryId(),
      website,
      username,
      password,
      note,
    });
  }

  saveEntries();
  renderEntries();
  resetForm();
}

function handleListClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) {
    return;
  }

  const { action, id } = button.dataset;
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) {
    return;
  }

  if (action === 'edit') {
    populateForm(entry);
    document.getElementById('websiteInput').focus();
  }

  if (action === 'delete') {
    const confirmed = window.confirm(`Delete ${entry.website} from your vault?`);
    if (!confirmed) {
      return;
    }

    state.entries = state.entries.filter((item) => item.id !== id);
    saveEntries();
    if (state.editingId === id) {
      resetForm();
    }
    renderEntries();
  }
}

function handleSetup(event) {
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

  state.masterPassword = password;
  localStorage.setItem(MASTER_PASSWORD_KEY, password);
  setupForm.reset();
  setupMessage.textContent = 'Vault created successfully.';
  setScreen('unlock');
}

function handleUnlock(event) {
  event.preventDefault();
  const enteredPassword = document.getElementById('unlockPassword').value;

  if (enteredPassword !== state.masterPassword) {
    unlockMessage.textContent = 'Incorrect master password.';
    return;
  }

  state.isUnlocked = true;
  clearUnlockMessage();
  document.getElementById('unlockForm').reset();
  setScreen('vault');
  renderEntries();
}

function handleLogout() {
  state.isUnlocked = false;
  state.editingId = null;
  resetForm();
  setScreen('unlock');
  document.getElementById('unlockPassword').focus();
}

setupForm.addEventListener('submit', handleSetup);
unlockForm.addEventListener('submit', handleUnlock);
entryForm.addEventListener('submit', handlePasswordSubmit);
searchInput.addEventListener('input', renderEntries);
passwordList.addEventListener('click', handleListClick);
cancelEditBtn.addEventListener('click', resetForm);
logoutBtn.addEventListener('click', handleLogout);

initScreens();
renderEntries();
