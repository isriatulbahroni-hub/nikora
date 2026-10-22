// Data murni fasad kaca menara (tanpa THREE) supaya bisa diuji: ukuran tiang dan pelat tepi dalam piksel tekstur, dan jumlah pengulangan per sisi.
export const FACADE_TEX = 512;

/** Tata letak satu "bay" fasad (lebar bayWidth m x tinggi satu lantai) pada tekstur size x size piksel. */
export function facadeLayout({ bayWidth, levelHeight, finWidth, edgeHeight, size = FACADE_TEX }) {
  const finPx = Math.max(8, Math.round((finWidth / bayWidth) * size)); // tiang emas di kiri bay
  const edgePx = Math.max(8, Math.round((edgeHeight / levelHeight) * size)); // pelat tepi emas di bawah bay
  return { size, finPx, edgePx, paneW: size - finPx, paneH: size - edgePx };
}

/** Pengulangan tekstur (u mendatar, v menegak) untuk satu sisi: bilangan bulat supaya tiang tidak terpotong di sudut dan tepi. */
export function facadeRepeat(length, height, bayWidth, levelHeight) {
  return { u: Math.max(1, Math.round(length / bayWidth)), v: Math.max(1, Math.round(height / levelHeight)) };
}

/** Empat sisi cangkang: posisi, panjang, dan putaran supaya sisi depan bidang menghadap keluar. B = [minX, minZ, maxX, maxZ]. */
export function facadeSides(B, out = 0.06) {
  const midX = (B[0] + B[2]) / 2;
  const midZ = (B[1] + B[3]) / 2;
  return [
    { name: 'utara', x: midX, z: B[1] - out, ry: Math.PI, length: B[2] - B[0] },
    { name: 'selatan', x: midX, z: B[3] + out, ry: 0, length: B[2] - B[0] },
    { name: 'barat', x: B[0] - out, z: midZ, ry: -Math.PI / 2, length: B[3] - B[1] },
    { name: 'timur', x: B[2] + out, z: midZ, ry: Math.PI / 2, length: B[3] - B[1] },
  ];
}
