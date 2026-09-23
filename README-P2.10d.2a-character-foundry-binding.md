# P2.10d.2a

Sépare l'identité portable et le binding local Foundry :

```js
holderRef: {
  kind: "character",
  id: "pj-1",
  foundryActorUuid: "Actor.Ald8tw3yt5TLle8N"
}
```

`id` reste validé par le manifeste. `foundryActorUuid` sert uniquement au bridge Foundry.
