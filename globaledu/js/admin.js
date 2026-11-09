let adminRecords = [];

async function adminPage(root) {
  if (!store.get('user', null)?.id) {
    root.innerHTML = shell('<div class="container page"><div class="card"><h1>Sign in to manage your records.</h1><a class="btn btn-primary" href="login.html">Log in</a></div></div>');
    return;
  }
  try {
    const result = await apiRequest('fetch.php?resource=admin_records');
    adminRecords = result.records.map(record => ({ ...record, id: Number(record.id) }));
    renderAdminPage(root);
  } catch (error) {
    console.error('Unable to fetch saved records.', error);
    toast(error.message || 'Could not load records');
  }
}

function renderAdminPage(root = document.getElementById('app')) {
  const records = adminRecords;
  root.innerHTML = shell(`<div class="container page"><div class="eyebrow">Workspace administration</div><h1>Keep GlobalEdu current.</h1><p class="muted">Manage your custom records stored in your MySQL account.</p><div class="grid grid-4" style="margin:24px 0">${statCard('◎','Countries',countries.length)}${statCard('▦','Universities',universities.length)}${statCard('✦','Scholarships',scholarships.length)}${statCard('◷','Deadlines',deadlines.length)}</div><div class="admin-nav"><button class="btn btn-primary" type="button">Countries</button><button class="btn btn-secondary" type="button">Universities</button><button class="btn btn-secondary" type="button">Programs</button><button class="btn btn-secondary" type="button">Scholarships</button><button class="btn btn-secondary" type="button">Notifications</button></div><div class="card"><div class="section-head"><div><h2>Custom records</h2><p>Records are private to your account.</p></div><button class="btn btn-primary" onclick="addAdminRecord()">+ Add record</button></div>${records.length?`<div class="table-wrap"><table><thead><tr><th>Name</th><th>Type</th><th>Action</th></tr></thead><tbody>${records.map(record=>`<tr><td>${escapeHtml(record.name)}</td><td>${escapeHtml(record.type)}</td><td><button class="btn btn-secondary" onclick="editAdminRecord(${record.id})">Edit</button> <button class="btn btn-danger" onclick="deleteAdminRecord(${record.id})">Delete</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No custom records yet. Add one to save a record in MySQL.</div>'}</div></div>`);
}

async function addAdminRecord() {
  const name = window.prompt('Record name');
  if (!name || !name.trim()) return;
  try {
    const result = await apiRequest('insert.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource: 'admin_record', name: name.trim(), type: 'Custom' })
    });
    adminRecords.unshift(result.record);
    toast('Record added');
    renderAdminPage();
  } catch (error) {
    console.error('Unable to add record.', error);
    toast(error.message || 'Could not add record');
  }
}

async function editAdminRecord(id) {
  const record = adminRecords.find(item => Number(item.id) === Number(id));
  if (!record) return;
  const name = window.prompt('Record name', record.name);
  if (!name || !name.trim()) return;
  try {
    const result = await apiRequest('update.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource: 'admin_record', id, name: name.trim(), type: record.type })
    });
    adminRecords = adminRecords.map(item => Number(item.id) === Number(id) ? result.record : item);
    toast('Record updated');
    renderAdminPage();
  } catch (error) {
    console.error('Unable to update record.', error);
    toast(error.message || 'Could not update record');
  }
}

async function deleteAdminRecord(id) {
  try {
    await apiRequest('delete.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource: 'admin_record', id })
    });
    adminRecords = adminRecords.filter(record => Number(record.id) !== Number(id));
    toast('Record deleted');
    renderAdminPage();
  } catch (error) {
    console.error('Unable to delete record.', error);
    toast(error.message || 'Could not delete record');
  }
}

window.moduleInit = adminPage;
