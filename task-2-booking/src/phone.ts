// @rev kc-31
// Казахстанский мобильный: +7 / 8 / 7, затем 10 цифр, начинающихся с 7.
// Возвращает '+77012345678' или null.
export function normalizePhone(raw: string): string | null {
  const compact = raw.replace(/[\s()-]/g, '');
  const match = /^(?:\+7|8|7)(7\d{9})$/.exec(compact);
  return match ? `+7${match[1]}` : null;
}
