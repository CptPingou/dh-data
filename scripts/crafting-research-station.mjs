const MODULE_ID = "daggerheart-campaign-toolkit";

function esc(value) {
  return String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
function materialData(entry) { return entry?.itemRef?.snapshot?.flags?.[MODULE_ID]?.material ?? null; }
function isResearchContainer(container) {
  if (!container) return false;
  const id = String(container.containerId ?? "").toLowerCase();
  const role = String(container.presentation?.playerRole ?? "").toLowerCase();
  return ["fob", "caravan"].includes(id) || ["fob", "caravan"].includes(role);
}
export function isEligibleResearchActor(actor, user = game.user) {
  return Boolean(
    actor?.documentName === "Actor" &&
    actor?.type === "character" &&
    actor.testUserPermission?.(user, "OWNER") === true
  );
}

export function listOwnedResearchActors(user = game.user) {
  return [...(game.actors ?? [])].filter((actor) => isEligibleResearchActor(actor, user));
}

export async function buildResearchStationModel({ api, actor, expeditionId, containerId = "fob" } = {}) {
  if (!api?.expeditionManifest?.load || !api?.craftingMaterials?.get || !api?.craftingKnowledge) return { green:false, reason:"research-station-api-unavailable" };
  if (!actor?.uuid) return { green:false, reason:"research-actor-required" };
  const manifest = await api.expeditionManifest.load(expeditionId);
  if (!manifest) return { green:false, reason:"expedition-not-found" };
  const container = manifest.containers?.find((c) => c.containerId === containerId) ?? null;
  if (!container) return { green:false, reason:"research-container-not-found" };
  if (!isResearchContainer(container)) return { green:false, reason:"research-container-not-supported" };

  const byMaterial = new Map();
  for (const entry of container.contents ?? []) {
    const data = materialData(entry);
    const materialId = data?.materialId ?? entry?.itemRef?.sourceId ?? null;
    const quantity = Number(entry?.quantity) || 0;
    if (!materialId || quantity <= 0 || ["consumed","deleted"].includes(entry?.itemRef?.lifecycle?.state)) continue;
    byMaterial.set(materialId, (byMaterial.get(materialId) ?? 0) + quantity);
  }

  const materials = [];
  for (const [materialId, quantity] of byMaterial) {
    const definition = await api.craftingMaterials.get(materialId);
    if (!definition?.research?.discoverable) continue;
    const personal = api.craftingKnowledge.personal(actor, materialId) ?? {};
    const documented = api.craftingKnowledge.documented(materialId) ?? {};
    const rawProperties = definition.material?.properties ?? {};
    const propertyIds = Array.isArray(rawProperties) ? rawProperties : Object.keys(rawProperties);
    const properties = [];
    for (let index = 0; index < propertyIds.length; index += 1) {
      const propertyId = propertyIds[index];
      const isPersonal = Boolean(personal[propertyId]);
      const isDocumented = Boolean(documented[propertyId]);
      const propertyDefinition = await api.craftingMaterials.property?.(propertyId);
      const knownLabel = propertyDefinition?.label ?? propertyId;
      properties.push({
        propertyId,
        value: Array.isArray(rawProperties) ? 1 : Number(rawProperties[propertyId]) || 0,
        label: isPersonal || isDocumented ? knownLabel : `Propriété inconnue ${index + 1}`,
        personal: isPersonal,
        documented: isDocumented,
        action: isPersonal && !isDocumented ? "document" : (!isPersonal && !isDocumented ? "research" : null),
      });
    }
    materials.push({ materialId, name: definition.name ?? materialId, quantity, properties });
  }
  materials.sort((a,b) => a.name.localeCompare(b.name, game.i18n?.lang ?? "fr"));
  return { green:true, expeditionId, containerId, actorUuid:actor.uuid, materials };
}

function content(model, actors, actorId) {
  const options = actors.map((a) => `<option value="${esc(a.id)}" ${a.id === actorId ? "selected" : ""}>${esc(a.name)}</option>`).join("");
  const rows = model.materials.map((material) => `
    <section class="dct-research-material" style="border:1px solid var(--color-border-light-2);border-radius:6px;padding:.65rem;margin:.5rem 0">
      <header style="display:flex;justify-content:space-between;gap:1rem"><strong>${esc(material.name)}</strong><span>×${esc(material.quantity)}</span></header>
      <div>${material.properties.map((p) => `
        <div style="display:grid;grid-template-columns:1fr auto;gap:.6rem;align-items:center;padding:.4rem 0;border-top:1px solid var(--color-border-light-2)">
          <span>${esc(p.label)}${p.documented ? " · documentée" : p.personal ? " · découverte" : ""}</span>
          ${p.action ? `<button type="button" data-dct-research-action="${esc(p.action)}" data-material-id="${esc(material.materialId)}" data-property-id="${esc(p.propertyId)}">${p.action === "research" ? "Rechercher" : "Documenter"}</button>` : ""}
        </div>`).join("")}</div>
    </section>`).join("");
  return `<div class="dct-research-station">
    <p><label><strong>Chercheur :</strong> <select data-dct-research-actor>${options}</select></label></p>
    <p style="opacity:.75">Les recherches utilisent les spécimens présents à la FOB ou dans la Caravane sans les consommer. Une découverte personnelle peut ensuite être documentée pour le groupe.</p>
    <div data-dct-research-materials>${rows || "<p>Aucun matériau recherchable à la FOB.</p>"}</div>
  </div>`;
}

export async function openCraftingResearchStation({ expeditionId, containerId = "fob", actor = null } = {}) {
  const api = game.modules.get(MODULE_ID)?.api;
  const actors = listOwnedResearchActors();
  const preferredActor = actor ?? game.user?.character ?? null;
  const selectedActor = isEligibleResearchActor(preferredActor) ? preferredActor : (actors[0] ?? null);
  if (!selectedActor) return { green:false, reason:"no-owned-research-actor" };
  const model = await buildResearchStationModel({ api, actor:selectedActor, expeditionId, containerId });
  if (!model.green) return model;
  const DialogV2 = foundry?.applications?.api?.DialogV2;
  if (!DialogV2) throw new Error("Campaign Toolkit | DialogV2 unavailable");
  const dialog = new DialogV2({ window:{ title:"Station de recherche" }, content:content(model, actors, selectedActor.id), buttons:[{action:"close",label:"Fermer",default:true}] });
  await dialog.render(true);
  const root = dialog.element;
  if (!root) return dialog;

  const refresh = async () => {
    const actorId = root.querySelector("[data-dct-research-actor]")?.value;
    const currentActor = actors.find((candidate) => candidate.id === actorId) ?? selectedActor;
    const next = await buildResearchStationModel({ api, actor:currentActor, expeditionId, containerId });
    const body = root.querySelector(".window-content");
    if (body && next.green) body.innerHTML = content(next, actors, currentActor.id);
  };

  root.addEventListener("change", async (event) => {
    if (event.target?.matches?.("[data-dct-research-actor]")) await refresh();
  });
  root.addEventListener("click", async (event) => {
    const button = event.target.closest?.("[data-dct-research-action]");
    if (!button) return;
    const actorId = root.querySelector("[data-dct-research-actor]")?.value;
    const currentActor = actors.find((candidate) => candidate.id === actorId) ?? null;
    if (!currentActor) return;
    button.disabled = true;
    try {
      const result = await api.craftingResearchAuthority.request({
        actor: currentActor,
        operation: button.dataset.dctResearchAction,
        materialId: button.dataset.materialId,
        propertyId: button.dataset.propertyId,
        expeditionId,
        containerId,
      });
      if (!result?.green) ui.notifications?.warn(`Station de recherche : ${result?.reason ?? "opération refusée"}`);
      else ui.notifications?.info(button.dataset.dctResearchAction === "research" ? "Propriété découverte." : "Propriété documentée pour le groupe.");
      await refresh();
    } catch (error) {
      console.error(`${MODULE_ID} | research station action failed`, error);
      ui.notifications?.error(`Station de recherche : ${error.message}`);
    } finally { if (button.isConnected) button.disabled = false; }
  });
  return dialog;
}

export const craftingResearchStationApi = Object.freeze({ buildModel:buildResearchStationModel, open:openCraftingResearchStation });
