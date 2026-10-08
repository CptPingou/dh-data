import fs from "node:fs";
import assert from "node:assert/strict";

const base = "data/research";

const load = (path) =>
  JSON.parse(fs.readFileSync(path, "utf8"));

const topicSchema = load(
  `${base}/schemas/research-topic.schema.json`
);

const revelationSchema = load(
  `${base}/schemas/research-revelation.schema.json`
);

const topics = load(
  `${base}/examples/research-topics.json`
);

const revelations = load(
  `${base}/examples/research-revelations.json`
);

assert.equal(topicSchema.entity, "researchTopic");
assert.equal(revelationSchema.entity, "researchRevelation");

assert(Array.isArray(topics));
assert(Array.isArray(revelations));

const unique = (items) => {
  const ids = items.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
};

unique(topics);
unique(revelations);

const nonempty = (v) =>
  typeof v === "string" && v.trim().length > 0;

const required = (item, schema) => {
  for (const field of schema.required) {
    assert(Object.hasOwn(item, field),
      `${item.id}: missing ${field}`);
  }
};

const enumCheck = (value, allowed) =>
  assert(allowed.includes(value), `Invalid value: ${value}`);

const topicIds = new Set(topics.map((t) => t.id));
const revelationIds = new Set(revelations.map((r) => r.id));

for (const topic of topics) {
  required(topic, topicSchema);
  assert.equal(topic.schemaVersion, 1);
  assert(nonempty(topic.id) && nonempty(topic.title));
  enumCheck(topic.category, topicSchema.categories);
  enumCheck(topic.status, topicSchema.statuses);
  enumCheck(topic.visibility, topicSchema.visibilities);

  assert(Array.isArray(topic.sources));
  assert(Array.isArray(topic.contributors));
  assert(Array.isArray(topic.revelations));
  assert(Array.isArray(topic.tags));

  for (const source of topic.sources) {
    assert(nonempty(source.type) && nonempty(source.ref));
  }

  for (const contributor of topic.contributors) {
    assert.equal(contributor.type, "actor");
    assert(nonempty(contributor.uuid));
  }

  assert(topic.progression &&
    typeof topic.progression === "object");
  enumCheck(
    topic.progression.mode,
    topicSchema.progressionModes
  );

  const { current, required: max } = topic.progression;
  assert(Number.isInteger(current) && current >= 0);
  assert(Number.isInteger(max) && max >= 1);
  assert(current <= max);

  for (const id of topic.revelations) {
    assert(revelationIds.has(id),
      `Unknown revelation: ${id}`);
  }

  for (const tag of topic.tags) assert(nonempty(tag));
}

for (const revelation of revelations) {
  required(revelation, revelationSchema);
  assert.equal(revelation.schemaVersion, 1);
  assert(nonempty(revelation.id));
  assert(nonempty(revelation.title));
  assert(topicIds.has(revelation.researchId));

  enumCheck(revelation.status, revelationSchema.statuses);

  assert(Array.isArray(revelation.grantedTags));
  assert(Array.isArray(revelation.unlocks));

  for (const tag of revelation.grantedTags) {
    assert(nonempty(tag));
  }

  for (const unlock of revelation.unlocks) {
    assert(nonempty(unlock.type) && nonempty(unlock.ref));
  }

  assert(typeof revelation.export?.enabled === "boolean");
  enumCheck(
    revelation.export.target,
    revelationSchema.exportTargets
  );

  assert.equal(
    revelation.export.enabled,
    revelation.export.target !== "none"
  );

  const owner = topics.find(
    (topic) => topic.id === revelation.researchId
  );
  assert(owner.revelations.includes(revelation.id),
    `Unlinked revelation: ${revelation.id}`);
}

console.log(
  `R4.3a VALIDATION GREEN: ${topics.length} topics, ` +
  `${revelations.length} revelations`
);