export function generateDebateId(now: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const yyyy = now.getFullYear();
  const MM = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const hh = pad(now.getHours());
  const mm = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  const rand = Math.random().toString(36).slice(2, 6);
  return `deb-${yyyy}${MM}${dd}-${hh}${mm}${ss}-${rand}`;
}
