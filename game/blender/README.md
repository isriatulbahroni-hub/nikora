# Bugatti Chiron (sumber Blender)
File sumber: `nikora_bugatti_chiron.blend` (Blender 5.2). Versi GLB statis ada di `game/public/models/mobil-bugatti-chiron.glb`.
## Kontrol
Semua fitur digerakkan oleh custom property pada objek empty `CAR_CTRL` (nilai awal di bawah). Game cukup menulis nilai-nilai ini; driver di Blender mengurus pintu, atap, kaca, lampu, hazard/sein, neon, layar iPad, dsb.
| Properti | Nilai awal |
|---|---|
| `door_L` | `0.0` |
| `door_R` | `0.0` |
| `steer` | `0.0` |
| `distance` | `0.0` |
| `roof` | `0.0` |
| `window_L` | `0.0` |
| `window_R` | `0.0` |
| `headlights` | `0.0` |
| `brake` | `0.0` |
| `flame` | `0.0` |
| `flame_auto` | `0.0` |
| `cabin_light` | `0.0` |
| `ambient` | `1.0` |
| `speed` | `0.0` |
| `gear` | `0.0` |
| `paddle_L` | `0.0` |
| `paddle_R` | `0.0` |
| `vent_open` | `0.0` |
| `btn_0` | `0.0` |
| `btn_1` | `0.0` |
| `btn_2` | `0.0` |
| `btn_3` | `0.0` |
| `btn_4` | `0.0` |
| `handbrake` | `0.0` |
| `knob_A` | `0.5` |
| `knob_B` | `0.5` |
| `hazard` | `0.0` |
| `sw_L0` | `0.0` |
| `sw_L1` | `0.0` |
| `sw_L2` | `0.0` |
| `sw_R0` | `0.0` |
| `sw_R1` | `0.0` |
| `sw_R2` | `0.0` |
| `cam_active` | `0` |
| `ipad_page` | `7` |
| `music_play` | `0` |
| `music_track` | `0` |
| `music_next` | `0` |
| `music_prev` | `0` |
| `music_vol` | `0.6` |
| `music_pos` | `0.0` |
| `music_src` | `2` |
| `drive_mode` | `1` |
| `speed_key` | `0` |
| `air_brake` | `0` |
| `esc` | `1` |
| `asr` | `1` |
| `launch` | `0` |
| `temp_L` | `21.0` |
| `temp_R` | `21.0` |
| `fan` | `0.5` |
| `ac` | `1` |
| `defrost` | `0` |
| `seat_L` | `0` |
| `seat_R` | `0` |
| `fuel` | `0.72` |
| `tp_FL` | `2.8` |
| `tp_FR` | `2.8` |
| `tp_RL` | `2.8` |
| `tp_RR` | `2.8` |
| `nav_on` | `1` |
| `nav_dest` | `0` |
| `phone_call` | `0` |
| `park_sensor` | `1` |
| `turn_L` | `0.0` |
| `turn_R` | `0.0` |
| `neon_on` | `1.0` |
| `neon_color` | `0.0` |
| `neon_bright` | `0.6` |
| `_prev_page` | `2` |

Hazard: `hazard`=1 membuat keempat sein berkedip. Sein kiri/kanan: `turn_L` / `turn_R`.

## Kamera
`CAM_front`, `CAM_left`, `CAM_rear`, `CAM_right`, `CAM_top`, `Camera`, `TMP_cam`

## Catatan
- Cat berbutir, clearcoat, dan halo neon memakai node Blender; tidak ikut ke GLB.
- Jangan hapus kamera `CAM_*` / `TMP_cam` (dipakai untuk kamera mundur dan full body dari dalam).
