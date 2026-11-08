// Supabase Auth REST client. Public project URL and publishable/anon key only.
// Do not put service_role or secret keys in this file.
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './auth-config.js';

const configured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
const storageKey = 'poker-recall-auth-v1';
let session = null;
try { session = JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch { /* private storage */ }
const $ = id => document.getElementById(id);
const status = message => { $('account-status').textContent = message; };
const headers = () => ({ apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' });
function save(value) {
  session = value;
  try { if (value) localStorage.setItem(storageKey, JSON.stringify(value)); else localStorage.removeItem(storageKey); } catch { /* storage unavailable */ }
  render();
}
function render() {
  const email = session?.user?.email;
  $('account-toggle').textContent = email ? '♙ ' + email : '♙ Gast · Anmelden';
  $('account-form').hidden = Boolean(email);
  $('account-logout').hidden = !email;
  status(email ? 'Angemeldet als ' + email + '. Spielergebnisse werden noch nicht synchronisiert.' : configured ? 'Du spielst als Gast. Anmeldung ist freiwillig.' : 'Gastmodus aktiv. Für die Anmeldung muss zunächst Supabase eingerichtet werden.');
}
async function request(path, body, token) {
  const response = await fetch(SUPABASE_URL + '/auth/v1/' + path, {
    method: 'POST', headers: { ...headers(), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.msg || data.error_description || data.message || data.error || 'Anmeldung fehlgeschlagen');
  return data;
}
async function refresh() {
  if (!session?.refresh_token) return;
  try {
    const next = await request('token?grant_type=refresh_token', { refresh_token: session.refresh_token });
    save(next);
  } catch { save(null); }
}
function showError(error) { status('⚠️ ' + (error.message || String(error))); }
$('account-toggle').addEventListener('click', () => {
  const panel = $('account-panel');
  panel.hidden = !panel.hidden;
  $('account-toggle').setAttribute('aria-expanded', String(!panel.hidden));
});
$('account-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!configured) return status('Bitte zuerst Supabase URL und Publishable Key in src/auth-config.js eintragen.');
  try {
    const data = await request('token?grant_type=password', { email: $('account-email').value.trim(), password: $('account-password').value });
    save(data); $('account-password').value = '';
  } catch (error) { showError(error); }
});
$('account-signup').addEventListener('click', async () => {
  if (!configured) return status('Bitte zuerst Supabase in src/auth-config.js konfigurieren.');
  if (!$('account-form').reportValidity()) return;
  try {
    const data = await request('signup', { email: $('account-email').value.trim(), password: $('account-password').value });
    if (data.access_token) save(data);
    else status('Registrierung eingegangen. Bitte bestätige deine E-Mail, falls Supabase dies verlangt.');
    $('account-password').value = '';
  } catch (error) { showError(error); }
});
$('account-reset').addEventListener('click', async () => {
  if (!configured) return status('Bitte zuerst Supabase konfigurieren.');
  if (!$('account-email').value.trim()) return status('Bitte zuerst deine E-Mail eingeben.');
  try {
    await request('recover', { email: $('account-email').value.trim() });
    status('Wenn die E-Mail registriert ist, erhältst du einen Link zum Zurücksetzen.');
  } catch (error) { showError(error); }
});
$('account-logout').addEventListener('click', async () => {
  if (configured && session?.access_token) {
    try { await request('logout', {}, session.access_token); } catch { /* local logout always works */ }
  }
  save(null);
});
render();
if (configured && session?.refresh_token) refresh();
