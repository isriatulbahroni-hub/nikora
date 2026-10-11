export const GAME_RULES = Object.freeze({
  arenaLimit: 10.5,
  maxHealth: 100,
  playerDamage: 20,
  enemyDamage: 11,
  playerAttackRange: 1.8,
  playerAttackCooldown: 0.48,
  enemyAttackRange: 1.25,
  enemyAttackCooldown: 0.85,
  dashCooldown: 2.2,
  dashDuration: 0.18,
  dashSpeed: 15,
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

export function getDashDirection(movement, facing) {
  const length = Math.hypot(movement.x, movement.z);
  if (length > 0) return { x: movement.x / length, z: movement.z / length };
  const faceLength = Math.hypot(facing.x, facing.z);
  if (faceLength > 0) return { x: facing.x / faceLength, z: facing.z / faceLength };
  return { x: 0, z: -1 };
}
