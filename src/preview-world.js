import { createInitialWorld, applySpell } from './world.js';
export function createPreviewWorld(spellId, now = Date.now()) {
  const w = createInitialWorld();
  if (spellId === 'rennervate') applySpell(w, 'stupefy', { now });
  if (spellId === 'episkey') applySpell(w, 'everte_statum', { now });
  if (spellId === 'vipera_evanesca') applySpell(w, 'serpensortia', { now });
  if (spellId === 'finite_incantatem') for (const id of ['accio','serpensortia','protego','reducto','impedimenta']) applySpell(w, id, { now });
  return w;
}
