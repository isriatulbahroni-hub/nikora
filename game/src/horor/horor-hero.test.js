import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HERO_CLIPS, MOVE_EPS, REF_SPEED, WALK_MAX, heroAnim, resolveClip } from './horor-hero.js';

test('heroAnim: diam, dan kecepatan tidak valid dianggap diam', () => {
  assert.equal(heroAnim().clip, 'Idle');
  assert.equal(heroAnim({ speed: MOVE_EPS / 2 }).clip, 'Idle');
  for (const speed of [NaN, -5, undefined, Infinity]) assert.equal(heroAnim({ speed }).clip, 'Idle');
});

test('heroAnim: jalan pelan, lari di atas ambang, mengendap saat jongkok', () => {
  assert.equal(heroAnim({ speed: 1.4 }).clip, 'Walk');
  assert.equal(heroAnim({ speed: WALK_MAX }).clip, 'Run');
  assert.equal(heroAnim({ speed: 4 }).clip, 'Run');
  assert.equal(heroAnim({ speed: 1.2, crouch: true }).clip, 'CrouchWalk');
  assert.equal(heroAnim({ speed: 0, crouch: true }).clip, 'Idle'); // jongkok tanpa bergerak tetap diam
});

test('heroAnim: kecepatan klip mengikuti kecepatan gerak dan dibatasi', () => {
  assert.equal(heroAnim({ speed: REF_SPEED.Run }).timeScale, 1);
  assert.equal(heroAnim({ speed: 100 }).timeScale, 1.5);
  assert.equal(heroAnim({ speed: WALK_MAX }).timeScale, 0.7); // lari paling pelan dibatasi 0.7
  assert.equal(heroAnim({ speed: 0.2, crouch: true }).timeScale, 0.5);
});

test('heroAnim: mati mengalahkan terkena, terkena mengalahkan gerak; keduanya sekali putar', () => {
  const dead = heroAnim({ speed: 4, dead: true, hurt: true });
  assert.deepEqual([dead.clip, dead.loop], ['Die', false]);
  const hurt = heroAnim({ speed: 4, hurt: true });
  assert.deepEqual([hurt.clip, hurt.loop], ['HitReaction', false]);
  assert.equal(heroAnim({ speed: 4 }).loop, true);
});

test('resolveClip: klip yang ada dipakai apa adanya', () => {
  const plan = heroAnim({ speed: 4 });
  assert.equal(resolveClip(plan, new Set(HERO_CLIPS)), plan);
});

test('resolveClip: Walk memakai Run yang diperlambat selama klip Walk belum ada', () => {
  const r = resolveClip(heroAnim({ speed: 1.4 }), new Set(HERO_CLIPS));
  assert.equal(r.clip, 'Run');
  assert.ok(r.timeScale > 0.3 && r.timeScale < 0.5);
  const withWalk = resolveClip(heroAnim({ speed: 1.4 }), new Set([...HERO_CLIPS, 'Walk']));
  assert.equal(withWalk.clip, 'Walk');
});

test('resolveClip: klip hilang jatuh ke Idle, dan tanpa Idle mengembalikan null', () => {
  assert.equal(resolveClip(heroAnim({ speed: 1.2, crouch: true }), ['Idle']).clip, 'Idle');
  assert.equal(resolveClip(heroAnim({ dead: true }), ['Idle']).clip, 'Idle');
  assert.equal(resolveClip(heroAnim({ dead: true }), []), null);
});
