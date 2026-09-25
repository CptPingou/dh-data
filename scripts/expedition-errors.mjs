const FALLBACK_MESSAGE = "Le transfert n’a pas pu être effectué.";

export function expeditionErrorMessage(reason, {
  itemName = "cet objet",
  containerName = "le sac à dos",
  actorName = "le personnage",
} = {}) {
  const raw = String(reason ?? "").trim();
  const normalized = raw.toLowerCase();

  if (!raw) return FALLBACK_MESSAGE;

  if (
    normalized === "invalid-quantity" ||
    normalized.includes("quantity must be") ||
    normalized.includes("quantité")
  ) {
    return "La quantité doit être supérieure à 0.";
  }

  if (normalized === "quantity-exceeds-entry") {
    return "La quantité demandée dépasse la quantité disponible.";
  }

  if (
    normalized === "entry-not-found" ||
    normalized.startsWith("unknown entry ")
  ) {
    return `${itemName} n’est plus présent dans ${containerName}.`;
  }

  if (
    normalized === "container-holder-actor-not-found" ||
    normalized.includes("actor-not-found")
  ) {
    return `Impossible de retrouver ${actorName} lié à ${containerName}.`;
  }

  if (normalized === "foundry-item-not-resolved") {
    return `Impossible de reconstruire ${itemName} dans Foundry.`;
  }

  if (normalized === "actor-item-create-failed") {
    return `Foundry n’a pas pu ajouter ${itemName} à ${actorName}.`;
  }

  if (normalized === "manifest-remove-failed") {
    return `${itemName} a été conservé : le sac à dos n’a pas pu être mis à jour.`;
  }

  if (
    normalized.includes("est plein") ||
    normalized.includes("aucun emplacement libre") ||
    normalized.includes("no free slot") ||
    normalized.includes("capacity")
  ) {
    return `${containerName} est plein.`;
  }

  if (normalized.includes("déjà occupé") || normalized.includes("already occupied")) {
    return "Cet emplacement est déjà occupé.";
  }

  if (normalized === "same-slot") {
    return "L’objet est déjà dans cet emplacement.";
  }

  if (normalized === "same-container") {
    return "Le transfert cible le même conteneur.";
  }

  if (normalized.startsWith("unknown source container")) {
    return "Le conteneur source n’existe plus.";
  }

  if (normalized.startsWith("unknown destination container")) {
    return "Le conteneur de destination n’existe plus.";
  }

  // Reasons already written for humans are preserved.
  if (
    raw.includes(" ") &&
    !raw.includes("-") &&
    !raw.includes("_")
  ) {
    return raw;
  }

  return FALLBACK_MESSAGE;
}

export function withExpeditionUserMessage(result, context = {}) {
  if (!result || typeof result !== "object") return result;

  if (
    result.userMessage == null &&
    result.reason != null &&
    result.loaded !== true &&
    result.unloaded !== true &&
    result.acquired !== true &&
    result.changed !== true
  ) {
    result.userMessage = expeditionErrorMessage(result.reason, context);
  }

  return result;
}
