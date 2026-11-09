function authPage(root) {
  const register = document.body.dataset.page === 'register';
  root.innerHTML = `<div class="auth-shell"><section class="auth-art"><a class="brand" href="index.html"><span class="brand-mark">G</span>GlobalEdu</a><div><div class="eyebrow" style="color:#b6d0ff">The world is your classroom</div><h1>Turn your ambition into a destination.</h1><p>Research with confidence, find funding with clarity, and build an application you believe in.</p></div><small>© 2026 GlobalEdu</small></section><section class="auth-box"><a href="index.html" class="brand"><span class="brand-mark">G</span>GlobalEdu</a><div class="eyebrow">${register ? 'Create your workspace' : 'Welcome back'}</div><h1>${register ? 'Start your global journey' : 'Pick up where you left off'}</h1><p class="muted">${register ? 'Save universities, track deadlines, and get personal recommendations.' : 'Your shortlist and application workspace are waiting.'}</p><form onsubmit="submitAuth(event)" class="card" style="padding:0;border:0;box-shadow:none;margin-top:24px">${register ? '<div class="field"><label>Full name</label><input name="name" autocomplete="name" required placeholder="Your name"></div>' : ''}<div class="field"><label>Email</label><input name="email" type="email" autocomplete="email" required placeholder="you@example.com"></div><div class="field"><label>Password</label><input name="password" type="password" minlength="8" maxlength="72" autocomplete="${register ? 'new-password' : 'current-password'}" required placeholder="${register ? '8+ characters' : 'Your password'}"></div><button class="btn btn-primary" type="submit" style="width:100%">${register ? 'Create account' : 'Log in'}</button></form><p id="authError" class="auth-error" role="alert" hidden></p><p class="small muted" style="margin-top:20px">${register ? 'Already have an account?' : 'New to GlobalEdu?'} <a href="${register ? 'login.html' : 'register.html'}" style="color:var(--blue);font-weight:700">${register ? 'Log in' : 'Create an account'}</a></p></section></div>`;
}

async function submitAuth(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const register = document.body.dataset.page === 'register';
  const button = form.querySelector('button[type="submit"]');
  const errorMessage = document.getElementById('authError');
  const data = Object.fromEntries(new FormData(form).entries());

  button.disabled = true;
  button.textContent = register ? 'Creating account…' : 'Signing in…';
  errorMessage.hidden = true;

  try {
    const result = await apiRequest(`auth.php?action=${register ? 'register' : 'login'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    const user = result.user;
    store.set('user', user);
    store.set('profile', { ...store.get('profile', {}), name: user.name, email: user.email });
    location.href = 'index.html';
  } catch (error) {
    errorMessage.textContent = error instanceof TypeError
      ? 'Cannot reach PHP. Start Apache and MySQL in XAMPP, then open http://localhost/globaledu/.'
      : error.message;
    errorMessage.hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = register ? 'Create account' : 'Log in';
  }
}

window.moduleInit = authPage;
