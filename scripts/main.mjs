import {
  installToolkitCardPresentationBridge,
  toolkitCardPresentation,
  toolkitCardPresentationStatus,
} from "./toolkit-card-presentation.mjs";
import { localizeNativeEquipmentConfigLabels } from "./equipment-native-fr.mjs";
import { localizeNativeCharacterOptions, registerNativeCharacterOptionPresentation } from "./character-options-native-fr.mjs";
import { preferOwnedCharacterOptionPacks } from "./owned-character-options.mjs";
import { migrateOwnedContentFlags, globalContentOwnershipStatus } from "./content-ownership.mjs";
import { ownedHeritageRuntimeStatus } from "./owned-heritage-runtime.mjs";
import { ownedSrdBootstrapStatus } from "./owned-srd-bootstrap-status.mjs";
import { frenchSourceDebtAudit, frenchSourceDebtSummary } from "./source-fr-debt-audit.mjs";
import { autonomousSourceStatus, autonomousSourceDiff, autonomousSourceDiffSummary, syncAutonomousSources, rebuildAutonomousSources } from "./autonomous-source-loader.mjs";
import "./content-locale-settings.mjs";
import { importFullMapped as importFullMappedData, fullStatus } from "./full-import.mjs";
import { importCanonicalAdversary, importTetsucabra, tetsucabraStatus } from "./pilot-import.mjs";
import { registerHuntingStatusEffects, huntingEffectsApi } from "./hunting-effects.mjs";
import { createMonsterPartsApi } from "./monster-parts.mjs";
import { createMonsterHunterAdversaryApi } from "./monster-hunter-adversary-template.mjs";
import { expeditionManifestApi } from "./expedition-manifest.mjs";
import { createExpeditionFoundryItemsApi } from "./expedition-foundry-items.mjs";
import { expeditionWindowApi } from "./expedition-window.mjs";
import { registerExpeditionManifestPersistence, createExpeditionPersistenceApi } from "./expedition-persistence.mjs";
import { createExpeditionCommandsApi, expeditionMacroDefinitions } from "./expedition-commands.mjs";
import { createExpeditionLifecycleApi } from "./expedition-lifecycle.mjs";
import { importCampaignFrames, importCampaignFramePilot, campaignFrameStatus } from "./campaign-frame-import.mjs";
import { semanticAudit } from "./semantic-audit.mjs";
import { localizationAudit } from "./localization-audit.mjs";
import { weaponProgressionApi } from "./weapon-progression.mjs";
import { auditNativeDomainCardMechanics } from "./domain-card-native-mechanics-audit.mjs";
import { reconstructNativeDomainCardMechanics } from "./domain-card-native-mechanics-reconstruction.mjs";
import { engagementOpportunityApi } from "./engagement-opportunity.mjs";
import { createEngagementOpenerApi, registerEngagementOpenerChatHook } from "./engagement-opener.mjs";
import { createEngagementFinisherApi, registerEngagementFinisherChatHook } from "./engagement-finisher.mjs";
import { createEngagementSupportApi, registerEngagementSupportActionHook } from "./engagement-support.mjs";
import { createEngagementApi } from "./engagement.mjs";
import { registerEngagementStateSetting, engagementStateApi } from "./engagement-state.mjs";
import { MONSTER_HUNTER_ENGAGEMENT_CONTRACT, monsterHunterEngagementStatus } from "./monster-hunter-engagement-contract.mjs";
import {
  MONSTER_HUNTER_OPPORTUNITY_RULES,
  opportunityEffectCost,
  validateOpportunitySpend,
  resolveOpportunitySpend,
  monsterHunterOpportunityStatus,
} from "./monster-hunter-opportunity.mjs";
import {
  HUNT_CARD_ROLES,
  HUNT_CARD_MECHANIC_SCHEMA,
  defineHuntCardMechanic,
  validateHuntCardLoadout,
  huntCardMechanicStatus,
} from "./monster-hunter-hunt-card.mjs";
import { huntCardMechanicFromDocument, monsterHunterHuntCardCorpusStatus } from "./monster-hunter-hunt-card-corpus.mjs";
import {
  actorHuntCardLoadout,
  actorEngagementCapabilities,
  monsterHunterActorLoadoutStatus,
} from "./monster-hunter-actor-loadout.mjs";
import {
  registerToolkitCardFamily,
  toolkitCardFamilyDefinition,
  toolkitCardMetadata,
  isToolkitCard,
  actorToolkitCards,
  validateToolkitCardFamilyLoadout,
  importToolkitCard,
  removeToolkitCard,
  toolkitCardFamiliesStatus,
} from "./toolkit-card-families.mjs";
import { registerToolkitCardSheetIntegration, toolkitCardSheetApi } from "./toolkit-card-sheet.mjs";
import { huntingCardsApi } from "./hunting-cards.mjs";
import { registerHuntingDomain, registerContextualDomainCardBypass } from "./hunting-domain-card-bridge.mjs";
import { motherboardAugmentCatalogApi } from "./weapon-augment-catalog.mjs";
import { createWeaponAugmentStateApi } from "./weapon-augment-state.mjs";
import { registerWeaponAugmentSheetIntegration } from "./weapon-augment-sheet.mjs";
import {
  registerWeaponAugmentNativeFeatures,
} from "./weapon-augment-native.mjs";
import {
  exportAutonomousCoreSources,
  autonomousSourceExpectedCounts,
} from "./autonomous-source-export.mjs";

const MODULE_ID = "daggerheart-campaign-toolkit";
const SMOKE_MACRO_NAME = "Campaign Toolkit - Smoke Test";
const DATA_PACKS = [
  "dh-classes",
  "dh-subclasses",
  "dh-domain-cards",
  "dh-weapons",
  "dh-armor",
  "dh-adversaries",
  "dh-environments",
  "dh-campaign-frames",
];

async function importFullMapped() {
  const result = await importFullMappedData();
  const locale = game.settings.get(MODULE_ID, "contentLocale") ?? game.i18n?.lang ?? "en";

  // Rebuilding the owned compendiums invalidates the Compendium Browser cache.
  // Native ancestry/community documents must therefore receive their runtime
  // French overlay again before the browser is reopened.
  result.nativeCharacterOptions = await localizeNativeCharacterOptions(locale);
  return result;
}

function registerBloodDomain() {
  const domainConfig = CONFIG?.DH?.DOMAIN;
  if (!domainConfig?.domains) {
    console.error(`${MODULE_ID} | unable to register Blood domain: CONFIG.DH.DOMAIN.domains unavailable`);
    return false;
  }
  if (!domainConfig.domains.blood) {
    domainConfig.domains.blood = {
      id: "blood",
      label: "Blood",
      src: "icons/svg/blood.svg",
      description: "Blood domain (The Void v1.5 playtest).",
    };
  }
  console.log(`${MODULE_ID} | Blood domain registered`);
  return true;
}

// Register custom schema choices during module evaluation, before Foundry prepares
// persisted world documents. Registering this only from the init hook is too late:
// Item documents containing system.domain = "blood" may already be validated then.
const bloodDomainBootstrapped = registerBloodDomain();
const huntingDomainBootstrapped = registerHuntingDomain();
const huntingStatusEffectsBootstrapped = registerHuntingStatusEffects();
const monsterPartsApi = createMonsterPartsApi(huntingEffectsApi);
const monsterHunterAdversaryApi = createMonsterHunterAdversaryApi({ monsterPartsApi, importCanonicalAdversary });

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | init`);
  registerEngagementStateSetting();
  registerExpeditionManifestPersistence();
  if (!bloodDomainBootstrapped && !CONFIG?.DH?.DOMAIN?.domains?.blood) {
    registerBloodDomain();
  }
  if (!huntingDomainBootstrapped && !CONFIG?.DH?.DOMAIN?.domains?.hunting) {
    registerHuntingDomain();
  }
  registerContextualDomainCardBypass();

  const expeditionPersistenceApi = createExpeditionPersistenceApi({
    validate: expeditionManifestApi.validate,
    normalize: expeditionManifestApi.normalize,
  });

  const expeditionFoundryItemsApi = createExpeditionFoundryItemsApi({
    expeditionManifestApi,
  });

  const openExpeditionManifest = (manifest, selectedId = null) => expeditionWindowApi.open(manifest, {
    validate: expeditionManifestApi.validate,
    normalize: expeditionManifestApi.normalize,
    transfer: expeditionManifestApi.transfer,
    unloadToActor: expeditionFoundryItemsApi.unloadToActor,
    save: expeditionPersistenceApi.save,
    selectedId,
  });

  const expeditionLifecycleApi = createExpeditionLifecycleApi({
    persistenceApi: expeditionPersistenceApi,
    validate: expeditionManifestApi.validate,
  });

  const expeditionCommandsApi = createExpeditionCommandsApi({
    persistenceApi: expeditionPersistenceApi,
    lifecycleApi: expeditionLifecycleApi,
    openManifest: openExpeditionManifest,
  });

  game.modules.get(MODULE_ID).api = {
    version: "0.5.59",
    async smokeTest() {
      const systemOk = game.system?.id === "daggerheart";
      const packs = Object.fromEntries([
        ["toolkit-macros", Boolean(game.packs.get(`${MODULE_ID}.toolkit-macros`))],
        ...DATA_PACKS.map(id => [id, Boolean(game.packs.get(`${MODULE_ID}.${id}`))]),
      ]);
      const result = {
        module: MODULE_ID,
        system: game.system?.id ?? null,
        systemVersion: game.system?.version ?? null,
        foundryVersion: game.version ?? null,
        packs,
        systemOk,
      };
      console.table(result);
      const green = systemOk && Object.values(packs).every(Boolean);
      ui.notifications[green ? "info" : "warn"](`Campaign Toolkit : smoke test ${green ? "GREEN" : "incomplet - voir console"}`);
      return result;
    },
    importFullMapped,
    async localizeNativeCharacterOptions() {
      const locale = game.settings.get(MODULE_ID, "contentLocale") ?? game.i18n?.lang ?? "en";
      return localizeNativeCharacterOptions(locale);
    },
    fullStatus,
    importTetsucabra,
    tetsucabraStatus,
    huntingEffects: huntingEffectsApi,
    monsterParts: monsterPartsApi,
    monsterHunterAdversary: monsterHunterAdversaryApi,
    expeditionManifest: Object.freeze({
      ...expeditionManifestApi,
      save: expeditionPersistenceApi.save,
      load: expeditionPersistenceApi.load,
      list: expeditionPersistenceApi.list,
      remove: expeditionPersistenceApi.remove,
      open(manifest, { selectedId = null } = {}) {
        return openExpeditionManifest(manifest, selectedId);
      },
    }),
    expeditionItems: expeditionFoundryItemsApi,
    expeditionLifecycle: expeditionLifecycleApi,
    expeditionCommands: expeditionCommandsApi,
    expeditionWindow: expeditionWindowApi,
    importCampaignFrames,
    importCampaignFramePilot,
    campaignFrameStatus,
    semanticAudit,
    localizationAudit,
    preferOwnedCharacterOptionPacks,
    migrateOwnedContentFlags,
    globalContentOwnershipStatus,
    ownedHeritageRuntimeStatus,
    ownedSrdBootstrapStatus,
    frenchSourceDebtAudit,
    frenchSourceDebtSummary,
    autonomousSourceStatus,
    autonomousSourceDiff,
    autonomousSourceDiffSummary,
    syncAutonomousSources,
    rebuildAutonomousSources,
    exportAutonomousCoreSources,
    autonomousSourceExpectedCounts,
    auditNativeDomainCardMechanics,
    reconstructNativeDomainCardMechanics,
    engagementOpportunity: engagementOpportunityApi,
    engagementOpener: createEngagementOpenerApi(engagementOpportunityApi, engagementStateApi),
    engagementFinisher: createEngagementFinisherApi(engagementOpportunityApi, engagementStateApi),
    engagementSupport: createEngagementSupportApi(),
    engagementState: engagementStateApi,
    monsterHunterEngagement: Object.freeze({
      contract: MONSTER_HUNTER_ENGAGEMENT_CONTRACT,
      status: () => monsterHunterEngagementStatus(game.modules.get(MODULE_ID).api),
    }),
    monsterHunterOpportunity: Object.freeze({
      rules: MONSTER_HUNTER_OPPORTUNITY_RULES,
      effectCost: opportunityEffectCost,
      validate: validateOpportunitySpend,
      resolve: resolveOpportunitySpend,
      status: monsterHunterOpportunityStatus,
    }),
    monsterHunterHuntCard: Object.freeze({
      roles: HUNT_CARD_ROLES,
      schema: HUNT_CARD_MECHANIC_SCHEMA,
      define: defineHuntCardMechanic,
      validateLoadout: validateHuntCardLoadout,
      fromDocument: (document) => huntCardMechanicFromDocument(document, game.modules.get(MODULE_ID).api.monsterHunterHuntCard),
      corpusStatus: monsterHunterHuntCardCorpusStatus,
      status: huntCardMechanicStatus,
    }),
    monsterHunterActorLoadout: Object.freeze({
      inspect: actorHuntCardLoadout,
      capabilities: actorEngagementCapabilities,
      status: monsterHunterActorLoadoutStatus,
    }),
    toolkitCardFamilies: Object.freeze({
      register: registerToolkitCardFamily,
      definition: toolkitCardFamilyDefinition,
      metadata: toolkitCardMetadata,
      isToolkitCard,
      actorCards: actorToolkitCards,
      validateLoadout: validateToolkitCardFamilyLoadout,
      importCard: importToolkitCard,
      removeCard: removeToolkitCard,
      status: toolkitCardFamiliesStatus,
    }),
    toolkitCardSheet: toolkitCardSheetApi,
    huntingCards: huntingCardsApi,
    weaponProgression: weaponProgressionApi,
    weaponAugments: motherboardAugmentCatalogApi,
    weaponAugmentState: createWeaponAugmentStateApi(motherboardAugmentCatalogApi),
  };

  const toolkitApi = game.modules.get(MODULE_ID).api;
  toolkitApi.engagement = createEngagementApi({
    opportunity: toolkitApi.engagementOpportunity,
    opener: toolkitApi.engagementOpener,
    finisher: toolkitApi.engagementFinisher,
    support: toolkitApi.engagementSupport,
    state: toolkitApi.engagementState,
  });

  const huntingCardsBaseApi = toolkitApi.huntingCards;
  toolkitApi.huntingCards = Object.freeze({
    ...huntingCardsBaseApi,
    async installPrototypeActions(actor, sourceItem, sourceAction) {
      return huntingCardsBaseApi.installPrototypeActionsFrom(
        actor,
        sourceItem,
        sourceAction,
        {
          opener: toolkitApi.engagementOpener,
          finisher: toolkitApi.engagementFinisher,
        },
      );
    },
    async installSupportAction(actor) {
      return huntingCardsBaseApi.installSupportAction(
        actor,
        toolkitApi.engagementSupport,
      );
    },
  });

  registerEngagementOpenerChatHook(toolkitApi.engagementOpener);
  registerEngagementFinisherChatHook(toolkitApi.engagementFinisher);
  registerEngagementSupportActionHook(toolkitApi.engagementSupport, toolkitApi.engagementState);
  registerWeaponAugmentSheetIntegration();
  registerToolkitCardSheetIntegration();
});

Hooks.once("ready", async () => {
  console.log(`${MODULE_ID} | ready`);

  try {
    const nativeAugments = await registerWeaponAugmentNativeFeatures(
      motherboardAugmentCatalogApi,
    );
    console.info(`${MODULE_ID} | native Weapon Augments ready`, nativeAugments);
  } catch (error) {
    console.error(`${MODULE_ID} | unable to register native Weapon Augments`, error);
  }

  try {
    const ownershipMigration = await migrateOwnedContentFlags();
    console.info(`${MODULE_ID} | owned content flags ready`, ownershipMigration);
  } catch (error) {
    console.error(`${MODULE_ID} | unable to migrate owned content flags`, error);
  }

  try {
    const ownedOptions = await preferOwnedCharacterOptionPacks();
    console.info(`${MODULE_ID} | owned character option packs ready`, ownedOptions);
  } catch (error) {
    console.error(`${MODULE_ID} | unable to prefer owned character option packs`, error);
  }

  const locale = game.settings.get(MODULE_ID, "contentLocale") ?? "en";

  const nativeLabels = localizeNativeEquipmentConfigLabels(locale);
  if (nativeLabels) {
    console.info(`${MODULE_ID} | localized native equipment labels`, nativeLabels);
  }

  const presentationHooks = registerNativeCharacterOptionPresentation(locale);
  if (presentationHooks) {
    console.info(`${MODULE_ID} | native character option presentation hooks`, presentationHooks);
  }

  try {
    const characterOptions = await localizeNativeCharacterOptions(locale);
    console.info(`${MODULE_ID} | localized native character options`, characterOptions);
  } catch (error) {
    console.error(`${MODULE_ID} | unable to localize native character options`, error);
  }

  if (!game.user?.isGM) return;
  const pack = game.packs.get(`${MODULE_ID}.toolkit-macros`);
  if (!pack) return;
  try {
    const index = await pack.getIndex({ fields: ["name"] });
    const definitions = [
      {
        name: SMOKE_MACRO_NAME,
        command: `await game.modules.get("${MODULE_ID}").api.smokeTest();`,
        ownership: { default: 0 },
      },
      ...expeditionMacroDefinitions.map((definition) => ({
        ...definition,
        ownership: { default: 1 },
      })),
    ];
    const missing = definitions.filter((definition) => !index.some((entry) => entry.name === definition.name));

    if (missing.length) {
      await pack.configure({ locked: false });
      for (const definition of missing) {
        await Macro.create({
          name: definition.name,
          type: "script",
          scope: "global",
          command: definition.command,
          ownership: definition.ownership,
        }, { pack: pack.collection });
      }
      await pack.configure({ locked: true });
    }
  } catch (error) {
    console.error(`${MODULE_ID} | smoke macro seed failed`, error);
    try { await pack.configure({ locked: true }); } catch {}
  }
});


// P2.8n.1 — presentation-only virtual family label bridge.
Hooks.once("init", () => {
  installToolkitCardPresentationBridge();
});


Hooks.once("ready", () => {
  const module = game.modules.get("daggerheart-campaign-toolkit");
  if (!module?.api) return;
  module.api.toolkitCardPresentation = {
    inspect: toolkitCardPresentation,
    status: toolkitCardPresentationStatus,
  };
});

import "./item-backpack-menu.mjs";
