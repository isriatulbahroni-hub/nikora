// Aturan dasar dunia ORBIT (dipakai klien dan server).
export const GAME_RULES = Object.freeze({
  arenaLimit: 10.5,
  playerSpeed: 5.2,
});

export function normalizeMovement(x, z) {
  const length = Math.hypot(x, z);
  if (length <= 1) return { x, z };
  return { x: x / length, z: z / length };
}

export function clampArenaPosition(position, limit = GAME_RULES.arenaLimit) {
  return {
    x: Math.max(-limit, Math.min(limit, position.x)),
    z: Math.max(-limit, Math.min(limit, position.z)),
  };
}

/** Ubah arah joystick/keyboard (layar) menjadi arah dunia menurut sudut putar kamera `yaw`. */
export function cameraRelativeMovement(input, yaw) {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return { x: input.x * cos + input.z * sin, z: -input.x * sin + input.z * cos };
}
