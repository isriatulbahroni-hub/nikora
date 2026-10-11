import { getTheme } from '../themes/index.js';

/** Data contoh agar setiap tema bisa dicoba tanpa database: ?tema=<id> */
export function demoInvitation(themeId) {
  const theme = getTheme(themeId) || getTheme('pernikahan-taman');
  if (theme.eventType === 'ulang_tahun') {
    return {
      slug: 'demo', groom: 'Aira', bride: '', event_type: 'ulang_tahun', theme: theme.id,
      event_date: '2026-12-12T15:00:00+07:00', extra: { title: 'Aira berusia 7 tahun' },
    };
  }
  return {
    slug: 'demo', groom: 'Dimas', bride: 'Rani', event_type: theme.eventType, theme: theme.id,
    event_date: '2026-12-12T10:00:00+08:00', extra: { tz: 'Asia/Makassar' },
  };
}
