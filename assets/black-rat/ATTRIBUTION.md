# Black Rat — Third-party character asset

Title: Black Rat (Free download)
Creator: Nestaeric / Nestaericmaster
Canonical source: https://sketchfab.com/3d-models/black-rat-free-download-3db3acb4140d4de8bd62a171212bad9c
License: Creative Commons Attribution 4.0 International (CC BY 4.0)
License text: https://creativecommons.org/licenses/by/4.0/

The original model and textures are by Nestaeric, not by Life Itself / Humank1nd.

## Adaptations made for the game
- Converted the user-supplied FBX to glTF 2.0 using Blender 4.5.0,
  importing the 12 usable skeletal actions as named NLA tracks.
- Preserved the source's 2048×2048 texture images within the GLB
  instead of referencing missing converter placeholders.
- The original FBX has 12 animation actions; the shipped preview GLB retains
  three selected locomotion clips (idle, walk and run). No new animations authored.
  Constant rest-pose animation channels were pruned without discarding
  pose-changing channels.
- Runtime maps clip names to locomotion states and applies a fur alpha cutoff.
- The model is used only as visual presentation of LIM's simulation-owned rats.

The exported GLB includes the necessary supported PBR inputs.
The original FBX and unused individual texture files remain outside the repo.

Attribution must remain in the shipped game's Credits/About view, distribution
notices, and relevant asset inventories. Changes must be marked as adaptations.

Source archive SHA-256 (user-supplied black-rat-free-download.zip):
46ca775027a14920c4b47666d464fa699fc6b81316439a364411c4b7c95afb45
