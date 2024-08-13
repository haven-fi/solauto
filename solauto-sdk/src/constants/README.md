TODO: move this to main readme in root folder when that's ready

Instructions for supporting new token:

- add public key to tokenConstants.ts
- add price feed in pythConstants.ts for it
- create ATA for solauto fees wallet
- `pnpm update-solauto-lut`
- `pnpm test:ts:unit`