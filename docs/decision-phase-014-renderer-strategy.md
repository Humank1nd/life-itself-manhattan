# Decision — Phase 014 renderer strategy

**Ruled by the founder, 2026-10-28.** This record states the decision
and the evidence under it. It supersedes the LingBot-first framing of
the original Phase 014 plan.

## The decision

1. **Matrix-Game 4.0 is the primary research direction.** Its code is
   MIT-licensed and its model weights are Apache-2.0, subject to their
   applicable third-party notices. We investigate adapting its
   geometry-conditioned rendering approach for Manhattan.
2. **The immediate implementation priority is renderer-neutral
   capture.** We build our own pipeline producing RGB, depth,
   segmentation, and camera pose from Manhattan's authoritative
   geometry.
3. **LingBot is reference only.** Its research and documentation are
   preserved in this repo. LingBot code, weights, generated training
   data, and inference dependencies stay out of the commercial product
   unless the necessary rights are secured.
4. **We do not swap one dependency for another.** We should not
   replace a dependency on LingBot with a dependency on Matrix-Game.
   Our competitive advantage is our own persistent, historically
   grounded Manhattan world representation, spatial memory,
   simulation, and renderer-neutral interfaces. A model can help us
   develop the visual generation layer without becoming the owner of
   our architecture.
5. **Licenses get reviewed before commercial deployment.** The
   applicable licenses and third-party notices are reviewed before
   any commercial deployment of a neural renderer.

## License evidence (checked firsthand, 2026-10-28)

- Matrix-Game: code repo license is MIT (GitHub). The 4.0 weights on
  Hugging Face declare Apache-2.0 and ship a third-party notices
  file. VERIFIED.
- LingBot: a claim circulated in the Phase 014 planning that
  LingBot-World is licensed CC BY-NC-SA 4.0 and therefore
  incompatible with commercial use. Firsthand checks do NOT support
  that claim. The LingBot-World code repo declares Apache-2.0, and
  the base-cam and fast weights repos declare Apache-2.0 in their
  model cards. Two gaps remain open: the plain base weights repo
  carries no license tag, and the LICENSE file the cards link to is
  not present at the linked path. LingBot's licensing is therefore
  declared permissive but not airtight. The review in point 5 covers
  it, and the strategy above does not depend on how that review
  resolves. Note the distinction either way: a license restricts use
  of the licensed materials. It does not prohibit independently
  developing competing technology.

## What this changes

- Extraction 013, the LingBot conditioning packet, stays in the repo
  as reference material and is marked reference only. It is not a
  product dependency and its bridge is not on the product path.
- Phase 014's first engineering step is the renderer-neutral capture
  pipeline, not a model weights download.
- The world-model research note (research-world-models-2026-10.md)
  remains the survey of record. This decision is the strategy of
  record.
