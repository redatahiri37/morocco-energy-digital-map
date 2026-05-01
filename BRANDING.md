# AI Atlas — Atlas Nexus Brand Identity

## Executive Summary

**AI Atlas** positions itself at the convergence of Energy and Digital infrastructure in emerging markets. The visual identity system, "**Atlas Nexus**," emphasizes the dual-domain nature of modern infrastructure intelligence through complementary color palettes, hierarchical typography, and layered information design.

---

## 1. BRAND FOUNDATION

### Mission
Intelligent infrastructure mapping that reveals the Energy × Digital nexus — the critical interplay between power systems, renewable generation, data centers, and digital networks.

### Core Values
- **Intelligence**: AI-driven analysis and real-time insights
- **Convergence**: Bridging energy and digital domains
- **Authority**: Thought leadership in infrastructure planning
- **Clarity**: Professional, accessible data visualization

### Brand Positioning
Premium infrastructure intelligence platform for government, investors, and technical teams focused on African energy transition.

---

## 2. COLOR PALETTE

### Primary Colors

**Deep Navy** — Structure, Authority, Intelligence
```
Hex:      #001F4D
RGB:      0, 31, 77
HSL:      210°, 100%, 15%
Usage:    Primary text, structural elements, key UI components
Psychology: Trust, professionalism, stability
```

**Energy Orange** — Generation, Power, Momentum
```
Hex:      #FF6B35
RGB:      255, 107, 53
HSL:      18°, 100%, 60%
Usage:    Solar/wind/thermal generation markers, energy infrastructure
Psychology: Energy, warmth, urgency, growth
```

**Digital Cyan** — Connectivity, Data, Future
```
Hex:      #00D4FF
RGB:      0, 212, 255
HSL:      190°, 100%, 50%
Usage:    Data centers, telecom, digital infrastructure
Psychology: Innovation, connectivity, intelligence, technology
```

### Secondary Colors

**Silver Accent** — Supporting elements
```
Hex:      #E8E8E8
RGB:      232, 232, 232
HSL:      0°, 0%, 91%
Usage:    Lines, connections, subtle highlights
Psychology: Neutrality, precision, connectivity
```

**Charcoal** — Deep neutrals
```
Hex:      #2D2D2D
RGB:      45, 45, 45
HSL:      0°, 0%, 18%
Usage:    Card backgrounds, secondary UI elements
Psychology: Sophistication, minimalism
```

### Color Applications

#### Energy Layer (Generation, Transmission, Industrial)
- **Primary**: Energy Orange #FF6B35
- **Opacity/Dim**: 33% alpha
- **Usage**: Markers, icons, layer indicators

#### Digital Layer (Data Centers, Cables, Telecom)
- **Primary**: Digital Cyan #00D4FF
- **Opacity/Dim**: 33% alpha
- **Usage**: Markers, icons, layer indicators

#### Grid/Infrastructure (Transmission, Corridors)
- **Primary**: Navy #001F4D
- **Opacity/Dim**: 33% alpha
- **Usage**: Structural grid lines, backbone corridors

---

## 3. TYPOGRAPHY SYSTEM

### Font Stack

**Headlines** — Serif (Authority, Timelessness)
```
Font:     Instrument Serif
Weight:   400 (Regular), 700 (Bold)
Usage:    Page title, section labels, major headings
Scale:    20px–28px
```

**Body Text** — Sans-serif (Readability, Modern)
```
Font:     Roboto (fallback: -apple-system, BlinkMacSystemFont, "Segoe UI")
Weight:   400 (Regular), 500 (Medium), 600 (Semibold)
Usage:    Descriptions, layer names, form labels
Scale:    12px–14px
```

**Data/Technical** — Monospace (Precision, Accuracy)
```
Font:     IBM Plex Mono (fallback: system monospace)
Weight:   400 (Regular), 600 (Semibold)
Usage:    Coordinates, MW capacity, source citations, code
Scale:    10px–12px
```

### Typography Hierarchy

| Element | Font | Size | Weight | Color |
|---------|------|------|--------|-------|
| Page Title | Instrument Serif | 20px | 400 | Navy #001F4D |
| Section Label | Instrument Serif | 9px | 700 | Navy #001F4D |
| Layer Name | Roboto | 12px | 500 | Light Gray |
| KPI Value | Roboto | 18px | 800 | Energy/Digital (contextual) |
| Timestamp | Roboto | 10px | 400 | Muted Gray |
| Coordinate | IBM Plex Mono | 11px | 400 | Dim Gray |

---

## 4. COMPONENT DESIGN SYSTEM

### Top Bar (Header)

**Background**: Gradient fade
```css
background: linear-gradient(90deg, #0a0a0988 0%, #0a0a09 50%, #00D4FF0f 100%);
```

**Logo Mark**: Navy-colored network icon
- SVG stroke: Navy #001F4D
- Size: 28px × 28px
- Animation: Subtle pulse on hover

**Logo Text**: "AI ATLAS" (Instrument Serif)
- Size: 15px
- Color: Navy #001F4D
- Letter-spacing: 0.5px
- Transform: Uppercase

**Tagline**: "Intelligent Infrastructure Mapping for Africa" (Roboto)
- Size: 10px
- Color: Muted gray
- Letter-spacing: 0.8px

### Sidebar

**Section Headers** — Serif + Navy + Icon
```
Label:    "⚡ ENERGY — GENERATION" (Energy sections)
Label:    "◆ DIGITAL" (Digital sections)
Label:    "◼ INDUSTRIAL DEMAND" (Industrial sections)
Color:    Navy #001F4D
Font:     Instrument Serif, 8px, 700
```

**Layer Toggles** — Interactive, color-coded
- Checkbox: 14px square, Navy border when unchecked, filled with layer color when checked
- Color Dot: 7px circle, layer-specific color
- Hover State: Background brightens to charcoal
- Sublayers: Indented 18px, smaller controls

**KPI Cards** — Information density + visual hierarchy
- Background: Charcoal #2D2D2D (hover: subtle Navy glow)
- Border-left: 3px solid (Energy Orange for energy, Digital Cyan for digital)
- Value: 18px, bold, color-coded (orange for GW, cyan for pipeline)
- Label: 8px, uppercase, muted gray

### Map Layer Styling

**400kV Backbone** (Grid sublayer)
- Color: Navy #001F4D
- Width: 2.5px
- Opacity: 0.7
- Style: Solid line

**225kV Corridors** (Grid sublayer)
- Color: Navy #001F4D
- Width: 1.8px
- Opacity: 0.55
- Style: Solid line

**Planned Extensions** (Grid sublayer)
- Color: Digital Cyan #00D4FF
- Width: 2px
- Opacity: 0.45
- Style: Dashed line (6px dash, 4px gap)

**Generation Markers** (Point layers)
- Solar: Energy Orange #FF6B35
- Wind: Digital Cyan #00D4FF
- Thermal: Silver #E8E8E8
- Hydro: Medium Blue (from existing palette)

**Data Center Pipeline** (Point layer)
- Color: Digital Cyan #00D4FF
- Shape: Square, 16px
- Pulse Animation: 2s cycle, scale 1 → 2.5, opacity fade

### Info Panel (Right Drawer)

**Badge System**
- Generation (Gen): Orange background, Orange text
- Transmission (TX): Navy background, Navy text
- Data Center (DC): Cyan background, Cyan text
- Cable Landing (Cable): Orange background, Orange text

**Status Indicators**
- Operational: Green badge
- Planned: Navy badge
- Construction: Orange badge
- Announced: Purple badge

---

## 5. VISUAL INTERACTION PATTERNS

### Hover States
- **Layer Toggles**: Background color shifts to Charcoal, toggle dot brightens
- **Top Buttons**: Border color → Navy, text color → Navy
- **Links**: Underline appears, color maintains Navy

### Active States
- **Checkbox**: Filled with layer color, checkmark visible
- **Sublayer**: Indented toggle appears enabled
- **Map Layer**: Opacity increased, glow effect applied

### Animated Elements

**Pulsing Node Animation** (Data Centers)
```
Duration:     2s (infinite)
Scale Path:   1 → 2.5
Opacity Path: 0.7 → 0
Effect:       Creates "radar ping" feel
Color:        Cyan #00D4FF
```

**Dash Flow Animation** (Planned Grid Lines)
```
Duration:     Continuous loop
Dash Array:   6px 4px
Offset Flow:  -24px
Effect:       Suggests future, movement, urgency
```

**Hover Enlarge** (Markers)
```
Duration:     120ms
Scale Path:   1 → 1.18
Effect:       Interactive feedback, improves mobile touch targets
```

---

## 6. DARK MODE & LIGHT MODE

### Dark Mode (Default)
- Background: Charcoal series (#0a0a09 → #232320)
- Text: Light gray (#f2f0ec → #5a5850 hierarchy)
- Accents: Navy, Energy Orange, Digital Cyan (full saturation)
- Use Case: Desktop, professional dashboards, evening use

### Light Mode
- Background: Warm neutrals (#f9f7f5 → #dedad4)
- Text: Dark charcoal (#1a1a18 → #9a9890 hierarchy)
- Accents: Navy, Energy Orange, Digital Cyan (adjusted for contrast)
- Use Case: Presentations, printing, accessible viewing

**Color Preservation**: Navy, Energy Orange, and Digital Cyan remain constant in both modes for brand consistency.

---

## 7. RESPONSIVE DESIGN

### Desktop (>900px)
- Sidebar: Fixed left, 320px width
- Info Panel: Fixed right, 380px width
- Header: Full-width top bar
- Map: Remaining viewport

### Tablet (768px – 900px)
- Sidebar: Bottom sheet, 48vh height (slide-up interaction)
- Info Panel: Overlay (stacked above sidebar)
- Header: Full-width
- Map: Full viewport with controls

### Mobile (<768px)
- Sidebar: Bottom sheet, gesture-controlled
- Info Panel: Overlay on map
- Header: Compact, logo-only option
- Touch Targets: Minimum 44px × 44px

---

## 8. BRANDING APPLICATIONS

### Logo Variants

**Primary Logo**: Navy icon + Navy text + Tagline
- Use: Header, main branding, high visibility contexts
- Minimum size: 28px × 28px (icon)

**Icon Only**: Navy network mark
- Use: Favicon, social media profile, small contexts
- Minimum size: 16px × 16px

**Text Only**: "AI ATLAS" Serif
- Use: Headers, posters, when space is limited
- Minimum size: 14px

### Brand Spacing

**Logo Padding**: Minimum 8px clear space on all sides
**Color Separation**: Navy and Energy Orange/Cyan maintain minimum 2px spacing
**Typography Spacing**: 10px between headline and body text

---

## 9. USAGE GUIDELINES

### Do's
✅ Use Navy for primary UI and text (hierarchy, trust)
✅ Use Energy Orange for generation, power, urgency
✅ Use Digital Cyan for data, connectivity, technology
✅ Maintain consistent typography hierarchy
✅ Apply color contextually (Energy layer → Orange)
✅ Ensure sufficient contrast for accessibility (WCAG AA minimum)

### Don'ts
❌ Don't use Navy and Energy Orange without spacing
❌ Don't mix Serif and Sans-serif fonts arbitrarily
❌ Don't saturate UI with Cyan (use for accent/highlight)
❌ Don't reduce logo below 16px without permission
❌ Don't apply color to text that violates contrast
❌ Don't use light colors on light backgrounds

---

## 10. COMPONENT SPECIFICATIONS

### Button States

**Primary Button** (Token submission, major actions)
```css
background: navy (#001F4D)
color: white
padding: 8px 16px
border-radius: 5px
font-weight: 600
transition: all 150ms
:hover { background: #003366 (darker navy) }
:active { transform: scale(0.98) }
```

**Secondary Button** (Fit map, minor actions)
```css
background: transparent
border: 1px solid var(--border)
padding: 7px 12px
border-radius: 7px
color: gray
:hover { border-color: navy, color: navy }
```

### Form Inputs

```css
background: dark-bg-0
border: 1px solid var(--border)
border-radius: 5px
padding: 8px
color: text-0
:focus { outline: none; border-color: navy }
font-family: monospace (for token input)
```

### Badges & Status

**Status Badge**
```css
padding: 3px 8px
border-radius: 4px
font-size: 9px
font-weight: 700
text-transform: uppercase
background: [energy/digital]-dim
color: [energy/digital]-primary
```

---

## 11. IMPLEMENTATION CHECKLIST

- [x] Color tokens added to CSS :root
- [x] Typography system defined
- [x] Top bar header styling updated (gradient, serif logo)
- [x] Sidebar section labels with data-group attributes
- [x] KPI cards styled with border accents
- [x] Layer toggles color-coded by group
- [x] Info panel badges updated
- [x] Dark/Light mode color inheritance
- [x] Responsive behavior maintained
- [ ] Logo animation (hover pulse) — Optional enhancement
- [ ] Dash flow animation on planned lines — Optional enhancement
- [ ] Data center pulse animation — Optional enhancement

---

## 12. FUTURE ENHANCEMENTS

### Phase 2: Animation & Microinteractions
- Animated network nodes on header logo (pulsing, connecting)
- Smooth transitions for layer visibility changes
- Parallax effects for energy/digital split in future UI redesign

### Phase 3: Dashboard Variant
- Premium dark-mode theme with glassmorphism elements
- Real-time data visualization with animated overlays
- Energy × Digital split-screen dashboard layout

### Phase 4: Brand Extensions
- Mobile app design system (iOS + Android)
- Presentation templates (Figma, PowerPoint)
- Printed materials (report covers, business cards)
- Animated video intros/outros

---

## Document Version
**v1.0** — Atlas Nexus Brand Identity  
**Date**: May 2026  
**Author**: AI Atlas Design System  
**Status**: Active (Production)

