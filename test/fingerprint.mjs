// A short, stable fingerprint of a day's puzzle: its groups (id + words, in order) and the board order.
import { createHash } from 'node:crypto';
import { puzzle } from '../site/js/daily.js';

export function fingerprint(day) {
  const p = puzzle(day);
  const text = JSON.stringify([p.groups.map((g) => [g.id, g.words]), p.board]);
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}
