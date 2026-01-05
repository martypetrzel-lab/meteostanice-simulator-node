// world.js
// Budoucí rozšíření: roční období, počasí, vítr, déšť

export function getSeasonFactor(date = new Date()) {
  const month = date.getMonth() + 1;

  if (month <= 2 || month === 12) return -5; // zima
  if (month <= 5) return 0;                  // jaro
  if (month <= 8) return 5;                  // léto
  return 0;                                  // podzim
}
