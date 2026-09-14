export function messageDayKey(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso.slice(0, 10);
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatMessageDay(iso: string, locale: string, todayLabel: string, yesterdayLabel: string): string {
  const key = messageDayKey(iso);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  const yesterday = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
  if (key === today) return todayLabel;
  if (key === yesterday) return yesterdayLabel;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return key;
  return new Date(ms).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatMessageTime(iso: string, locale: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}
