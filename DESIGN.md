# Design System Document: The Editorial Living Room
 
## 1. Overview & Creative North Star
 
**Creative North Star: The Digital Curator**
This design system rejects the clinical, "transactional" aesthetic of traditional real estate platforms. Instead, it adopts the persona of a high-end lifestyle magazine—warm, intentional, and deeply human. We move beyond a standard grid by utilizing asymmetric layouts, significant white space, and an editorial typographic hierarchy that guides the user through a narrative of "belonging" rather than just "listing."
 
The visual signature is defined by **Tonal Depth** rather than structural lines. We treat the screen as a tactile environment where elements are "placed" on a surface rather than "inserted" into a box. By leveraging overlapping imagery and a sophisticated layering of warm neutrals, we create an interface that feels like a curated home.
 
---
 
## 2. Colors: Earthy Sophistication
 
The palette is anchored in organic warmth. We move away from pure whites and harsh blacks in favor of creams and deep charcoals to reduce eye strain and increase the "cozy" brand perception.
 
### The "No-Line" Rule
**Explicit Instruction:** Designers are prohibited from using 1px solid borders to define sections. Layout boundaries must be achieved exclusively through background color shifts. For example, a `surface-container-low` section should sit against a `surface` background to create a soft, natural break. 
 
### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers—like fine paper stacked on a wooden desk.
- **Surface (`#fbf9f4`):** The foundational "canvas."
- **Surface Container Lowest (`#ffffff`):** Reserved for elevated cards or floating search bars.
- **Surface Container High (`#eae8e3`):** Use for "inset" sections like footers or secondary sidebars.
 
### The "Glass & Gradient" Rule
To add soul to the UI, use subtle linear gradients for CTAs. Transition from `primary` (`#9a4027`) to `primary_container` (`#b9583c`) at a 135-degree angle. For floating navigation or overlays, apply **Glassmorphism**: use a semi-transparent `surface` color with a `20px` backdrop blur to allow the photography to bleed through the interface.
 
---
 
## 3. Typography: Editorial Authority
 
We use a high-contrast typographic pairing to balance tradition with modernity.
 
- **Display & Headlines (`Newsreader`):** An elegant serif that communicates trust and heritage. Use `display-lg` for hero statements. To emphasize the human element, utilize *Italic* variants for secondary words in a headline (e.g., "Finding *Your* People").
- **Titles & Body (`Manrope`):** A clean, rhythmic sans-serif. It provides a contemporary counterpoint to the serif, ensuring high legibility for property details and user bios.
- **Labeling:** Use `label-md` in all-caps with `0.05em` letter spacing for small metadata (e.g., "LIVED-IN COMFORT") to create a sophisticated, "tagged" look.
 
---
 
## 4. Elevation & Depth
 
We eschew the "material" look of floating shadows for a more natural, ambient depth.
 
### The Layering Principle
Hierarchy is achieved by "stacking" the surface tokens. A `surface-container-lowest` card placed on a `surface-container-low` background creates a soft, natural lift.
 
### Ambient Shadows
Where floating elements (like the primary search bar) are required, use a "Ghost Shadow":
- **Blur:** 40px - 60px
- **Opacity:** 4% - 6%
- **Color:** A tinted charcoal derived from `on_surface` (`#1b1c19`), never a neutral grey.
 
### The "Ghost Border" Fallback
If a border is required for accessibility (e.g., input fields), use the `outline_variant` (`#dcc1b9`) at **20% opacity**. 100% opaque borders are strictly forbidden as they interrupt the visual flow.
 
---
 
## 5. Components
 
### Buttons
- **Primary:** `primary` background, `on_primary` text. Use `rounded-full` for a friendly, approachable feel. Apply a subtle gradient from `primary` to `primary_container`.
- **Secondary:** `surface-container-lowest` background with a `ghost-border`. 
- **Interaction:** On hover, slightly deepen the gradient; avoid "popping" shadows.
 
### Input Fields
- **Style:** Large, breathable containers using `surface-container-lowest`. 
- **Typography:** Placeholder text should use `body-md` in `on_surface_variant`.
- **States:** Focus state uses a 1px `primary` border—the only exception to the "No-Line" rule.
 
### Cards (Property & Profiles)
- **Constraint:** No dividers. Separate the image, title, and price using the Spacing Scale (e.g., `spacing-3` between image and text).
- **Radius:** Apply `rounded-lg` (1rem) to images to mirror the softness of the brand.
- **Micro-Copy:** Use `tertiary` (`#904917`) for small, high-value highlights like "New Listing" or "Verified Roommate."
 
### The "Connection Score" Chip
A bespoke component for this system. Use a circular `surface-container-highest` background with a `primary` stroke indicating the match percentage. Use `newsreader` for the percentage number to make it feel like a curated recommendation rather than a data point.
 
---
 
## 6. Do’s and Don’ts
 
### Do
- **Use Intentional Asymmetry:** Align text to the left while keeping CTAs or images slightly offset to create a dynamic, editorial feel.
- **Embrace White Space:** Use `spacing-16` or `spacing-20` between major sections to let the content breathe.
- **Lifestyle Photography:** Use warm-toned, high-quality images of real people and lived-in spaces. Avoid "staged" real estate photos.
 
### Don’t
- **Don’t use 100% Black:** Always use `on_surface` (#1b1c19) for text to maintain the earthy, warm tone.
- **Don’t use Sharp Corners:** Avoid `rounded-none`. Everything should feel soft and touchable.
- **Don’t Over-Shadow:** If a section feels flat, try changing the background color of the container before reaching for a shadow effect.
- **Don't use Dividers:** Avoid horizontal lines to separate list items; use `spacing-4` and background tonal shifts instead.