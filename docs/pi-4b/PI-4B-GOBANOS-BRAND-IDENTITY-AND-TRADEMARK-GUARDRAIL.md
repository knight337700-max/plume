# PI-4B Gobanos Brand Identity and Trademark Guardrail

Status: `FROZEN_FOR_PI_4C_REVIEW`

Scope: product UI identity and usage rules only. This is not a corporate print/packaging manual or legal clearance opinion.

## 1. Canonical Product Name

The official user-facing service name is **Gobanos**. Use exactly `Gobanos` in normal text, including page titles, browser-title specification, loading copy, accessible names, alt text, and product copy.

Do not use `GobanOS`, `GOBANOS`, or `gobanos` as ordinary product text. `GobanOS` is reserved for reproducing the supplied wordmark artwork.

## 2. Wordmark Artwork Casing

The official artwork visually renders **GobanOS**, with `OS` capitalized. The outlines and casing are intentional.

```yaml
brand_naming:
  canonical_text: Gobanos
  official_wordmark_artwork: GobanOS
  redraw_wordmark: false
  alter_letter_case_inside_artwork: false
```

Do not typeset a substitute, trace the outline, crop letters, change spacing, or regenerate the wordmark.

## 3. Public Identity vs Internal PLUME Codename

```yaml
identity_boundary:
  public_product_identity: Gobanos
  internal_technical_codename: PLUME_ALLOWED
  bulk_repository_rename: NOT_AUTHORIZED
```

Repository, package, module, test, environment, service, database, and infrastructure identifiers may remain PLUME. Do not rename `@plume/ui`, the GitHub repository, Railway services, or schema objects. Code-oriented documentation may say `Gobanos (product)` and `PLUME (internal technical system)` where distinction prevents ambiguity.

## 4. Provided Asset Inventory

Authoritative design-source assets are stored byte-for-byte under `docs/pi-4b/assets/brand/`:

| Asset            | Format          | Dimensions / viewBox | Role                             |
| ---------------- | --------------- | -------------------- | -------------------------------- |
| `GobanOS_bk.svg` | SVG, black fill | `0 0 7755 1514`      | Preferred Light-surface wordmark |
| `GobanOS_bk.png` | RGBA PNG        | `7755 × 1514`        | Light fallback/review/raster     |
| `GobanOS_wh.svg` | SVG, white fill | `0 0 7755 1514`      | Preferred Dark-surface wordmark  |
| `GobanOS_wh.png` | RGBA PNG        | `7755 × 1514`        | Dark fallback/review/raster      |

The package contains a horizontal wordmark only. It does not contain a favicon, square app icon, compact monogram, mobile icon, or collapsed-rail symbol.

## 5. Source Hashes

| Asset            |  Bytes | SHA-256                                                            |
| ---------------- | -----: | ------------------------------------------------------------------ |
| `GobanOS_bk.png` | 164372 | `93da12f1dee42403d23f70f1259a1fe03a992d2e9d291e84cad5764e44c1c2c0` |
| `GobanOS_bk.svg` |   2675 | `cf69998a32e3f8e78cf50fb3aadddd247204dd575ebfa2ea2a9ecce11b96e27a` |
| `GobanOS_wh.png` | 177221 | `a39321c151b27dc6df866472c3c3bc36173590b2270832d23215fd02d47b209e` |
| `GobanOS_wh.svg` |   2675 | `b576c72290fad843e7e32d432151bd78bcaad02fc6672bd5a2b6c2db4b454590` |

Any mismatch blocks use. Do not optimize, compress, rasterize, recolor, trace, normalize, or rewrite these files.

## 6. Light / Dark Logo Usage

```yaml
logo_theme_mapping:
  light_surfaces:
    default_logo: GobanOS_bk.svg
    fallback: GobanOS_bk.png
  dark_surfaces:
    default_logo: GobanOS_wh.svg
    fallback: GobanOS_wh.png
```

Use the asset matching the actual supporting surface, not merely the global theme label. If contrast is insufficient, adjust the surface; never recolor the artwork. Gobanos application branding remains separate from user-created ad content. Do not add the wordmark to an artboard, export, or Renderer output unless the user explicitly supplies it as a creative asset.

## 7. SVG / PNG Policy

SVG is the preferred runtime format wherever vector rendering is supported. PNG is limited to fallback, review, or raster-only environments. Do not use CSS `filter: invert(...)`, blend modes, opacity tricks, or color filters to create the opposite variant. Use the supplied black or white source.

Maintain the intrinsic aspect ratio `7755:1514` (approximately `5.122:1`). Never stretch independently by width and height.

## 8. Clear Space / Minimum UI Size

These are product-UI rules, not print trademark construction rules.

- Let `H` be the displayed wordmark height. Keep at least `0.5H` clear space on all sides, free of text, icons, dividers, and clipping.
- Preferred shell display height is 24–28 px, yielding approximately 123–143 px width.
- Minimum UI display height is 20 px, yielding approximately 103 px width. Below this, do not render the artwork.
- Loading/splash display may use 40–64 px height when the surface provides the same clear-space ratio.
- Never downscale until counters/letter spacing become indistinguishable at the target device-pixel ratio; PI-4C visual tests must confirm actual rendering.

## 9. Responsive Brand Usage

- Expanded/Standard shell: show the full wordmark when the brand region fits artwork plus clear space.
- Compact shell: reduce within the minimum-size rule, then hide the artwork before it collides or distorts.
- Collapsed navigation or small-screen menu: preserve a textual/programmatic `Gobanos` accessible name; do not crop the `G` or invent a symbol.
- Editor: identity may remain in shell/header but is subordinate to Canvas and may hide earlier than task controls.
- Theme changes select black/white sources; width changes do not alter casing or ratio.

## 10. Missing Compact Mark

```yaml
compact_brand_mark:
  provided: false
  fabricate_from_wordmark: false
  crop_G_from_wordmark: false
  create_G_icon: false
  followup: FUTURE_BRAND_ASSET_REQUIRED_COMPACT_MARK
```

This does not block PI-4B. It blocks final favicon and compact-brand-icon decisions only.

## 11. Accessibility Naming

- When the wordmark conveys identity, use accessible name/alt text `Gobanos`, not `GobanOS`.
- If adjacent visible text already names Gobanos, the duplicate image may be decorative with empty alt text.
- The SVG/PNG filename is never the accessible name.
- Theme source switching must not cause duplicate announcements or focus changes.
- Hidden compact artwork must leave the navigation landmark/menu trigger with a programmatic `Gobanos` name.

## 12. Trademark Status Guardrail

```yaml
trademark_status:
  product_name: Gobanos
  design_identity_approved_by_product_owner: true
  legal_clearance: PENDING_SEPARATE_VERIFICATION
```

PI-4B makes no claim of registration, exclusive ownership, worldwide clearance, or legal registrability. Trademark searching/classification and legal advice are outside this visual-design Gate.

## 13. Trademark Symbol Policy

```yaml
trademark_symbols:
  registered_symbol_R: DO_NOT_USE
  trademark_symbol_TM: DO_NOT_ADD_BY_DEFAULT
```

Do not add `®` or `™` to the supplied files, navigation, splash screen, browser title, UI copy, mocks, or exports without later authoritative evidence and direction.

## 14. Legal Clearance Follow-up

```yaml
legal_followup:
  id: GOBANOS_TRADEMARK_CLEARANCE
  required_before: PUBLIC_COMMERCIAL_BRAND_LAUNCH
  PI_4B_blocking: false
  PI_4C_internal_build_blocking: false
  owner: PRODUCT_LEGAL_BUSINESS
```

Do not guess Nice classes, designated goods/services, or legal status. Formal clearance must use authoritative business scope and qualified legal review.

## 15. PI-4C Runtime Branding Requirements

1. Replace user-facing PLUME identity with Gobanos.
2. Integrate the provided SVG wordmarks from an approved runtime asset location.
3. Use the black wordmark on Light surfaces.
4. Use the white wordmark on Dark surfaces.
5. Add System / Light / Dark theme selection.
6. Persist theme selection.
7. Respect OS `prefers-color-scheme` preference when System is selected.
8. Avoid theme flash on initial load where feasible.
9. Verify responsive transitions by actual browser-window resizing.
10. Preserve Renderer output independently of application theme.
11. Do not fabricate a compact Gobanos mark.
12. Preserve internal `@plume/ui` and PLUME technical naming unless separately authorized.

PI-4C must also verify wordmark clear space/minimum display size, accessible naming, theme contrast, no duplicate announcements, and no automatic branding of user creative output. Runtime implementation is not part of PI-4B.
