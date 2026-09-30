/** P2.11d.3f.0 - non-destructive rest diagnostics for Foundryborne 2.10.6.
 * Run on a GM client before opening a native long-rest dialog.
 * This module never modifies Actors, ChatMessages, world settings or infusions.
 */
const LIMIT = 90;
let active = false;
let hooks = [];
let rows = [];
const clone = (v) => { try { return foundry.utils.deepClone(v); } catch { return String(v); } };
const briefActor = (a) => ({ id: a?.id ?? null, name: a?.name ?? null, uuid: a?.uuid ?? null,
  type: a?.type ?? null, permanent: !!(a?.id && game.actors?.get?.(a.id)) });
function log(kind, actor, detail = {}) {
  if (!active || rows.length >= LIMIT) return;
  const row = { index: rows.length + 1, kind, actor: briefActor(actor), detail: clone(detail) };
  rows.push(row);
  console.info('daggerheart-campaign-toolkit | rest probe', row);
}
function messageSummary(m) {
  const src = m?.toObject?.() ?? {};
  return { id: m?.id, type: m?.type, speaker: clone(m?.speaker),
    content: String(m?.content ?? '').slice(0, 1300),
    system: clone(src.system ?? m?.system?._source ?? {}),
    flags: clone(src.flags ?? {}),
  };
}
function add(name, callback) { hooks.push([name, Hooks.on(name, callback)]); }
export const artificerRestDiagnostic = Object.freeze({
  start() {
    if (!game.user?.isGM) throw new Error('Démarrer la sonde avec un compte MJ.');
    if (active) return { active, rows: rows.length };
    rows = []; active = true;
    // Both actor changes and committed downtime chat are captured. No inference
    // that a resource refill necessarily means a rest has finished.
    add('preUpdateActor', (actor, changes, options, userId) => log('preUpdateActor', actor,
      { changes, options, userId }));
    add('updateActor', (actor, changes, options, userId) => log('updateActor', actor,
      { changes, options, userId }));
    add('createChatMessage', (message, options, userId) => log('createChatMessage', null,
      { message: messageSummary(message), options, userId }));
    add('updateChatMessage', (message, changes, options, userId) => log('updateChatMessage', null,
      { message: messageSummary(message), changes, options, userId }));
    add('createActiveEffect', (effect, options, userId) => log('createActiveEffect', effect?.parent,
      { effectName: effect?.name, options, userId }));
    add('deleteActiveEffect', (effect, options, userId) => log('deleteActiveEffect', effect?.parent,
      { effectName: effect?.name, options, userId }));
    console.info('Toolkit rest probe STARTED; first cancel a native long rest, then complete a new one. No data will be modified by the probe.');
    return { active, version: 'P2.11d.3f.0', system: game.system?.version };
  },
  mark(label) { log('MARK', null, { label: String(label).slice(0, 100) }); },
  stop() {
    active = false;
    for (const [name, id] of hooks) Hooks.off(name, id);
    hooks = [];
    console.info('Toolkit rest probe STOPPED', { rows: rows.length });
    return this.report();
  },
  report() { return clone(rows); },
  summary() { console.table(rows.map(r => ({ index: r.index, kind: r.kind,
    actor: r.actor.name, chatType: r.detail?.message?.type,
    changePaths: r.detail?.changes ? Object.keys(foundry.utils.flattenObject(r.detail.changes)).join(', ') : '',
    content: r.detail?.message?.content?.replace(/<[^>]*>/g, ' ').slice(0, 100) ?? r.detail?.label ?? '' })));
    return { active, count: rows.length, version: 'P2.11d.3f.0' };
  },
});
