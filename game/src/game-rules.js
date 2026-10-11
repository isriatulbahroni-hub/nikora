export const GAME_RULES = Object.freeze({
  arenaLimit: 10.5,
  maxHealth: 100,
  playerDamage: 25,
  enemyDamage: 9,
  playerAttackRange: 1.8,
  playerAttackCooldown: 0.48,
  enemyAttackRange: 1.25,
  enemyAttackCooldown: 1.05,
});

export function normalizeMovement(x, z) {
  const length = Math.hypot(x, z);
  if (length <= 1) return { x, z };
  return { x: x / length, z: z / length };
}

export function applyDamage(health, damage, maxHealth = GAME_RULES.maxHealth) {
  const safeHealth = Number.isFinite(health) ? health : 0;
  const safeDamage = Number.isFinite(damage) ? Math.max(0, damage) : 0;
  return Math.max(0, Math.min(maxHealth, safeHealth) - safeDamage);
}

export function getMatchOutcome(playerHealth, enemyHealth) {
  if (playerHealth <= 0 && enemyHealth <= 0) return 'draw';
  if (playerHealth <= 0) return 'defeat';
  if (enemyHealth <= 0) return 'victory';
  return 'playing';
}

export function isAttackReady(now, nextAttackAt) {
  return now >= nextAttackAt;
}

export function clampArenaPosition(position, limit = GAME_RULES.arenaLimit) {
  return {
    x: Math.max(-limit, Math.min(limit, position.x)),
    z: Math.max(-limit, Math.min(limit, position.z)),
  };
}