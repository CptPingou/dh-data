import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const cards = JSON.parse(await fs.readFile(new URL('../data/homebrew/monster-hunter/dh-domain-cards.json', import.meta.url), 'utf8'));
const hunt = cards.filter(card => card?.type === 'domainCard' && card?.system?.domain === 'hunt');
assert.equal(hunt.length, 18, 'expected 18 Hunt cards');

for (const card of hunt) {
  assert.equal(card.system.loadoutIgnore, true, `${card.name}: loadoutIgnore must be true`);
  const maxLoadoutChanges = (card.effects ?? []).flatMap(effect => effect?.system?.changes ?? [])
    .filter(change => change?.key === 'system.bonuses.maxLoadout');
  assert.equal(maxLoadoutChanges.length, 1, `${card.name}: must carry exactly one maxLoadout compensation`);
  assert.equal(maxLoadoutChanges[0].type, 'add', `${card.name}: maxLoadout effect type`);
  assert.equal(Number(maxLoadoutChanges[0].value), 1, `${card.name}: maxLoadout +1`);
  const effect = (card.effects ?? []).find(effect => (effect?.system?.changes ?? []).some(change => change?.key === 'system.bonuses.maxLoadout'));
  assert.equal(effect?.transfer, true, `${card.name}: compensation effect must transfer`);
}

const actor = {
  documentName: 'Actor',
  type: 'character',
  id: 'A1',
  uuid: 'Actor.A1',
  isOwner: true,
  items: [],
};
const artisan = hunt.find(card => card._id === 'MHARTISANT000001');
assert.ok(artisan, 'Artisant source missing');
actor.items.push(artisan);
globalThis.game = {
  user: { isGM: false },
  actors: { get: id => id === actor.id ? actor : null },
};
const launcher = await import('../scripts/artificer-workshop-launcher.mjs');
const message = {
  system: { item: artisan },
  speaker: { actor: actor.id },
};
const ctx = launcher.huntArtisanChatMessageContext(message, game.user);
assert.equal(ctx.green, true, 'Artisant chat message should expose workshop context');
assert.equal(ctx.actor, actor, 'chat context should resolve speaker actor');

const nonArtisanMessage = {
  system: { item: hunt.find(card => card._id !== 'MHARTISANT000001') },
  speaker: { actor: actor.id },
};
assert.equal(launcher.huntArtisanChatMessageContext(nonArtisanMessage, game.user).green, false, 'non-Artisant Hunt card must not expose workshop');

console.log('P2.12h.1e TESTS GREEN: all Hunt cards preserve free-loadout compensation; Artisant chat activation resolves an owned workshop context only.');
