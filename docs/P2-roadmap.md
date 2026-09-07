# P2 — Roadmap Foundry

## Objectif

Construire **un seul module Foundry v14 pour Foundryborne Daggerheart** qui transforme `daggerheart-data` en contenu directement utilisable en partie, puis ajoute seulement les extensions réellement nécessaires à la campagne.

Le module regroupera :

- les compendiums de contenu ;
- les Journals de campagne ;
- les macros ;
- les automatisations ;
- les documents Foundry custom éventuellement nécessaires ;
- les extensions de gameplay retenues.

`daggerheart-data` reste la source canonique. Le module Foundry est une représentation dérivée.

---

# P2.1 — Mapping DH-DATA → Foundry

## P2.1.1 — Inventaire des types Foundryborne

Relever précisément les types, champs et relations disponibles dans la version Foundryborne utilisée.

Pour chaque famille DH-DATA :

```text
class
subclass
domain
domain_card
ancestry
community
transformation
beastform
weapon
armor
consumable
loot/item
adversary
environment
campaign_frame
campaign_mechanic
```

déterminer :

```text
type natif Foundryborne
type natif Foundry
Journal
extension nécessaire
non importé
```

### Stop condition

Une matrice complète `DH-DATA → Foundry` existe et aucun type n'est orienté par supposition.

---

## P2.1.2 — Audit des modules utiles

Faire un tour ciblé des modules Foundry v14 susceptibles d'éviter du développement.

Priorité aux besoins déjà identifiés :

- boss multipart ;
- inventaire / conteneurs / transferts ;
- tracks / countdowns ;
- triggers ;
- tables ;
- effets audiovisuels ;
- tags ;
- progression / upgrades.

Pour chaque module :

```text
fonction couverte
compatibilité Foundry v14
compatibilité Foundryborne
API/hooks disponibles
dépendance nécessaire ?
simple inspiration ?
```

Le but n'est pas de chercher un module pour chacune des 23 primitives P1.4.

Le but est uniquement d'éviter de reconstruire une fonctionnalité complexe déjà disponible et maintenue.

### Stop condition

Pour chaque extension P2 déjà envisagée, on sait si elle sera :

```text
native
adapter vers module existant
développement maison
```

---

# P2.2 — Squelette du module unique

Créer le module Foundry minimal.

Il doit pouvoir accueillir plusieurs compendiums sans encore implémenter les extensions de gameplay.

Structure indicative :

```text
module/
├── module.json
├── scripts/
├── styles/
├── packs/
├── templates/
└── assets/
```

Organisation logique des compendiums par famille/corpus, sans multiplier les modules Foundry.

Prévoir dès le départ une zone pour :

```text
macros
journals
rolltables
automations
custom documents éventuels
```

### Stop condition

Le module :

- s'installe ;
- s'active sous Foundry v14 ;
- reconnaît Foundryborne ;
- expose au moins un compendium de test ;
- n'altère aucun contenu du système.

**Point de commit recommandé.**

---

# P2.3 — Import du contenu natif

Importer progressivement ce que Foundryborne sait déjà représenter.

## P2.3.1 — Petit corpus pilote

Commencer avec quelques entités représentatives :

- 1 classe ;
- 1 subclass ;
- quelques Domain Cards ;
- 1 weapon ;
- 1 armor ;
- 1 adversary ;
- 1 environment.

Valider :

```text
création
affichage
champs mécaniques
actions
liens
compendium
drag & drop
utilisation sur fiche
```

### Stop condition

La chaîne :

```text
DH-DATA → adapter → compendium → Foundryborne
```

est validée sur chaque grande famille de document.

---

## P2.3.2 — Import SRD 2.0 complet

Importer les collections validées en P1 :

- classes ;
- subclasses ;
- ancestries ;
- communities ;
- domains ;
- Domain Cards ;
- weapons ;
- armor ;
- consumables ;
- loot/items ;
- beastforms ;
- adversaries ;
- environments ;
- transformations si Foundryborne possède une représentation satisfaisante.

Ne pas réinventer les contenus déjà fournis nativement par Foundryborne sans vérifier l'intérêt de les dupliquer.

### Stop condition

Chaque collection importée passe un contrôle :

```text
nombre source
=
nombre attendu dans les compendiums produits
```

et un échantillon est testé en jeu.

---

## P2.3.3 — Corpus complémentaires

Ajouter dans les compendiums appropriés :

- contenu privé Hope & Fear qui n'est pas déjà couvert ;
- Blood Hunter v1.5 ;
- futur homebrew ;
- Domain Cards Chasse lorsqu'elles seront prêtes.

Conserver dans les données importées les informations nécessaires de provenance/version/statut.

### Stop condition

Les corpus peuvent cohabiter sans collision ni écrasement.

**Point de commit recommandé.**

---

# P2.4 — Campaign Frames et contenu éditorial

## P2.4.1 — Journal pilote

Transformer un Campaign Frame en :

```text
1 JournalEntry
   └── plusieurs pages
```

Conserver la structure éditoriale du document source.

Tester les liens Foundry vers :

- Items ;
- Adversaries ;
- Environments ;
- RollTables ;
- autres Journals.

### Stop condition

Le Campaign Frame est réellement utilisable par le MJ depuis Foundry sans devoir revenir au JSON.

---

## P2.4.2 — Import des Campaign Frames

Importer les Campaign Frames disponibles.

Les cartes et aides restent des pages/handouts lorsque cela est pertinent.

Les règles de campagne ne sont pas automatiquement codées.

Une règle décrite dans un Journal reste une règle de Journal jusqu'à ce qu'un besoin d'automatisation concret apparaisse.

### Stop condition

Corpus de Campaign Frames navigable et correctement relié au contenu mécanique.

---

# P2.5 — Armes évolutives

Première vraie extension de gameplay.

## P2.5.1 — Modèle de données

Une arme évolutive reste une **Weapon Foundryborne**.

Ajouter uniquement les données nécessaires pour représenter :

```text
points accordés
points dépensés
upgrades connus
upgrades narrativement débloqués
upgrades choisis
conditions/prérequis
```

Toutes les évolutions peuvent exister dans le module sans être accessibles aux joueurs.

### Principe

```text
MJ débloque les possibilités
        ↓
MJ attribue les points
        ↓
PJ choisit ses upgrades
        ↓
la Weapon conserve son état
```

### Stop condition

Le modèle fonctionne sans créer une nouvelle Weapon à chaque évolution.

---

## P2.5.2 — Prototype Motherboard

Reproduire un petit arbre d'évolution représentatif du modèle Motherboard.

Pas encore tout le catalogue.

Tester :

- déblocage MJ ;
- attribution de points ;
- choix PJ ;
- retrait/changement contrôlé ;
- effet mécanique sur l'arme ;
- persistance ;
- affichage fiche.

### Stop condition

Une arme peut évoluer entièrement depuis Foundry.

---

## P2.5.3 — Catalogue d'Augments

Une fois le prototype validé, encoder le catalogue complet retenu.

Séparer :

```text
définition de l'augment
disponibilité narrative
sélection sur l'arme
```

### Stop condition

Les Augments ne nécessitent plus d'intervention manuelle sur les données de l'Item.

**Point de commit recommandé.**

---

# P2.6 — Domaine Chasse et progression narrative

## P2.6.1 — Domain Cards Chasse

Importer les cartes Chasse comme de vraies **Domain Cards Foundryborne**.

Ne pas lier leur accessibilité au niveau normal du personnage.

Ajouter la notion de disponibilité narrative.

Le MJ peut débloquer des cartes selon :

- monstre étudié ;
- technique découverte ;
- faction ;
- artisan ;
- technologie ;
- événement de campagne.

### Stop condition

Une carte peut exister dans le compendium tout en restant indisponible au PJ jusqu'à son déblocage narratif.

---

## P2.6.2 — Liaison armes / Chasse

Tester le modèle retenu pour les armes de chasse :

- Weapon Foundryborne ;
- Augments ;
- Domain Cards Chasse ;
- limite éventuelle de cartes liées/équipées sur l'arme.

Réutiliser les mécanismes natifs de Domain Cards dès qu'ils conviennent.

### Stop condition

Le système d'armes évolutives et le domaine Chasse fonctionnent ensemble sans créer un second système de cartes.

---

# P2.7 — Monster Hunter : boucle matérielle

Seulement après stabilisation des armes.

## P2.7.1 — Harvest

Brancher :

```text
Adversary
→ parties / résultats
→ matériaux
```

Commencer avec un seul monstre pilote, idéalement le Tetsucabra.

## P2.7.2 — Craft

Brancher :

```text
matériaux
→ recette
→ Augment / évolution
```

## P2.7.3 — Inventaire et logistique

Seulement à ce moment-là décider si :

- Foundryborne suffit ;
- un module tiers suffit ;
- notre système de slots/transferts doit être porté dans Foundry.

### Stop condition

Une chasse pilote permet réellement :

```text
combat → harvest → matériaux → craft → amélioration
```

**Point de commit recommandé.**

---

# P2.8 — Extensions de campagne à la demande

Ne pas développer ces systèmes par anticipation.

Candidats déjà identifiés :

- boss multipart / Colossus ;
- faction tracking ;
- countdowns ;
- transformations ;
- caravanes / FOB ;
- préparations ;
- feasts ;
- hex crawl / pointcrawl ;
- règles de repos ;
- autres Supplemental Campaign Mechanics.

Pour chacun :

```text
besoin réel ?
        ↓
Foundry/Foundryborne le fait ?
        ↓
module existant le fait ?
        ↓
sinon extension minimale
```

Aucune obligation de transformer toutes les primitives P1.4 en code.

---

# P2.9 — Stabilisation

Quand les fonctionnalités réellement utilisées par la campagne sont en place :

- audit des compendiums ;
- audit des UUID/liens ;
- audit des migrations ;
- test de mise à jour du module ;
- sauvegarde/restauration ;
- vérification des dépendances ;
- documentation MJ ;
- documentation homebrew ;
- nettoyage des prototypes.

### Stop condition

Une mise à jour du module peut être installée sans perdre :

- les choix d'Augments ;
- les déblocages narratifs ;
- les points attribués ;
- les données de campagne ;
- les liens vers les compendiums.

**Commit de stabilisation P2.**

---

# Ordre court

```text
P2.1  Mapping + audit modules
 ↓
P2.2  Module minimal
 ↓
P2.3  Import natif
 ↓
P2.4  Campaign Frames / Journals
 ↓
P2.5  Armes évolutives / Motherboard
 ↓
P2.6  Domaine Chasse
 ↓
P2.7  Harvest / Craft / logistique
 ↓
P2.8  Extensions uniquement à la demande
 ↓
P2.9  Stabilisation
```

## Doctrine

> Importer d'abord. Étendre ensuite. Automatiser uniquement ce qui sert réellement en partie.
