import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SQL = readFileSync(new URL('../../supabase/migrations/20261019060000_pengajuan_dan_kartu_checkin.sql', import.meta.url), 'utf8');

// Pelajaran dari penerapan nyata: subkueri ke tabel yang sama di dalam kebijakannya sendiri ditolak Postgres
// ("infinite recursion detected in policy"), sehingga pemilik acara tidak bisa mengajukan sama sekali.
test('migrasi: kebijakan ajukan tidak membaca tabelnya sendiri (hitungan lewat fungsi security definer)', () => {
  const policy = /create policy "pemilik ajukan check-in"[^;]*;/.exec(SQL);
  assert.ok(policy, 'kebijakan ajukan ada');
  assert.doesNotMatch(policy[0], /from public\.checkin_requests/);
  assert.match(policy[0], /public\.jumlah_pengajuan_menunggu\(checkin_requests\.slug\) < 30/);
  assert.match(SQL, /create or replace function public\.jumlah_pengajuan_menunggu[\s\S]*security definer/);
  assert.match(SQL, /revoke all on function public\.jumlah_pengajuan_menunggu\(text\) from public, anon, authenticated;/);
  assert.match(SQL, /grant execute on function public\.jumlah_pengajuan_menunggu\(text\) to authenticated;/);
});

test('migrasi: hak tabel yang tidak dipakai dicabut (TRUNCATE tidak ditahan RLS)', () => {
  assert.match(SQL, /revoke delete, truncate, references, trigger on public\.checkin_requests from authenticated;/);
  assert.match(SQL, /revoke truncate, references, trigger on public\.checkin_cards from authenticated;/);
});
