function notificationsPage(root) {
  const preferences = store.get('preferences', {}).notifications || {};
  const notes = platformNotifications.filter(note => preferences[note.category] !== false);

  root.innerHTML = shell(`<div class="container page">
    <div class="eyebrow">Your inbox</div>
    <h1>Stay in the loop.</h1>
    <p class="muted">Useful nudges for your study-abroad journey, all in one place.</p>
    ${notes.length
      ? `<div class="grid grid-2" style="margin-top:24px">${notes.map(note => `<article class="card">
          <div class="country-top"><span class="quick-icon">◷</span><span class="status ${note.tone}">${note.label}</span></div>
          <h3>${note.title}</h3>
          <p class="muted small">${note.message}</p>
          <button class="btn btn-ghost" onclick="toast('Marked as read')">Mark as read</button>
        </article>`).join('')}</div>`
      : '<div class="card empty" style="margin-top:24px">You have turned off all notification categories. You can change them any time in <a href="settings.html" style="color:var(--blue)">settings</a>.</div>'}
  </div>`);
}

window.moduleInit = notificationsPage;
