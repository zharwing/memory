# Frontend V2 Baseline and Evidence Adoption

Status: bound implementation-first campaign baseline

Recorded: 2026-08-12

## Candidate identity

- Repository: `zharwing/memory`
- Branch: `feat/refactor-v1`
- Commit: `ba5ae3cc17c65594f9815487b8caa00cfc335a48`
- Upstream: none
- Dirty candidate identity: `dirty:sha256:750463e5439ddd803254585c7446a085bec7f3502c60caa35cf2f4ecb5dea5ad:bytes:5236`
- V2 plan fingerprint: `sha256:eda0fb8c752030ff392a84fc95a1990d986e78a9cfd0013e324bb9c8edbdcee1`
- V2 package-index fingerprint: `sha256:e50a4f2153a0a13dadb2ebd32873fedc2471292b053b56450151e47d02e1aab1`
- Starting-tree manifest: `sha256:1c9ef8cfc6ffcb9ce5033896f1bd327a3b2a70b233383c792267cd77e16f7514`
- Starting-tree archive: `sha256:2fa859f7f05f4937a22c24b2c15789eb2896f7b4c144615051138fe2144c9c5b`

The owner requires an implementation-first run: every remaining safe source
package is implemented continuously, then the complete candidate receives one
integrated validation, repair, and final-review cycle. No package boundary is a
reason to stop or run broad tests.

## Adopted V1 evidence

| Package | Adopted status | Result identity / evidence |
| --- | --- | --- |
| MEM-FE00 | accepted | `working-tree:ba5ae3cc17c65594f9815487b8caa00cfc335a48:before:sha256:8236404070e598cc4b4268d00cab9a56ddbfc96fd3f8ff0d738b9915be89d8ae:after:sha256:6f0a63cec11e595834b0851aa069aa8dea08ce1f41472d65252d2590bdb756c7:delta:3d3bf1bf4605f4b0f3e804beaf2a9bd5f78acccdf1378ee4c0efd8dc6e37ecce` |
| MEM-FE01 | accepted | `working-tree:ba5ae3cc17c65594f9815487b8caa00cfc335a48:before:sha256:88d1f3b2b040bf4f6bdc22c5c278f7635b7a1540233d3098075baa21b0ce8088:after:sha256:50371c3b0d60d2784d570b7e7e884fe889d9b2fc58fd50c828291a9f92a3a66c:delta:96db11888b2565b8729da756232afd036f7cfec313711db8ff8c12776e7d3083` |
| MEM-FE02 | accepted | `working-tree:ba5ae3cc17c65594f9815487b8caa00cfc335a48:before:sha256:eace5a70afd7164e05055b441cd549ca333c9163b9b5520d26a58ec25d3f4515:after:sha256:f7d7a1f8202ac6fc0eb40a8b5fb5bfad7d487e19d7bb56088c87dabc367797f7:delta:4ad6e68a465cafbc377623085e304b3776485635ac7f6cf92d36c11b968809cb` |
| MEM-FE03 | provisional implemented | `working-tree:ba5ae3cc17c65594f9815487b8caa00cfc335a48:before:sha256:7eef4f06187a0c4cdaec2ab12f96ae987e98762fb58ad73e1abb385b921c5466:after:sha256:f76f9ddb1483af49746892c076054f5bf30346a26c1b072ee1f11068c72136ef:delta:272158bb01240c506def05e906a259acff17464feb7b36c838089d0faec43042` |

The sealed V1 authority hashes at adoption are:

- blueprint: `b1afca35986b89929369488cded5b708e530a89d1fd782d3169352ff04497991`
- package index: `787a539708bd8bea8ee72c296405d100f380bde142a41d0ca960cbb4b9331ebc`
- state ledger: `31f1ff6383723a725f48e4bf1f95c0bf20edfc01f5785ae34ba2aa7cc9b3e78b`
- FE03 cumulative delta manifest: `877076ed3a7bec95c1e08be8e3e9ddd104aba748fcd6d75ddd78740ae5fd4384`
- FE03 postimage manifest: `f76f9ddb1483af49746892c076054f5bf30346a26c1b072ee1f11068c72136ef`
- FE03 reviewer handoff: `f2ac4c980af856ed9247cd74baae60503a96aad193758a49f14392fc6ce6e3f0`

## Repair obligations adopted by V2

MEM-FEV2-03R owns production stdio/HTTP MCP identity delivery, project-generation
effect identity, storage-atomic reconciliation, and safe journal maintenance.
MEM-FEV2-04 owns native desktop authority, Tauri ACL/CSP/runtime selection,
server-owned provider secrets, redirect/private-network egress enforcement, and
resource-bound trash/recovery intents. These are explicit requirements, not
accepted V1 behavior.

## Supersession map

After this baseline is accepted, the old ledger is preserved and mapped as:

- `MEM-FE03` -> `MEM-FEV2-03R`
- `MEM-FE04` -> `MEM-FEV2-04`
- `MEM-FE05` -> `MEM-FEV2-05`
- `MEM-FE06` -> `MEM-FEV2-06`
- `MEM-FE07` -> `MEM-FEV2-07`
- `MEM-FE08` -> `MEM-FEV2-08`
- `MEM-FE09` -> `MEM-FEV2-09`
- `MEM-FE10` -> `MEM-FEV2-10`
- `MEM-FE11` -> `MEM-FEV2-11`

V1 MEM-FE00 through MEM-FE02 remain accepted. Supersession never rewrites or
upgrades their history.

## Authority and safety

The V2 machine package index owns exact paths and dependencies. The campaign
does not authorize dependency installation, secrets/private Memory access, Git
staging or commits, push/merge, deployment, signing, credential rotation, or
destructive/external operations.
