import { PAGES, ROLE_LABELS, buildLink, checkInputs, generateSecret, interpretServerCheck } from './role-link.js';

const $ = (id) => document.getElementById(id);

function showError(message) {
  const el = $('error');
  el.textContent = message;
  el.style.display = message ? 'block' : 'none';
}

function card(role, url, event) {
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
  const verify = document.createElement('button');
  verify.type = 'button';
  verify.className = 'ghost';
  verify.textContent = 'Periksa di server';
  const status = document.createElement('div');
  status.className = 'sub';
  status.style.marginTop = '10px';
  verify.addEventListener('click', async () => {
    status.textContent = 'Memeriksa…';
    try {
      // hanya KUNCI (bukan rahasia induk) yang dikirim ke server kita sendiri, sama seperti saat tamu membuka tautan
      const res = await fetch('/api/token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Uji', world: 'villa', event: event || undefined, key: new URL(url).searchParams.get('key') }),
      });
      const result = res.ok ? await res.json() : null;
      const verdict = interpretServerCheck(result, role);
      status.textContent = `${verdict.ok ? '✓' : '✗'} ${verdict.message}`;
      status.style.color = verdict.ok ? '#7fe3a0' : '#ff9b9b';
    } catch {
      status.textContent = '✗ Tidak bisa menghubungi server. Cek koneksi internet.';
      status.style.color = '#ff9b9b';
    }
  });
  row.append(copy, share, verify);
  wrap.append(title, link, row, status);
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
      $('results').append(card(role, url, input.event));
    }
    $('results').style.display = 'block';
  } catch (error) {
    showError(String(error?.message ?? error));
  }
});

$('gen').addEventListener('click', async () => {
  showError('');
  try {
    const secret = generateSecret();
    $('secret').type = 'text'; // terlihat agar bisa diperiksa; dikembalikan ke tersembunyi saat diedit lagi
    $('secret').value = secret;
    $('gen-value').textContent = secret;
    $('gen-card').style.display = 'block';
    $('gen-copy').onclick = async () => {
      try {
        await navigator.clipboard.writeText(secret);
        $('gen-copy').textContent = 'Tersalin ✓';
      } catch {
        $('gen-copy').textContent = 'Tekan lama nilai untuk menyalin';
      }
    };
  } catch (error) {
    showError(String(error?.message ?? error));
  }
});
$('secret').addEventListener('focus', () => {
  if ($('secret').type === 'text' && $('gen-card').style.display === 'none') $('secret').type = 'password';
});
