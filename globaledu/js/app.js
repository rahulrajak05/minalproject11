/* Shared shell, storage helpers, dashboard and reusable university UI. */
function migrateLegacyData(prefix) {
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (!key || key === 'globaledu_user' || key === 'globaledu_legacy_user' || !key.startsWith('globaledu_')) continue;
    if (key.startsWith('globaledu_account_') || key.startsWith('globaledu_guest_')) continue;
    localStorage.setItem(`${prefix}${key.slice('globaledu_'.length)}`, localStorage.getItem(key));
    localStorage.removeItem(key);
  }
}

const store = {
  getPrefix() {
    const user = this.get('user', null);
    const identity = user && (user.id || user.email);
    return identity ? `globaledu_account_${encodeURIComponent(String(identity))}_` : 'globaledu_guest_';
  },
  keyFor(key) {
    return key === 'user' ? 'globaledu_user' : `${this.getPrefix()}${key}`;
  },
  get(key, fallback) {
    const storageKey = this.keyFor(key);
    let value = localStorage.getItem(storageKey);
    if (value === null && key !== 'user' && !this.get('user', null)) {
      const legacyKey = `globaledu_${key}`;
      value = localStorage.getItem(legacyKey);
      if (value !== null) {
        localStorage.setItem(storageKey, value);
        localStorage.removeItem(legacyKey);
      }
    }
    try {
      return JSON.parse(value) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    if (key === 'user') {
      let previous = this.get('user', null);
      if (!previous) {
        try {
          previous = JSON.parse(localStorage.getItem('globaledu_legacy_user'));
        } catch {
          previous = null;
        }
      }
      if (previous?.email && value?.email && !previous.id) {
        const sameEmail = previous.email.trim().toLowerCase() === value.email.trim().toLowerCase();
        const prefix = sameEmail
          ? `globaledu_account_${encodeURIComponent(String(value.id || value.email))}_`
          : 'globaledu_guest_';
        migrateLegacyData(prefix);
        localStorage.removeItem('globaledu_legacy_user');
      }
      localStorage.setItem('globaledu_user', JSON.stringify(value));
      return;
    }
    localStorage.setItem(this.keyFor(key), JSON.stringify(value));
    if (workspaceSyncReady) {
      return saveWorkspaceValue(key, value);
    }
    return Promise.resolve(true);
  }
};
let workspaceSyncReady = false;
let workspaceSyncQueue = Promise.resolve();
const phpApi = 'php/';
async function apiRequest(path, options = {}) {
  const response = await fetch(`${phpApi}${path}`, {
    credentials: 'same-origin',
    ...options
  });
  let result = {};
  try {
    result = await response.json();
  } catch {
    throw new Error('The server returned an invalid response.');
  }
  if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
  return result;
}
function saveWorkspaceValue(key, value) {
  workspaceSyncQueue = workspaceSyncQueue.then(() => apiRequest('update.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resource: 'workspace', key, value })
  })).then(() => {
    if ((key === 'theme' || key === 'preferences') && typeof setSettingsSyncStatus === 'function') {
      const signedIn = Boolean(store.get('user', null)?.id);
      setSettingsSyncStatus(
        signedIn ? 'Synced with MySQL' : 'Saved to this session',
        signedIn
          ? 'Your preferences are synced with MySQL for this account.'
          : 'Your preferences are saved to MySQL for this browser session.'
      );
    }
    return true;
  }).catch(error => {
    console.error(`Unable to save "${key}" to MySQL.`, error);
    toast(error.message || 'Your changes could not be saved to MySQL.');
    return false;
  });
  return workspaceSyncQueue;
}
async function loadWorkspaceFromDatabase() {
  const result = await apiRequest('fetch.php?resource=workspace');
  const remote = result.workspace;
  if (!remote || typeof remote !== 'object' || Array.isArray(remote)) {
    throw new Error('The server returned invalid workspace data.');
  }
  const prefix = store.getPrefix();
  const local = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const storageKey = localStorage.key(index);
    if (!storageKey || !storageKey.startsWith(prefix)) continue;
    const key = storageKey.slice(prefix.length);
    try {
      local[key] = JSON.parse(localStorage.getItem(storageKey));
    } catch {
      console.error(`Ignoring invalid local data for "${key}".`);
    }
  }
  Object.entries(remote).forEach(([key, value]) => {
    localStorage.setItem(`${prefix}${key}`, JSON.stringify(value));
  });
  workspaceSyncReady = true;
  for (const [key, value] of Object.entries(local)) {
    if (!Object.prototype.hasOwnProperty.call(remote, key)) {
      await apiRequest('update.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource: 'workspace', key, value })
      });
    }
  }
}
async function loadCatalogFromDatabase() {
  const data = await apiRequest('fetch.php?resource=catalog');
  for (const key of ['countries', 'universities', 'programs', 'scholarships', 'departments', 'requirements', 'deadlines', 'notifications']) {
    if (!Array.isArray(data[key])) throw new Error(`The database did not return valid ${key} data.`);
  }
  countries = data.countries;
  universities = data.universities;
  programs = data.programs;
  scholarships = data.scholarships;
  departments = data.departments;
  platformNotifications = data.notifications;
  requirements = data.requirements;
  deadlines = data.deadlines;
}
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const initials=name=>name.split(' ').map(x=>x[0]).slice(0,2).join('');
function toast(message){const el=document.getElementById('toast');if(!el)return;el.textContent=message;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2600)}
function isFav(id){return store.get('favorites',[]).includes(id)}
function toggleFavorite(id){let favorites=store.get('favorites',[]);favorites=favorites.includes(id)?favorites.filter(x=>x!==id):[...favorites,id];store.set('favorites',favorites);toast(favorites.includes(id)?'Added to your favorites':'Removed from favorites');renderPage();}
function toggleCompare(id){let selected=store.get('compare',[]);selected=selected.includes(id)?selected.filter(x=>x!==id):selected.length<4?[...selected,id]:selected;store.set('compare',selected);toast(selected.includes(id)?'Added to comparison':'Removed from comparison');renderPage()}
function uniCard(u){return `<article class="card uni-card"><div class="uni-top"><div class="logo" style="background:${u.logo}">${escapeHtml(u.short)}</div><button class="heart ${isFav(u.id)?'active':''}" onclick="toggleFavorite('${u.id}')" aria-label="Favorite">${isFav(u.id)?'♥':'♡'}</button></div><div><h3>${escapeHtml(u.name)}</h3><p class="muted small">${countryName(u.country)} · ${u.city}</p></div><div class="uni-meta"><div><span class="muted small">World rank</span><strong>#${u.rank}</strong></div><div><span class="muted small">Tuition / year</span><strong>${u.tuition}</strong></div></div><div class="small"><span class="tag">${u.scholarship} scholarship availability</span></div><p class="muted small">${u.programs.join(' · ')}</p><div class="card-footer uni-actions"><a class="btn btn-primary" href="university-details.html?id=${u.id}">View details</a><button class="btn btn-secondary" onclick="toggleCompare('${u.id}')">${store.get('compare',[]).includes(u.id)?'✓ Compared':'Compare'}</button></div></article>`}
function countryName(id){return countries.find(c=>c.id===id)?.name||id}
async function logout(){try{await apiRequest('auth.php?action=logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})}catch(error){console.error('Unable to end the account session.',error);toast(error.message||'Unable to sign out right now');return}workspaceSyncReady=false;localStorage.removeItem('globaledu_user');toast('Logged out');setTimeout(()=>location.href='index.html',350)}
function shell(content){const page=document.body.dataset.page,user=store.get('user',null),profile=store.get('profile',{}),avatar=(profile.name||user?.name||'GE').split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase(),sidebarLinks=[['index.html','⌂','Dashboard','home'],['universities.html','◎','Universities','universities'],['countries.html','⌖','Countries','countries'],['programs.html','▦','Programs','programs'],['scholarships.html','✦','Scholarships','scholarships'],['compare.html','⇄','Compare','compare'],['recommendations.html','◈','For you','recommendations'],['favorites.html','♡','Favorites','favorites'],['deadlines.html','◷','Deadlines','deadlines'],['documents.html','✓','Documents','documents'],['profile.html','◉','My profile','profile'],['notifications.html','⌁','Notifications','notifications'],['settings.html','⚙','Settings','settings'],['admin.html','▣','Admin','admin']];return `<header class="topbar"><div class="container nav-inner"><button class="menu-btn" onclick="document.querySelector('.sidebar').classList.toggle('open')">☰</button><a href="index.html" class="brand"><span class="brand-mark">G</span>GlobalEdu</a><nav class="nav-links"><a class="${page==='home'?'active':''}" href="index.html">Home</a><a class="${page==='universities'?'active':''}" href="universities.html">Universities</a><a class="${page==='scholarships'?'active':''}" href="scholarships.html">Scholarships</a>${user?`<a class="${page==='recommendations'?'active':''}" href="recommendations.html">For you</a>`:''}</nav><div class="nav-actions"><button class="icon-btn" onclick="toggleTheme()" title="Toggle theme">◐</button>${user?`<a class="icon-btn" href="notifications.html" title="Notifications">⌁</a><a class="avatar" href="profile.html">${avatar}</a>`:'<a class="btn btn-secondary" href="login.html">Login</a><a class="btn btn-primary" href="register.html">Register</a>'}<button class="menu-btn" onclick="document.querySelector('.sidebar').classList.toggle('open')">☰</button></div></div></header>${user?`<div class="app-layout"><aside class="sidebar"><div class="sidebar-label">Workspace</div>${sidebarLinks.map(l=>`<a class="sidebar-link ${page===l[3]?'active':''}" href="${l[0]}"><span>${l[1]}</span>${l[2]}</a>`).join('')}<button class="sidebar-link sidebar-logout" onclick="logout()"><span>↪</span>Log out</button></aside><main class="content-area">${content}</main></div>`:`<main>${content}</main>`}<footer class="footer"><div class="container"><strong>GlobalEdu</strong> · Make your next chapter global. <span style="float:right">Built for curious minds · 2026</span></div></footer>`}
function toggleTheme(){document.body.classList.toggle('dark');store.set('theme',document.body.classList.contains('dark')?'dark':'light')}
function statCard(icon,label,value){if(label==='Universities indexed')value=universities.length;if(label==='Scholarships tracked')value=scholarships.length;if(label==='Countries to explore')value=countries.length;return `<div class="card kpi"><div><span class="muted small">${label}</span><strong>${value}</strong></div><span class="kpi-icon">${icon}</span></div>`}
async function submitNewsletter(event){event.preventDefault();const form=event.currentTarget,email=new FormData(form).get('email');if(!email)return;const button=form.querySelector('button');button.disabled=true;try{const result=await apiRequest('insert.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({resource:'newsletter',email})});toast(result.message);form.reset()}catch(error){console.error('Unable to save newsletter subscription.',error);toast(error.message||'Could not join the update list')}finally{button.disabled=false}}
function enhanceFooter(){const footer=document.querySelector('.footer');if(!footer)return;footer.className='footer site-footer';footer.innerHTML=`<div class="container"><div class="footer-main"><div class="footer-brand"><a href="index.html" class="brand"><span class="brand-mark">G</span>GlobalEdu</a><p>Good decisions start with better information. Find the university, funding, and confidence to take your next step.</p><span class="footer-live"><i></i> Platform updated today</span></div><div class="footer-links"><div><strong>Explore</strong><a href="universities.html">Universities</a><a href="countries.html">Countries</a><a href="programs.html">Programs</a><a href="scholarships.html">Scholarships</a></div><div><strong>Plan</strong><a href="recommendations.html">Recommendations</a><a href="compare.html">Compare</a><a href="deadlines.html">Deadlines</a><a href="documents.html">Documents</a></div></div><div class="footer-signup"><strong>Get useful updates</strong><p>New scholarships and deadline reminders, occasionally.</p><form onsubmit="submitNewsletter(event)"><input name="email" type="email" required placeholder="Your email address"><button class="btn btn-primary">Join list</button></form></div></div><div class="footer-bottom"><span>© ${new Date().getFullYear()} GlobalEdu. Built for curious minds.</span><span>Made for your next chapter <b>✦</b></span></div></div>`}
function home(){const featured=countries.slice(0,4), popular=universities.slice(0,4), favs=universities.filter(u=>isFav(u.id)).slice(0,3);return shell(`<section class="hero"><div class="container"><div class="eyebrow">Your global education workspace</div><h1>Find the place<br>where you’ll thrive.</h1><p>Explore 20 leading universities, funding opportunities, and a clear path from shortlist to application.</p><div class="searchbar"><input id="homeSearch" placeholder="Search university, program or country" onkeydown="if(event.key==='Enter')goSearch(this.value)"><select><option>All destinations</option>${countries.map(c=>`<option>${c.name}</option>`).join('')}</select><button class="btn btn-primary" onclick="goSearch(document.getElementById('homeSearch').value)">Search</button></div></div></section><div class="container page"><section class="grid grid-4">${statCard('◈','Universities indexed','20+')} ${statCard('✦','Scholarships tracked','15')} ${statCard('⌖','Countries to explore','10')} ${statCard('✓','Your shortlist',store.get('favorites',[]).length)}</section><section class="section"><div class="section-head"><div><div class="eyebrow">Start exploring</div><h2>Popular destinations</h2></div><a class="btn btn-ghost" href="countries.html">View all countries →</a></div><div class="grid grid-4">${featured.map(c=>`<a class="card country-card" style="--country-accent:${c.accent}" href="universities.html?country=${c.id}"><div class="country-top"><span class="flag">${c.flag}</span><span class="tag">${c.code}</span></div><h3>${c.name}</h3><p class="muted small">${c.universities} universities · ${c.tuition}</p><span class="small" style="color:var(--blue);font-weight:700">Explore destination →</span></a>`).join('')}</div></section><section class="section"><div class="section-head"><div><div class="eyebrow">Curated for you</div><h2>Popular universities</h2></div><a class="btn btn-ghost" href="universities.html">Browse all →</a></div><div class="grid grid-4">${popular.map(uniCard).join('')}</div></section><section class="section"><div class="section-head"><div><div class="eyebrow">Your workspace</div><h2>Keep moving forward</h2></div></div><div class="grid grid-3"><a class="card quick-card" href="profile.html"><span class="quick-icon">◎</span><div><h3>Complete your profile</h3><p class="muted small">Get more relevant recommendations</p></div></a><a class="card quick-card" href="scholarships.html"><span class="quick-icon">✦</span><div><h3>Find funding</h3><p class="muted small">15 opportunities matched to your goals</p></div></a><a class="card quick-card" href="deadlines.html"><span class="quick-icon">◷</span><div><h3>Track deadlines</h3><p class="muted small">Stay ahead of every application</p></div></a></div></section>${favs.length?`<section class="section"><div class="section-head"><h2>Your shortlist</h2><a class="btn btn-ghost" href="favorites.html">Open shortlist →</a></div><div class="grid grid-3">${favs.map(uniCard).join('')}</div></section>`:''}</div>`)}
function creativeHome(){const featured=countries.slice(0,4),popular=universities.slice(0,3),favs=universities.filter(u=>isFav(u.id)).slice(0,3);return shell(`<section class="hero creative-hero"><div class="container hero-layout"><div class="hero-copy"><div class="eyebrow">Your global education workspace</div><h1>Build a future<br><span>without borders.</span></h1><p>Search the world’s best universities, discover funding that fits, and turn your study-abroad dream into a plan you can act on.</p><div class="searchbar"><input id="homeSearch" placeholder="Search university, program or country" onkeydown="if(event.key==='Enter')goSearch(this.value)"><select><option>All destinations</option>${countries.map(c=>`<option>${c.name}</option>`).join('')}</select><button class="btn btn-primary" onclick="goSearch(document.getElementById('homeSearch').value)">Search</button></div><div class="hero-proof"><span class="proof-avatars"><i>AS</i><i>MK</i><i>JR</i></span><span><strong>12,000+ students</strong><br><small>started their global journey here</small></span></div></div><div class="hero-visual"><img src="https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=1000&q=85" alt="Students walking across a university campus"><div class="hero-float float-top"><strong>92%</strong><span>students find a match</span></div><div class="hero-float float-bottom"><span class="float-icon">✦</span><div><strong>Scholarship found</strong><small>Global Excellence Award</small></div></div></div></div></section><div class="container page"><section class="grid grid-4 stat-strip">${statCard('◈','Universities indexed','20+')} ${statCard('✦','Scholarships tracked','15')} ${statCard('⌖','Countries to explore','10')} ${statCard('✓','Your shortlist',store.get('favorites',[]).length)}</section><section class="section journey-section"><div class="section-head"><div><div class="eyebrow">A clearer way forward</div><h2>From “what if?” to “I’m going.”</h2></div><a class="btn btn-ghost" href="profile.html">Personalize my path →</a></div><div class="journey-grid"><div class="journey-step"><span>01</span><div><h3>Find your fit</h3><p>Filter by destination, budget, ranking, program, and language requirements.</p></div></div><div class="journey-step"><span>02</span><div><h3>Make it affordable</h3><p>Compare scholarships, tuition, deadlines, and application requirements.</p></div></div><div class="journey-step"><span>03</span><div><h3>Move with confidence</h3><p>Track documents and deadlines from shortlist to submission.</p></div></div></div></section><section class="section destination-section"><div class="section-head"><div><div class="eyebrow">Where will you go?</div><h2>Popular destinations</h2></div><a class="btn btn-ghost" href="countries.html">Explore all countries →</a></div><div class="grid grid-4">${featured.map(c=>`<a class="card country-card" style="--country-accent:${c.accent}" href="universities.html?country=${c.id}"><div class="country-top"><span class="flag">${c.flag}</span><span class="tag">${c.code}</span></div><h3>${c.name}</h3><p class="muted small">${c.universities} universities · ${c.tuition}</p><span class="small" style="color:var(--blue);font-weight:700">Explore destination →</span></a>`).join('')}</div></section><section class="section feature-band"><div class="feature-image"><img src="https://images.unsplash.com/photo-1498243691581-b145c3f54a5a?auto=format&fit=crop&w=900&q=85" alt="Modern university library interior"></div><div class="feature-copy"><div class="eyebrow">The GlobalEdu advantage</div><h2>More than a search. A smarter starting point.</h2><p class="muted">Every decision gets easier when the right information is in one place. See real tuition ranges, funding access, English requirements, and deadlines before you commit.</p><div class="feature-list"><span>✓ Transparent tuition and fees</span><span>✓ Profile-based recommendations</span><span>✓ A checklist that keeps you moving</span></div><a href="recommendations.html" class="btn btn-primary">See my recommendations</a></div></section><section class="section"><div class="section-head"><div><div class="eyebrow">Worth a closer look</div><h2>Universities students love</h2></div><a class="btn btn-ghost" href="universities.html">Browse all →</a></div><div class="grid grid-3">${popular.map(uniCard).join('')}</div></section><section class="section funding-callout"><div><div class="eyebrow">Funding spotlight</div><h2>Your dream destination may be more attainable than you think.</h2><p>Explore awards from $5,000 to full tuition across the GlobalEdu network.</p></div><a class="btn btn-primary" href="scholarships.html">Find scholarships ✦</a></section>${favs.length?`<section class="section"><div class="section-head"><h2>Your shortlist</h2><a class="btn btn-ghost" href="favorites.html">Open shortlist →</a></div><div class="grid grid-3">${favs.map(uniCard).join('')}</div></section>`:''}</div>`)}
function goSearch(query){location.href=`universities.html${query?'?q='+encodeURIComponent(query):''}`}
async function pageInit() {
  const root = document.getElementById('app');
  if (location.protocol === 'file:') {
    root.innerHTML = '<div class="container page"><div class="card"><h1>Start GlobalEdu with XAMPP</h1><p>Open this page through http://localhost/globaledu/ so PHP can connect to MySQL.</p></div></div>';
    return;
  }
  try {
    const session = await apiRequest('auth.php?action=me');
    store.set('user', session.user);
  } catch (error) {
    if (!/sign in/i.test(error.message)) {
      console.error('Unable to verify the PHP session.', error);
      root.innerHTML = `<div class="container page"><div class="card"><h1>GlobalEdu could not connect</h1><p>${escapeHtml(error.message)}</p><p>Check that Apache and MySQL are running and import php/database/database.sql in phpMyAdmin.</p></div></div>`;
      return;
    }
    localStorage.removeItem('globaledu_user');
  }
  try {
    await loadWorkspaceFromDatabase();
    await loadCatalogFromDatabase();
  } catch (error) {
    workspaceSyncReady = false;
    console.error('Unable to load GlobalEdu data from MySQL.', error);
    root.innerHTML = `<div class="container page"><div class="card"><h1>GlobalEdu could not load its data</h1><p>${escapeHtml(error.message)}</p><p>Check that Apache and MySQL are running and import php/database/database.sql in phpMyAdmin.</p></div></div>`;
    return;
  }
  document.body.classList.toggle('dark', store.get('theme') === 'dark');
  if (document.body.dataset.page === 'home' || !window.moduleInit) root.innerHTML = creativeHome();
  if (window.moduleInit) window.moduleInit(root);
  enhanceFooter();
}
document.addEventListener('DOMContentLoaded',pageInit);
