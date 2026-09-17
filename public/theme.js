// theme.js - shared light/dark toggle for every page (index/journal/chart/
// accounts), at Esdras's request ("j'aimerais avoir la couleur blanche
// aussi du site, pas seulement noir"). Applied via data-theme="light" on
// <html>, persisted in localStorage so the choice survives navigation and
// reloads. Default (no attribute) is the original dark terminal look -
// nothing changes for anyone who never touches the toggle. Loaded as a
// plain (non-deferred) <script> early in <head>, before <style>, so the
// stored choice applies before first paint - no flash of the wrong theme.
(function () {
  try {
    if (localStorage.getItem('apexfvg-theme') === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  } catch (e) {
    // localStorage can throw (private browsing, blocked site data) - falls
    // back to the default dark theme, same as if nothing were stored.
  }
})();

function toggleTheme() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const next = isLight ? 'dark' : 'light';
  if (next === 'light') document.documentElement.setAttribute('data-theme', 'light');
  else document.documentElement.removeAttribute('data-theme');
  try { localStorage.setItem('apexfvg-theme', next); } catch (e) {}
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = next === 'light' ? '☀️' : '🌙';
  // Keeps the mobile browser/PWA status-bar color in sync with the page -
  // each page's <meta name="theme-color"> carries its own dark/light pair
  // via data-dark/data-light (the base dark color already varies slightly
  // per page).
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && meta.dataset.dark) {
    meta.setAttribute('content', next === 'light' ? (meta.dataset.light || '#f6f7f9') : meta.dataset.dark);
  }
}

document.addEventListener('DOMContentLoaded', function () {
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = document.documentElement.getAttribute('data-theme') === 'light' ? '☀️' : '🌙';
});
