# P2.12h.2d — ActionField originItem undefined normalization

Foundryborne may preserve `originItem.itemPath` / `originItem.actionIndex` as JavaScript `undefined` rather than omitting the keys. Treat source `null` as equivalent to omitted OR undefined only for these two fields.
