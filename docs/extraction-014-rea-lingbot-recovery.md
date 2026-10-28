# Extraction 014 — REA LingBot-World interoperability recovery

**Status:** Read-only reverse-engineering evidence plus an original Manhattan adapter correction. No checkpoints downloaded, no GPU inference, no model training, and no merge or production activation.

## REA inspection (actual toolkit invocation)

- **Tool:** [morluto/rea](https://github.com/morluto/rea), locally installed as `rea-agents 6.7.0` on Houston.
- **Authorised local target:** `life-itself-manhattan` application directory, existing source and compiled artifacts.
- **Command:**
  ```bash
  rea analyze-javascript-application /home/humank1nd/projects/life-itself-manhattan-lingbot-adapter-20261028 \
    --artifact-format directory \
    --source-path src/world-model-conditioning.js \
    --source-path src/spatial-memory-viewer.js \
    --source-path src/wireframe.js \
    --max-heap-mb 256 --analysis-timeout-ms 25000 --format json
  ```
- **REA Evidence ID (pre-correction):**
  `ev_1e0f63ad280bdb6a008448c1dbf8e44463d2589dd7c010844611ff71f41d1a68`.
- **Subject artifact SHA-256 (pre-correction):**
  `1f26c0fc7e86c938ccf7488642c88cb2b1891fd5e09918f0453917cb49190c72`.
- **Observed:** JavaScript application and semantic graphs were built and sealed successfully; 3 selected source modules, 57 other inventoried but *not* analyzed source files. Static return shape of `lingbotRequest` contained only: `prompt`, `init_image_hex`, `pose_cm`, `camera_path`, `seed`, `frames`, `photosensitivity_safe`. This is a *static inference*, not proof of actual model invocation.
- **REA WASM inspection:** Attempted `rea inspect-wasm-artifact pkg/twin_core_bg.wasm`. It correctly returned `capability_unavailable`: WABT 1.0.42 not configured via `REA_WABT_BIN_DIRECTORY`. No WABT or other software was installed. This does **not** invalidate existing Rust/WASM tests.
- **REA scope:** REA's JavaScript analyzer does not reverse engineer the Python diffusion model, unavailable safetensor weights, or proprietary training dataset. Upstream Python source was inspected directly and independently with file-hash evidence below.

## Direct LingBot source and wire-protocol recovery

| Component | Source SHA-256 | Recovered behavior |
|---|---|---|
| `wan/configs/wan_i2v_1_3B.py` | `d1d0c667334182532751ec39dbfee93cd8098a7a6e7cba7a43f15282d68b5edb` | Image-to-video model: 30-layer/12-head 1.3B DiT, T5 and VAE dependencies |
| `wan/image2video.py` | `de35a847fd00abdcf5235d437bf586517e46bfb21549a1a222339cae23b75c8f` | Loading sharded safetensors, text encoding, VAE encode/decode and diffusion scheduling |
| `backend/lingbot_world_bridge.py` | `6ffde85364414f1482dedb66ab40c1d7fba9e93fab4b5cba30909cf1d8516b95` | Camera Plücker ray conditioning and short camera-path generation |
| `backend/serve_worldmodel.py` | `5d3a823b9ae3d8862558f8adc5d57b7c1f3bb8163a3a5337b76037333e2420a6` | Local HTTP provider request handling and PNG-hex frame response |

The first two files come from Houston's installed `lingbot-world-v2` branch
`pilot/1.3b-8gb`, commit `a8930d2789559b298a617faf149a4d5ae20c1ac9`.
The latter two are local Dream Caesar source files on Houston; their repository
commit provenance was not independently checked here. Never present these local
source hashes as hashes of the missing trained weights.

### Verified conceptual execution path

```
2005 licensed Times Square photo + dated spatial source memory
      |
Source hash/license/temporal gate (Manhattan authority)
      |
Text prompt + resized original image + synthetic camera path
      |
Dream Caesar loopback /v1/viewport/generate
      |
T5 text encoder + VAE image latents + causal DiT,
camera-path/Plücker input + diffusion scheduler
      |
VAE video decoding, photosensitivity-softening option
      |
PNG-hex keyframe array + provider-side persisted keyframe directory
      |
Generated/unverified output, NEVER historical ground truth
```

**Not supported in the recovered bridge:** direct 6,623 plane memory input,
dated building-version graph tensors, verified visual correspondence or a
commercially permitted trained Manhattan checkpoint.

### Important contract bug found and fixed

Before this audit, `src/world-model-conditioning.js` treated `reply.frames`
as a list of generated frames. However, the inspected Python server actually
returns:

```json
{
  "status": "WORLDMODEL_FRAMES_RETURNED",
  "frames_hex_png": ["89504e470d0a1a0a..."],
  "photosensitivity_safe": true,
  "peak_interframe_delta": 0.2,
  "chunk_dir": "<server-side output directory>"
}
```

The revised provider adapter checks for the **actual `frames_hex_png` array**,
basic PNG signature/hex format, nonempty bounded frame count and successful
status. It now refuses to count stale/malformed mock data as successful
generation. It does not put returned image bytes in source evidence, embed
them in git or claim the output is geographically/historically correct.
Tests verify actual-shape mock acceptance and fake legacy-shape rejection.

This is a source-informed interface correction, **not** a real inference test.

## Verified checkpoint, license and resource constraints

Official Hugging Face `robbyant/lingbot-world-v2-1.3b-causal-fast` repo at
SHA `7e36a5f919f86cb4255cc9bfc30adb44963fbde1` advertises six weight
shards plus index; its repository totals **6,841,668,134 bytes**.
Shared T5 (~10.58 GiB), VAE (~0.47 GiB) and tokenizer files are provided
with 14B assets or compatible Wan assets. The installed loader explicitly
requires them when absent from the 1.3B directory.

Houston at inspection:
- Root filesystem: 468 GB nominal, **~91–92 MiB available, effectively 100% used**.
- GPU: NVIDIA RTX 3080 Laptop, **8,192 MiB total VRAM**, approximately 7,781 MiB free.
- `flash_attn`: not importable; no installation performed.
- Service `127.0.0.1:8013/health`: `degraded`, `weights_ready=false`.
- Original LingBot code license: **CC BY-NC-SA 4.0** (noncommercial use).
  Separate rights/contract review would be necessary for commercial DreamSuite.
- Official reference 1.3B inference uses multiple GPUs; Houston's
  single-8GB adaptation remains experimental and **unverified**.

The original `REA` library itself is MIT licensed; that **does not change**
the LingBot model's license or grant commercial rights to its weights,
training code or outputs.

### New fail-closed readiness gate

```bash
node scripts/check-lingbot-readiness.mjs
node scripts/test-lingbot-readiness.mjs
npm run test:lingbot
```

- Reports missing six shards/index, T5, VAE and tokenizer; GPU memory, FlashAttention,
  local free space and license state.
- Requires a conservative **30 GiB safe-download headroom** before a prospective
  installation. This is an engineering safety margin, not an upstream requirement.
- Never downloads, deletes data, installs tools or starts inference.
- A synthetic complete-file fixture still reports `inferenceVerified=false`:
  presence of files cannot prove the model successfully loads.
- `commercialUse=true` fails under the currently verified noncommercial license.

## Next implementation decisions

**Blocked now:** disk capacity, missing shared assets, absent weights, real
single-GPU validation, commercial license review.

**Proposed:** preserve the proprietary/noncommercial checkpoint as an optional
experimental provider, and build a **provider-neutral, clean-room Manhattan
generation contract** from generic inputs (source image reference, camera path,
verified geographic memory references, output provenance). Evaluate a
commercially compatible model separately; do not copy protected code, weights
or marketing materials. Independently document the provider's actual image
bytes, frames, latency, VRAM, identity drift and archival error only when
inference is real and authorized.

**Explicit exclusions:** No bypass of license or model safety, no reconstruction
of missing learned tensors from a README, no invention of a trained NYC model,
no automatic disk cleanup, no production integration or Quest acceptance.

## Proposed coordination handoff

- **Origin:** Life Itself Manhattan 014 / world-model integration.
- **Receive:** DreamSuite 00 Mission Control, 02 Architecture, 06 Engineering & CI.
- **Objective:** Review REA-based interoperable contract and rights-safe provider
  replacement plan.
- **Verified evidence:** REA evidence ID and digest, inspected local source
  hashes, actual API response mismatch, tests, disk and GPU readiness.
- **Approved direction:** Manhattan source data authoritative; generative
  rendering optional; Times Square pilot.
- **Decisions open:** model/weight licensing, storage recovery on Houston,
  compute choice, feature acceptance thresholds.
- **Next action:** independent review, then founder selects model route and
  authorizes any billable or destructive action.
- **Acceptance:** compliant licenses, real generated frames, reproducible
  physical GPU/Quest measurements, independent source validation.
- **Handoff is a durable proposal only**, not proof of synchronization with
  other ChatGPT sections.
