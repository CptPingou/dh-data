# P2.10e.1 — Cycle d'expédition

Formalise le handoff d'autorité sans implémenter encore le transport Web :

- `prepared / web` → **Charger** → `in_session / foundry`
- `in_session / foundry` → **Retour** → `returned / web`

Les transitions :
- sont explicites et refusent un état source inattendu ;
- incrémentent `revision` ;
- valident puis sauvegardent le manifeste World ;
- exposent `api.expeditionLifecycle.status/start/returnToWeb`.

Deux macros sont ajoutées au pack existant :
- **Expédition — Charger**
- **Expédition — Retour**

Le Web import/export réel viendra ensuite : ici on fixe uniquement le protocole d'autorité et le workflow Foundry.
