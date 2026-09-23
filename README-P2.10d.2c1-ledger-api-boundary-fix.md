# P2.10d.2c.1

Correctifs :
- utilise le vrai nom public `expeditionManifestApi.appendLedger()`;
- ne détourne plus `toContainerId` pour un Actor externe ;
- ajoute `fromRef` / `toRef` au ledger pour les frontières Web/Foundry.

Un transfert sac → Actor produit donc :
`fromContainerId: "sac-pj-1"` et
`toRef: { kind: "foundry-actor", uuid: "Actor....", name: "..." }`.
