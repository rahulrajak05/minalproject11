function getLocalSettings() {
  const preferences = store.get('preferences', {});
  return {
    theme: store.get('theme', 'light'),
    notifications: {
      deadlines: true,
      recommendations: true,
      shortlist: true,
      ...preferences.notifications
    }
  };
}

function settingsPage(root) {
  const signedIn = Boolean(store.get('user', null)?.id);
  renderSettingsPage(root, getLocalSettings(), signedIn ? 'Synced with MySQL' : 'Saved to this session');
}

function renderSettingsPage(root, settings, syncStatus) {
  const { theme, notifications } = settings;
  const syncMessage = store.get('user', null)?.id
    ? 'Your preferences are saved to your MySQL account.'
    : 'Your preferences are saved to MySQL for this browser session. Sign in to keep them with your account.';

  root.innerHTML = shell(`<div class="container page settings-page">
    <div class="settings-heading">
      <div>
        <div class="eyebrow">Workspace preferences</div>
        <h1>Make GlobalEdu yours.</h1>
        <p class="muted">Choose how your workspace looks and which updates you receive.</p>
      </div>
      <span class="settings-save-status" id="settingsSaveStatus" role="status" aria-live="polite">${syncStatus}</span>
    </div>

    <div class="settings-layout">
      <div class="settings-main">
        <section class="card settings-card" aria-labelledby="appearanceHeading">
          <div class="settings-card-heading">
            <span class="settings-icon" aria-hidden="true">◐</span>
            <div>
              <h2 id="appearanceHeading">Appearance</h2>
              <p class="muted small">Pick the theme that feels right for you.</p>
            </div>
          </div>
          <div class="settings-theme-options" role="group" aria-label="Workspace theme">
            <label class="theme-option">
              <input type="radio" name="settingsTheme" value="light" ${theme === 'light' ? 'checked' : ''} onchange="setSettingsTheme(this.value)">
              <span class="theme-preview theme-preview-light" aria-hidden="true"><i></i><i></i><i></i></span>
              <span><strong>Light</strong><small>Bright and clear</small></span>
            </label>
            <label class="theme-option">
              <input type="radio" name="settingsTheme" value="dark" ${theme === 'dark' ? 'checked' : ''} onchange="setSettingsTheme(this.value)">
              <span class="theme-preview theme-preview-dark" aria-hidden="true"><i></i><i></i><i></i></span>
              <span><strong>Dark</strong><small>Easy on the eyes</small></span>
            </label>
          </div>
        </section>

        <section class="card settings-card" aria-labelledby="notificationsHeading">
          <div class="settings-card-heading">
            <span class="settings-icon" aria-hidden="true">⌁</span>
            <div>
              <h2 id="notificationsHeading">Notifications</h2>
              <p class="muted small">Manage the updates shown in your workspace.</p>
            </div>
          </div>
          <div class="settings-options">
            <label class="settings-option">
              <span><strong>Application deadlines</strong><small>Reminders for important dates in your study plan.</small></span>
              <input type="checkbox" role="switch" ${notifications.deadlines ? 'checked' : ''} onchange="saveNotificationPreference('deadlines', this.checked)">
            </label>
            <label class="settings-option">
              <span><strong>Recommendations</strong><small>Updates when new matches fit your profile.</small></span>
              <input type="checkbox" role="switch" ${notifications.recommendations ? 'checked' : ''} onchange="saveNotificationPreference('recommendations', this.checked)">
            </label>
            <label class="settings-option">
              <span><strong>Shortlist activity</strong><small>Updates when you save or compare a university.</small></span>
              <input type="checkbox" role="switch" ${notifications.shortlist ? 'checked' : ''} onchange="saveNotificationPreference('shortlist', this.checked)">
            </label>
          </div>
        </section>

        <section class="card settings-card" aria-labelledby="privacyHeading">
          <div class="settings-card-heading">
            <span class="settings-icon" aria-hidden="true">▣</span>
            <div>
              <h2 id="privacyHeading">Your data</h2>
              <p class="muted small">Export your browser data or clear GlobalEdu data from this device.</p>
            </div>
          </div>
          <div class="settings-data-row">
            <div>
              <strong>Export your data</strong>
              <p class="muted small">Download a copy of your saved GlobalEdu information.</p>
            </div>
            <button class="btn btn-secondary" type="button" onclick="exportGlobalEduData()">Download data</button>
          </div>
          <div class="settings-data-row settings-data-danger">
            <div>
              <strong>Clear local copy</strong>
              <p class="muted small">Remove this account's GlobalEdu copy from this browser. Your MySQL account will remain.</p>
            </div>
            <button class="btn btn-danger" type="button" onclick="clearGlobalEduData()">Clear data</button>
          </div>
          <p class="settings-storage-note" id="settingsStorageMessage" role="status" aria-live="polite">${syncMessage}</p>
        </section>
      </div>

      <aside class="card settings-side-card">
        <span class="settings-side-icon" aria-hidden="true">✦</span>
        <h2>Your next chapter, your way.</h2>
        <p class="muted small">Your appearance and notification choices are saved automatically.</p>
        <a class="btn btn-primary" href="profile.html">Update my profile</a>
        <a class="settings-help-link" href="notifications.html">View notifications <span aria-hidden="true">→</span></a>
      </aside>
    </div>
  </div>`);
}

function setSettingsTheme(theme) {
  if (theme !== 'light' && theme !== 'dark') {
    toast('Choose a valid theme');
    return;
  }
  document.body.classList.toggle('dark', theme === 'dark');
  store.set('theme', theme);
  setSettingsSyncStatus(store.get('user', null)?.id ? 'Saving to MySQL…' : 'Saving to this session…', 'Your theme choice has been saved.');
}

function saveNotificationPreference(name, enabled) {
  const allowed = ['deadlines', 'recommendations', 'shortlist'];
  if (!allowed.includes(name) || typeof enabled !== 'boolean') {
    toast('Could not save that notification preference');
    return;
  }
  const preferences = store.get('preferences', {});
  const notifications = {
    deadlines: true,
    recommendations: true,
    shortlist: true,
    ...preferences.notifications,
    [name]: enabled
  };
  store.set('preferences', { ...preferences, notifications });
  setSettingsSyncStatus(store.get('user', null)?.id ? 'Saving to MySQL…' : 'Saving to this session…', 'Your notification choices have been saved.');
}

function setSettingsSyncStatus(status, detail) {
  const saveStatus = document.getElementById('settingsSaveStatus');
  if (saveStatus) saveStatus.textContent = status;
  setSettingsStorageMessage(detail);
}

function setSettingsStorageMessage(message) {
  const storageMessage = document.getElementById('settingsStorageMessage');
  if (storageMessage) storageMessage.textContent = message;
}

function exportGlobalEduData() {
  const data = {};
  const accountPrefix = store.getPrefix();
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key !== 'globaledu_user' && (!key || !key.startsWith(accountPrefix))) continue;
    try {
      const name = key === 'globaledu_user' ? 'user' : key.slice(accountPrefix.length);
      data[name] = JSON.parse(localStorage.getItem(key));
    } catch (error) {
      console.error(`Unable to export GlobalEdu data for "${key}".`, error);
      toast('Could not export all saved data');
      return;
    }
  }

  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), data }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `globaledu-data-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Your data export is ready');
}

async function clearGlobalEduData() {
  const confirmed = window.confirm('Remove this account’s GlobalEdu copy from this browser and sign out? Your MySQL account will remain.');
  if (!confirmed) return;

  if (location.protocol !== 'file:') {
    try {
      await apiRequest('auth.php?action=logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      });
    } catch (error) {
      console.error('Unable to end the account session before clearing local data.', error);
      toast('Could not sign out securely; your data was not cleared');
      return;
    }
  }

  const accountPrefix = store.getPrefix();
  localStorage.removeItem('globaledu_legacy_user');
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (key === 'globaledu_user' || key && key.startsWith(accountPrefix)) localStorage.removeItem(key);
  }
  location.href = 'index.html';
}

window.moduleInit = settingsPage;
