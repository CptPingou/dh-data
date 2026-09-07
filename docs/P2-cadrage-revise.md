# P2 — Cadrage révisé

## Statut

Ce document remplace le cadrage P2.0 précédent, jugé trop ambitieux et trop abstrait.

Le principe directeur est désormais :

> Utiliser au maximum Foundryborne et Foundry tels qu'ils existent, importer proprement les données, puis n'ajouter du code que pour les besoins concrets qui ne sont pas déjà couverts.

Aucun framework générique de primitives n'est requis à ce stade.

---

## 1. Un seul module Foundry

Le projet utilisera **un seul module Foundry** contenant plusieurs compendiums et les outils de campagne nécessaires.

Ce module pourra contenir :

- les compendiums de contenu ;
- les macros ;
- les automatisations ;
- les documents Foundry personnalisés ;
- les Journals ;
- les éventuels helpers et hooks nécessaires ;
- les extensions spécifiques ajoutées plus tard.

La séparation des corpus reste portée par les **compendiums, dossiers et métadonnées**, pas par une multiplication des modules.

Le module Foundry reste un **adapter** de `daggerheart-data` : la base neutre reste la source canonique des données.

---

## 2. Import natif Foundryborne en priorité

Tout contenu qui possède déjà un type adapté dans Foundryborne doit utiliser ce type.

Exemples attendus :

- Classes → Items Foundryborne
- Subclasses → Items Foundryborne
- Domains → structure native Foundryborne
- Domain Cards → Domain Cards Foundryborne
- Ancestries → Items Foundryborne
- Communities → Items Foundryborne
- Weapons → Weapons Foundryborne
- Armor → Armor Foundryborne
- Consumables → Consumables Foundryborne
- Loot / Items → types natifs correspondants
- Adversaries → Adversaries Foundryborne
- Environments → Environments Foundryborne
- Beastforms → Beastforms Foundryborne

Règle :

> Si Foundryborne possède déjà une catégorie satisfaisante, on ne crée pas de type parallèle.

---

## 3. Environments et Campaign Frames

### Environments

Les Environments restent des **Environments Foundryborne**.

Ils ne sont pas convertis en Journals sauf pour de la documentation complémentaire éventuelle.

### Campaign Frames / Campaign Settings

Chaque Campaign Frame devient **un JournalEntry**, organisé en plusieurs pages.

Exemple :

```text
JournalEntry: Witherwild
├── Présentation
├── Inciting Incident
├── Session Zero
├── Principes MJ
├── Factions
├── Distinctions
├── Règles de campagne
├── Environments liés
├── Adversaries liés
├── Tables / aides
└── Cartes / handouts
```

Les pages du Journal peuvent contenir des liens vers les Items, Environments, Adversaries, RollTables et autres documents Foundry réellement utilisés.

---

## 4. Armes évolutives

La première extension fonctionnelle prioritaire après l'import sera le système d'**armes évolutives**.

Une arme évolutive reste une vraie **Weapon Foundryborne**.

L'évolution est stockée sur le même objet.

Le système doit permettre :

- un nombre de points d'évolution attribué par le MJ ;
- des améliorations codées à l'avance ;
- un ensemble d'améliorations actuellement débloquées ;
- le choix des améliorations laissé au joueur ;
- la conservation de l'état d'évolution directement sur l'arme ;
- la possibilité pour le MJ de modifier les possibilités disponibles en fonction du récit.

Le modèle d'inspiration est celui des armes évolutives de **Motherboard**, adapté à Daggerheart / Foundryborne.

---

## 5. Progression narrative, pas progression de niveau

Les améliorations ne sont pas débloquées automatiquement par le niveau du personnage.

Le système distingue :

### Ce qui existe dans le module

Toutes les évolutions possibles sont codées à l'avance.

### Ce qui est connu / accessible en campagne

Le MJ choisit les possibilités actuellement débloquées selon la fiction :

- technologie découverte ;
- composant étudié ;
- monstre vaincu ;
- artisan rencontré ;
- artefact récupéré ;
- faction rejointe ;
- savoir retrouvé ;
- événement narratif.

### Ce que possède réellement le personnage

Le joueur dépense les points accordés par le MJ parmi les options actuellement accessibles.

La progression est donc :

```text
catalogue complet
      ↓
déblocage narratif MJ
      ↓
points disponibles
      ↓
choix du joueur
      ↓
état de l'arme
```

---

## 6. Domain Cards liées à une progression narrative

Même principe pour les **Domain Cards de Chasse**.

Ce sont de vraies **Domain Cards Foundryborne**, mais leur accessibilité ne dépend pas du niveau normal du personnage.

Le module doit donc pouvoir distinguer :

- niveau / tier mécanique éventuel de la carte ;
- disponibilité narrative ;
- déblocage par le MJ ;
- acquisition ou sélection par le joueur.

Le niveau narratif peut représenter par exemple :

- maîtrise d'une école de chasse ;
- découverte d'une technique ;
- étude d'un monstre ;
- accès à une technologie ;
- reconnaissance par une faction ;
- progression d'un arc de campagne.

Les cartes Chasse et les Augments d'armes suivent ainsi le même principe de progression :

> contenu pré-codé, déblocage narratif MJ, choix final PJ.

---

## 7. Un seul module pour les extensions

Les extensions futures restent dans le même module tant que cela reste raisonnable.

Pas de multiplication en :

- module Monster Hunter ;
- module armes évolutives ;
- module craft ;
- module factions ;
- etc.

On ne séparera un sous-système en module indépendant que si une contrainte concrète de maintenance, distribution ou compatibilité l'impose plus tard.

---

## 8. Extensions futures : ordre de priorité

Après l'import natif et les Campaign Frames :

```text
1. Armes évolutives
2. Domain Cards Chasse à progression narrative
3. Augments / upgrades
4. Harvest / craft
5. Transformations si le support Foundryborne est insuffisant
6. Boss multipart via intégration Colossus si nécessaire
7. Inventaire / logistique avancée
8. Autres règles de campagne seulement lorsqu'elles deviennent utiles
```

Aucune de ces extensions ne doit être développée avant qu'un besoin de jeu concret ne la justifie.

---

## 9. Règles de conception P2

1. **Réutiliser Foundryborne avant d'étendre Foundryborne.**
2. **Réutiliser Foundry avant de créer un document custom.**
3. **Réutiliser un module mature avant de recoder une fonction complexe.**
4. **Ne pas créer d'abstraction générique sans au moins un besoin réel.**
5. **La base `daggerheart-data` reste canonique.**
6. **Foundry contient une représentation dérivée et jouable des données.**
7. **Compendium-first** pour tout contenu distribuable.
8. **Un seul module**, organisé par compendiums et fonctionnalités.
9. **Progression narrative** séparée de la progression de niveau.
10. **Le MJ débloque ; le joueur choisit.**

---

## 10. Étape suivante

Avant tout développement d'extension, réaliser un mapping complet :

```text
DH-DATA
   ↓
type Foundryborne / Foundry
   ↓
import direct / Journal / extension nécessaire
```

Ce mapping doit permettre d'identifier précisément :

- ce qui est un simple import ;
- ce qui nécessite une conversion particulière ;
- ce qui nécessite un Journal ;
- ce qui nécessite réellement du code ;
- ce qui est déjà couvert par un module tiers existant.

Ce sera la véritable première étape opérationnelle de P2.
