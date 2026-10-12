/**
 * Kecilkan foto di peramban sebelum diunggah: sisi terpanjang maks 1600 px, JPEG kualitas .82.
 * Foto ponsel 4-8 MB menjadi sekitar 250-500 KB. EXIF (termasuk lokasi GPS) ikut hilang karena digambar ulang.
 */
export async function resizeToJpeg(file, { max = 1600, quality = 0.82 } = {}) {
  if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Pilih foto JPEG, PNG, atau WebP.');
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bmp.width * k));
  canvas.height = Math.max(1, Math.round(bmp.height * k));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  if (bmp.close) bmp.close();
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
  if (!blob) throw new Error('Foto tidak bisa diproses.');
  return blob;
}
