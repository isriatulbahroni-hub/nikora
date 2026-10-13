import { PAGES, ROLE_LABELS, buildLink, checkInputs } from './role-link.js';

const $ = (id) => document.getElementById(id);

function showError(message) {
  const el = $('error');
  el.textContent = message;
  el.style.display = message ? 'block' : 'none';
}

function card(role, url) {
  const wrap = document.createElement('div');
  wrap.className = 'card';
  const title = document.createElement('h2');
  title.textContent = ROLE_LABELS[role];
  const link = document.createElement('div');
  link.className = 'link';
  link.textContent = url;
  const row = document.createElement('div');
  row.className = 'row';
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = 'Salin';
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url);
      copy.textContent = 'Tersalin ✓';
    } catch {
      copy.textContent = 'Tekan lama tautan untuk menyalin';
    }
  });
  const share = document.createElement('button');
  share.type = 'button';
  share.className = 'ghost';
  share.textContent = 'Kirim WhatsApp';
  share.addEventListener('click', () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(`Tautan ${ROLE_LABELS[role]}: ${url}`)}`, '_blank', 'noopener');
  });
  row.append(copy, share);
  wrap.append(title, link, row);
  return wrap;
}

$('make').addEventListener('click', async () => {
  showError('');
  $('results').style.display = 'none';
  $('results').replaceChildren();
  const input = checkInputs({ secret: $('secret').value, slug: $('slug').value });
  if (!input.ok) return showError(input.error);
  try {
    const page = $('page').value in PAGES ? $('page').value : 'villa';
    for (const role of ['owner', 'mc']) {
      const { url } = await buildLink({ origin: window.location.origin, page, event: input.event, role, secret: input.secret });
      $('results').append(card(role, url));
    }
    $('results').style.display = 'block';
  } catch (error) {
    showError(String(error?.message ?? error));
  }
});
