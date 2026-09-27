# Artificier + Artillery — extraction et préparation d'intégration

## Sources utilisées

- `Giovanni.pdf` : fiche de personnage contenant la classe Artificer, la sous-classe Armorer, les domaines Codex + Artillery et les mécaniques de classe.
- `artillery-daggerheart-homebrew-heart-of-daggers-subclass-cards-a4-3x3.pdf` : planche des 9 cartes Artillery niveaux 1 à 4.

Aucune mécanique absente de ces sources n'a été inventée.

## Correction explicite

La carte source `Battle Rhythem` est normalisée en anglais en `Battle Rhythm`.
La version française proposée est `Rythme de bataille`.

## Domaine Artillery

Corpus fourni :
- Niveau 1 : 3 cartes
- Niveau 2 : 2 cartes
- Niveau 3 : 2 cartes
- Niveau 4 : 2 cartes
- Total : 9 cartes

Aucune carte de niveaux 5 à 10 n'est présente dans les sources fournies.

## Artificier

Données supportées par la source :
- Domaines : Codex + Artillery
- Trait d'Incantation : Knowledge
- Évasion de départ observée : 10
- PV de départ observés : 5
- Hope Feature : Deus Ex Machina
- Class Features : Magical Tinkering, Artificer Infusions

### Gaps à résoudre avant automatisation

1. **Deus Ex Machina**
   La source dit que le construct « adds D12 » / « 2D12 », sans préciser à quel jet ou quelle valeur le dé s'ajoute.

2. **Artificer Infusions**
   La source annonce des bonus d'infusion mais ne fournit pas la liste des bonus.

3. **Ressource Artillery**
   `Battle Rhythm` et `Decisive Strike` font référence aux `Cob Rounds`, `charge tokens` ou ressources similaires.
   La fiche Artificier fournie ne définit pas cette ressource.

## Armorer

La seule feature de sous-classe présente est **Armorer Adept (Foundations)**.

Les paliers **Specialization** et **Mastery** ne sont pas fournis : ils sont donc laissés absents.

Deux ambiguïtés restent à régler :
- le `+1 per Tier` des infusions ne dit pas précisément quelle statistique est augmentée ;
- la phrase qui permet de marquer 1 Stress à la place d'un emplacement d'Armure ou pour ajouter 1d4 aux dégâts demande une clarification de timing.

## Fichiers

- `data/homebrew/artificer/domains/artillery/domain.json`
- `data/homebrew/artificer/domains/artillery/domain-cards.json`
- `data/homebrew/artificer/classes/artificer.json`
- `data/homebrew/artificer/subclasses/armorer.json`

Ces fichiers sont préparés comme **source canonique neutre**. Ils ne contiennent volontairement aucune Action/Active Effect Foundry inventée.


## Mise à jour — cartes de sous-classes Artificier

La planche de sous-classes fournit désormais deux voies :

### Armorer
- Foundation : Armorer Adept — complet
- Specialization : Arcane Armor — complet
- Mastery : Perfected Armor — **partiel**, la fin de la section Infiltrator est coupée sur la carte source

### Battle Smith
- Foundation : Arcane Jolt — complet, mais le déclencheur initial de l'aptitude n'est pas explicité sur la carte
- Specialization : Steel Defender — **partiel**, la fin de la carte sous `Repair` est coupée ; un intitulé `Reaction` est visible
- Mastery : Battle Smith Savant — complet

Aucune portion coupée n'a été reconstruite depuis D&D 5e ou une autre source : le JSON marque explicitement ces gaps.

Fichier ajouté :
- `data/homebrew/artificer/subclasses/battle-smith.json`

`armorer.json` a été complété avec Foundation + Specialization + la partie lisible de Mastery.


## Mise à jour v3 — gaps de sous-classe fermés

Les textes complets fournis permettent désormais de fermer :
- `Armorer / Perfected Armor / Infiltrator`
- `Battle Smith / Steel Defender`
- la feature `Improved Battle Smith`

Le Battle Smith dispose maintenant de son contrat complet de companion :
commande via Spellcast Roll, Hope + Experience, dégâts utilisant la Proficiency du PJ,
Stress comme endurance, retour après repos long, synchronisation du Stress de downtime,
huit options de montée de niveau, Deflect Attack et amélioration de Specialization.

## Conflit de source à arbitrer

Le PDF web de la classe Artificer affiche **Codex + MagiTech** comme domaines,
alors que la fiche `Giovanni.pdf` utilise **Codex + Artillery**.

Le paquet conserve pour l'instant `Codex + Artillery`, conformément à notre cible
d'intégration actuelle, mais ce point est marqué comme divergence de source et doit
être une décision de notre homebrew, pas une correction silencieuse.
