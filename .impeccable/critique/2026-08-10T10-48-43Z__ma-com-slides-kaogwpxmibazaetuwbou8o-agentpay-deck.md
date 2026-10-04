---
target: AgentPay Arc Figma pitch deck
total_score: 29
p0_count: 0
p1_count: 2
timestamp: 2026-08-10T10-48-43Z
slug: ma-com-slides-kaogwpxmibazaetuwbou8o-agentpay-deck
---
## Design Health Score

Scores are adapted to the presentation-viewing experience rather than an interactive product UI.

| # | Heuristic | Score | Key Issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 3 | Slide numbers and proof caveats are visible, but the deck has no agenda or section progress. |
| 2 | Match System / Real World | 3 | Claims are precise, but MCP, OAuth 2.1, PKCE, and reconciliation assume technical fluency. |
| 3 | User Control and Freedom | 2 | Links exist, but there is no modular appendix route for skipping or deep-diving by audience. |
| 4 | Consistency and Standards | 4 | Grid, palette, typography, numbering, and diagram language are cohesive. |
| 5 | Error Prevention | 4 | The deck is unusually disciplined about local versus hosted scope and avoids unsupported proof claims. |
| 6 | Recognition Rather Than Recall | 3 | The narrative is sequential, but viewers must remember local/hosted distinctions across slides 7-9. |
| 7 | Flexibility and Efficiency | 2 | One linear story serves judges better than investors; no audience-specific shortcut or appendix path. |
| 8 | Aesthetic and Minimalist Design | 3 | Clean and focused, but the repeated eyebrow/box system becomes formulaic and some slides are dense. |
| 9 | Error Recovery | 3 | Caveats are explicit, but missing proof is presented as a future gate rather than resolved evidence. |
| 10 | Help and Documentation | 2 | URLs are supplied, but there is no glossary, appendix, market source, or proof appendix. |
| **Total** |  | **29/40** | **Good foundation; major narrative and proof gaps remain.** |

## Anti-Patterns Verdict

**LLM assessment:** The deck does not look like raw AI output, but it still carries recognizable AI-template grammar: Inter everywhere, a tiny blue uppercase eyebrow on nearly every slide, repeated numbered cards, generous white space with one blue accent, and frequent caveat copy. Custom workflow diagrams and unusually precise claim boundaries keep it above generic-template quality.

**Deterministic scan:** The Impeccable detector found three signals in the local HTML artifact that shares the deck's visual system:

- `overused-font`: Inter at `pitch-deck-20260810-agentpay-arc.html:9`.
- `em-dash-overuse`: seven em dashes in body copy.
- `numbered-section-markers`: sequence `01` through `06`.

Inter is inherited from the selected Figma template, so this is a distinctiveness warning rather than a usability defect. Numbering is semantically justified on the payment workflow, but its repetition across unrelated content adds to the template feel. The local HTML is an earlier artifact, so content-only findings were checked against the current Figma visuals before inclusion.

**Visual overlays:** Mutable injection in a fresh Edge tab succeeded, but `http://localhost:8400/detect.js` failed to load inside the HTTPS Figma application. No reliable user-visible overlay was produced. Independent screenshots of slides 1, 6, 9, 14, and 15 plus a full 15-slide screenshot pass were used as the fallback signal.

## Overall Impression

This is a disciplined technical hackathon deck with a coherent visual system and a clear safety thesis. Its single biggest opportunity is to replace conditional proof language with one undeniable visual proof moment, then add the missing investor story. Right now it explains how AgentPay works better than why it becomes a business.

## What's Working

1. **Clear product spine.** Slides 2-5 move cleanly from the missing economic loop to budget, choice, proof, and the complete payment workflow.
2. **Credible claim discipline.** Slides 7-9 explicitly separate local breadth, hosted scope, and verified proof. This is rare and increases trust with technical judges.
3. **Strong recurring visual language.** Blue, black, white, thin rules, and modular diagrams are consistent. Slides 5, 7, 12, and 15 are especially presentation-ready.

## Priority Issues

### [P1] The deck's core proof is still a placeholder or future gate

**Why it matters:** Slide 6 says `REAL WALLET SCREENSHOT REQUIRED`; slide 9 says readiness was not green; slide 13 places the hosted receipt in the future. Judges and investors are therefore asked to trust the promise at the exact moment the deck should remove doubt.

**Fix:** Replace slide 6 with the real funded-wallet state. Add one hero proof slide showing the exact hosted journey, transaction hash, Arcscan receipt, and release result. Move operational caveats to speaker notes or an appendix after the evidence is visible.

**Suggested command:** `$impeccable harden`

### [P1] The investor narrative is missing

**Why it matters:** The deck explains architecture and scope but does not answer market, buyer/user, business model, competitive alternatives, go-to-market, traction, or the ask. A technical judge can score the build; an investor cannot underwrite the opportunity.

**Fix:** Add a compact investor layer: target wedge and pain, why now/market evidence, business model and distribution, competitive differentiation, and a specific ask. Compress two technical scope slides or move detailed tool lists to an appendix to keep the main deck short.

**Suggested command:** `$impeccable shape`

### [P2] Critical text is too small for a live room

**Why it matters:** Slides 6-9, 11, and 14 rely on tiny monospace labels, hashes, caveats, or six achievement rows. These are readable in the editor but will disappear on a projector and force the presenter to narrate what the audience cannot verify.

**Fix:** Use a presentation-distance floor, cut secondary copy, enlarge the one evidence string that matters, and move full hashes/tool lists/remaining achievements to an appendix. On slide 14, show the top three achievements and summarize the rest.

**Suggested command:** `$impeccable typeset`

### [P2] Repeated template grammar weakens memorability

**Why it matters:** The same tiny uppercase eyebrow, Inter typography, numbered blocks, and white-background structure recur so often that the deck feels assembled from one template system rather than art-directed around AgentPay's distinctive payment loop.

**Fix:** Keep the blue/black identity but create two or three deliberate visual peaks: a full-bleed proof/receipt moment, a darker trust-boundary slide, and a stronger product/demo screenshot. Remove eyebrows where the title already supplies context.

**Suggested command:** `$impeccable bolder`

### [P2] The team slide mixes visual credibility levels

**Why it matters:** Zaky's real event photograph and Ghoza's stylized avatar feel like different evidence standards. The dense achievement panel also competes with the founders rather than supporting them.

**Fix:** Use two real portraits with matched crop/treatment, or two deliberately illustrated portraits. Reduce achievements to the three strongest proof points and connect each founder to the capability they bring.

**Suggested command:** `$impeccable polish`

## Persona Red Flags

### Arc Hackathon Judge

- Reaches slide 6 expecting product evidence and sees a requirement placeholder.
- Understands the honest local/hosted distinction but still lacks one judge-visible end-to-end receipt.
- May interpret slides 9 and 13 as an unfinished submission rather than disciplined scope control.

### Investor

- Understands the technical mechanism but cannot identify the initial buyer, revenue model, distribution path, market size, or competitive moat.
- Sees product breadth metrics (`31`, `5`, `19`) that are not traction metrics and receives no commercial replacement.
- Leaves with architecture confidence but limited conviction about venture scale.

### First-Time Agent-Economy Viewer

- Encounters MCP, OAuth 2.1, PKCE, Arc, Agent Wallet, and receipt reconciliation without a plain-language primer.
- Must retain the local-versus-hosted distinction across several slides.
- Can follow the diagrams, but may not understand why this beats a conventional wallet approval flow.

## Minor Observations

- Slide 7's split black/white composition is one of the strongest visual breaks; use that level of contrast more than once.
- Slide 12 is a strong thesis slide but repeats content already introduced on slide 4; it may work better earlier as the product reveal.
- Slide 15 ends on a strong four-word cadence, but the conditional demo-standard footer weakens the peak-end effect.
- The heavy use of em dashes can be replaced with shorter sentences to sound more rehearsed and less generated.

## Questions to Consider

- What is the single screenshot or receipt that would make a skeptical judge stop questioning whether the workflow is real?
- If an investor remembers only one commercial wedge, what should it be: paid APIs, agent jobs, or programmable treasury workflows?
- Which technical slides belong in the main narrative, and which should become evidence appendix slides?
