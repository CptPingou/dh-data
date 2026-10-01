function sourceValueIsPreserved(runtime, source, path = "") {
  if (Array.isArray(source)) {
    if (!Array.isArray(runtime) || runtime.length !== source.length) return false;
    return source.every((value, index) => sourceValueIsPreserved(runtime[index], value, `${path}[${index}]`));
  }
  if (source !== null && typeof source === "object") {
    if (runtime === null && /(?:^|\.)damage\.resources\.[^.]+\.valueAlt$/.test(path)) return true;
    if (runtime === null || typeof runtime !== "object" || Array.isArray(runtime)) return false;
    return Object.entries(source).every(([key, value]) =>
      Object.prototype.hasOwnProperty.call(runtime, key) &&
      sourceValueIsPreserved(runtime[key], value, path ? `${path}.${key}` : key)
    );
  }
  return Object.is(runtime, source);
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }
assert(sourceValueIsPreserved(null, {formula:"1d6"}, "A.damage.resources.stress.valueAlt"), "valueAlt object->null should be accepted");
assert(!sourceValueIsPreserved(null, {formula:"1d6"}, "A.damage.resources.stress.value"), "non-valueAlt object->null must remain rejected");
assert(!sourceValueIsPreserved({x:2}, {x:1}, "A.damage.resources.stress.valueAlt"), "real nested divergence must remain rejected when runtime is object");
assert(sourceValueIsPreserved({x:1}, {x:1}, "A.other"), "equal objects should remain green");
console.log("P2.12h.1b TESTS GREEN: ActionField valueAlt object->null hydration is ignored only at damage.resources.*.valueAlt; real divergences remain detected.");
