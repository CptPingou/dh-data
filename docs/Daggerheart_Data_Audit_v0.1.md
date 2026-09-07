# Daggerheart Data — Audit & Architecture v0.1

Date: 2026-09-01

## 1. Objectif

Construire une base de données Daggerheart neutre, exploitable à la fois par :

- un module Foundryborne pour Foundry VTT ;
- le futur Hub web / CampaignOS ;
- les outils de préparation de rencontre, de craft et de homebrew ;
- les migrations de contenu playtest (notamment Blood Hunter).

La base de données ne doit pas être dépendante du format Foundry. Foundry devient un adapter.

---

## 2. Corpus audités

### Sources privées possédées

- `Daggerheart.pdf` — Core Rulebook numérique.
- `Daggerheart_HF.pdf` — *Daggerheart: Hope & Fear*.
- `Daggerheart-Homebrew-Kit-v1.0-July-31-2025.pdf`.
- `Bloodhunter-v1.5-The-Void.pdf` — Blood Hunter / Blood Domain, playtest The Void v1.5.

### Référence publique

- Daggerheart SRD v2.0 — publié le 25 août 2026.
- Foundryborne Daggerheart 2.7.2 — Foundry VTT v14.

---

## 3. Changement majeur : le SRD 2.0 absorbe Hope & Fear

La première hypothèse de travail était :

> SRD = Core public ; Hope & Fear = presque entièrement hors-SRD.

Cette hypothèse est désormais fausse.

Le changelog officiel du SRD v2.0 indique l'ajout de :

- toutes les mécaniques de Campaign Frames du Core et de Hope & Fear ;
- le domaine Dread ;
- les adversaires, environnements, ancestries, communities, loot et équipement de Hope & Fear ;
- les classes Assassin, Brawler, Warlock et Witch ;
- les transformations Demigod, Ghost, Reanimated, Shapeshifter, Vampire et Werewolf.

### Conséquence

Le futur module privé ne doit **pas** réimporter automatiquement tout Hope & Fear.

La priorité devient :

1. indexer le SRD 2.0 ;
2. comparer chaque entité des PDFs possédés au SRD ;
3. importer seulement :
   - les éléments réellement hors-SRD ;
   - les données privées utiles absentes du SRD ;
   - les playtests ;
   - les contenus homebrew.

---

## 4. Foundryborne actuel

Foundryborne 2.7.2 expose déjà les types / compendiums suivants :

### Items

- class
- subclass
- domainCard
- ancestry
- community
- weapon
- armor
- consumable
- loot
- beastform
- feature

### Actors

- adversary
- environment
- character
- npc
- companion
- party

### Compendiums SRD

- Classes
- Subclasses
- Domains
- Ancestries
- Communities
- Weapons
- Armors
- Consumables
- Loot
- Adversaries
- Environments
- Beastforms
- Journals
- Rolltables

### Conclusion technique

Foundryborne possède déjà pratiquement toutes les primitives nécessaires.

Notre travail doit donc porter principalement sur :

- la donnée ;
- la provenance ;
- le versionnement ;
- les mappings ;
- l'automatisation sélective.

---

## 5. Statut des corpus

| Corpus | Statut DB | Diff attendu vs SRD 2.0 | Usage |
|---|---|---|---|
| Core Rulebook | `published` | faible à modéré | contrôle / contenu privé complémentaire |
| Hope & Fear | `published` | désormais faible à modéré | contrôle + éventuels compléments |
| Homebrew Kit v1.0 | `design_reference` | n/a | règles de validation |
| Blood Hunter v1.5 | `playtest` | très élevé | contenu jouable et versionné |
| Monster Hunter | `homebrew` | total | extension campagne |

---

## 6. Blood Hunter v1.5 : priorité opérationnelle

Le playtest fournit une classe complète :

- Blood Hunter ;
- domaines : Blade & Blood ;
- Evasion de départ : 9 ;
- Hope Feature : Blood Maledict ;
- Class Features :
  - Crimson Rite ;
  - Grim Psychometry ;
- progression complète ;
- trois subclasses :
  - Order of the Ghost Slayer ;
  - Order of the Mutant ;
  - Order of the Lycan ;
- un domaine Blood complet avec cartes de niveau 1 à 10.

### Politique de version

Ne jamais écraser un playtest.

Exemple :

```yaml
source:
  corpus: the-void
  product: blood-hunter
  version: "1.5"
  status: playtest
```

Une future version devient une nouvelle source :

```yaml
source:
  corpus: the-void
  product: blood-hunter
  version: "1.6"
  status: playtest
```

ou :

```yaml
source:
  corpus: daggerheart
  product: blood-hunter
  version: "1.0"
  status: published
```

La migration du personnage peut alors être calculée par diff.

---

## 7. Homebrew Kit : rôle architectural

Le Homebrew Kit ne doit pas être importé comme contenu jouable.

Il doit servir de couche de validation / lint.

Principes directement exploitables :

- limiter la charge cognitive ;
- toute l'information nécessaire à un adversaire ou environnement doit être présente dans son stat block ;
- PC et adversaires sont volontairement asymétriques ;
- une arme est normalement limitée à une feature ;
- un domaine Core contient 21 cartes distinctes ;
- les secondaires sont conçues comme soutien au primaire ;
- les coûts, dégâts et portées suivent des benchmarks par tier.

### Futur usage

```text
data
  ↓
schema validation
  ↓
Daggerheart design lint
  ↓
Foundry adapter / Hub
```

---

## 8. Source de vérité proposée

```text
daggerheart-data/
├── schemas/
│   ├── entity.schema.json
│   ├── class.schema.json
│   ├── subclass.schema.json
│   ├── domain.schema.json
│   ├── domain-card.schema.json
│   ├── ancestry.schema.json
│   ├── community.schema.json
│   ├── transformation.schema.json
│   ├── beastform.schema.json
│   ├── weapon.schema.json
│   ├── armor.schema.json
│   ├── consumable.schema.json
│   ├── loot.schema.json
│   ├── adversary.schema.json
│   ├── environment.schema.json
│   └── campaign-frame.schema.json
│
├── data/
│   ├── srd-2.0/
│   ├── core-private/
│   ├── hope-fear-private/
│   ├── playtest/
│   │   └── blood-hunter-v1.5/
│   └── homebrew/
│       └── monster-hunter/
│
├── mappings/
│   └── foundryborne-2.7.x/
│
└── adapters/
    ├── foundryborne/
    └── hub/
```

---

## 9. Tronc commun des entités

```yaml
id: string
kind: string

identity:
  name: string
  slug: string

source:
  corpus: string
  product: string
  edition: string|null
  version: string|null
  status: srd|published|playtest|homebrew|design_reference

provenance:
  source_file: string|null
  page: integer|null
  srd_id: string|null
  foundry_uuid: string|null

availability:
  in_srd: boolean
  private_only: boolean
  deprecated: boolean

content:
  rules_text: string|null
  notes: string|null
```

Le texte propriétaire reste une donnée privée et ne doit pas être considéré comme redistribuable.

---

## 10. Domain Card — schéma cible

```yaml
kind: domain_card

rules:
  domain: blood
  level: 1
  card_type: spell
  recall_cost: 1

mechanics:
  costs: []
  rolls: []
  damage: []
  conditions: []
  resources: []
  usage_limit: null
```

Important : `content.rules_text` reste la source verbatim privée.

`mechanics` contient seulement la représentation structurée nécessaire aux outils.

---

## 11. Adversary — schéma cible

```yaml
kind: adversary

rules:
  tier: 2
  role: skulk
  difficulty: 14
  hp: 5
  stress: 4

thresholds:
  major: 9
  severe: 18

attack:
  modifier: 2
  name: Bite
  range: melee
  damage:
    dice: "2d8+3"
    type: physical

experiences: []

features:
  - id: ...
    category: passive|action|reaction|fear
```

Le Hub pourra ainsi filtrer, analyser et composer des rencontres sans dépendre de Foundry.

---

## 12. Environment — schéma cible

```yaml
kind: environment

rules:
  tier: 2
  type: traversal
  difficulty: 15

impulses: []

features:
  - id: ...
    category: passive|action|reaction|fear

potential_adversaries: []
```

Les liens vers les adversaires doivent être des IDs de base de données, pas des noms libres.

---

## 13. Foundry : principe d'adapter

Le module Foundry ne contient pas la logique métier centrale.

Il compile :

```text
daggerheart-data
      ↓
foundry adapter
      ↓
Foundry documents
```

Exemples :

- `domain_card` → `Item[type=domainCard]`
- `weapon` → `Item[type=weapon]`
- `armor` → `Item[type=armor]`
- `adversary` → `Actor[type=adversary]`
- `environment` → `Actor[type=environment]`
- `class` → `Item[type=class]`

Cela évite de devoir extraire plus tard la donnée hors de Foundry pour le Hub.

---

## 14. Stratégie de diff

Chaque entité reçoit une empreinte normalisée indépendante du texte de mise en page.

### Niveau 1 — identité

- kind
- name
- tier / level
- source

### Niveau 2 — mécanique structurée

Exemple arme :

- trait
- range
- die
- bonus
- damage type
- burden
- feature name

### Niveau 3 — texte

Comparaison normalisée du texte pour détecter :

- errata ;
- clarifications ;
- différences de rédaction ;
- version de playtest.

### États de diff

```text
IDENTICAL
SRD_ERRATA_NEWER
PRIVATE_EXTRA_TEXT
PRIVATE_MECHANIC
PLAYTEST_ONLY
HOMEBREW
CONFLICT
```

---

## 15. Core / Hope & Fear vs SRD 2.0 — audit initial

### Très probablement SRD désormais

- classes Core ;
- subclasses Core ;
- ancestries Core ;
- communities Core ;
- neuf domaines Core ;
- Dread ;
- quatre classes Hope & Fear ;
- ancestries Hope & Fear ;
- communities Hope & Fear ;
- transformations Hope & Fear ;
- armes / armures / items / consumables Hope & Fear ;
- adversaires Hope & Fear ;
- environnements Hope & Fear ;
- mécaniques des campaign frames Core + Hope & Fear.

### À auditer précisément

- texte narratif complet des campaign frames ;
- exemples et conseils de GM ;
- worldbuilding ;
- art / cartes / handouts ;
- certains éléments éditoriaux du Core ;
- tables de référence non reprises ;
- contenu de scénario ou lore non inclus au SRD.

Ces éléments ne sont pas nécessairement utiles comme Documents Foundry ; ils pourront être indexés séparément pour le Hub.

---

## 16. Implication pour le module privé

Le futur module ne devrait pas être :

> « Daggerheart Core + Hope & Fear copiés dans Foundry »

mais :

> « Extension personnelle autour du SRD/Foundryborne ».

Structure cible :

```text
Foundryborne SRD
│
├── contenu SRD officiel
│
└── module privé
    ├── Blood Hunter v1.5
    ├── éventuels éléments Core hors-SRD
    ├── éventuels éléments H&F hors-SRD
    └── Monster Hunter
```

---

## 17. Priorités de développement

### P0 — Blood Hunter v1.5

But : personnage jouable immédiatement.

À générer :

- class Blood Hunter ;
- 3 subclasses ;
- domain Blood ;
- cartes Blood ;
- features de classe ;
- métadonnées `playtest/v1.5`.

### P1 — index SRD 2.0

Construire l'index canonique des entités publiques.

### P2 — diff Core / H&F

Déterminer exactement ce qui est absent du SRD.

### P3 — adapter Foundryborne

Créer un générateur reproductible.

### P4 — Hub

Consommer directement `daggerheart-data`.

---

## 18. Décision proposée

La V0.1 issue des photos reste un prototype technique.

Elle ne doit pas être enrichie manuellement.

Le prochain vrai artefact de développement doit être :

```text
daggerheart-data/
```

avec :

1. schemas v0.1 ;
2. registry des sources ;
3. Blood Hunter v1.5 structuré ;
4. index SRD 2.0 ;
5. pipeline de diff.

Cette base deviendra le contrat partagé entre Foundry, CampaignOS/Hub et les extensions homebrew.
