# Design System

**Pokza Design System** — The Most Beautiful Poker Social Network

Inspiré par Apple (minimalisme), Linear (précision), Arc Browser (modernité), Strava (communauté), Binked (poker-first).

---

## 1. Color Palette

### Primary Colors (Poker Heritage)
```
Navy (Table Felt)       #16233D   — Core, trust, poker authenticity
Gold (Action)           #C9A227   — Excellence, premium, decision points
Orange (Energy)         #E8571F   — Action, call-to-action, momentum
Parchemin (Background)  #EDEAE2   — Premium paper feel, warmth
```

### Neutral Scale (Apple-inspired)
```
White                   #FFFFFF   — Pure, clean, minimal
Off-White               #F9F9F9   — Backgrounds, subtle depth
Warm Gray               #F2F0ED   — Secondary backgrounds
Light Gray              #E8E6E3   — Dividers, borders
Medium Gray             #A8A6A2   — Secondary text, icons
Dark Gray               #5C5A56   — Primary text, readability
Navy (Dark)             #16233D   — Strong contrast, headings
```

### Semantic Colors (Functional)
```
Success                 #10B981   — Positive actions, wins, green lights
Warning                 #F59E0B   — Caution, alerts, needs attention
Error                   #EF4444   — Errors, folds, bad outcomes
Info                    #3B82F6   — Information, details, secondary
Muted                   #D1CFC9   — Disabled, inactive, secondary states
```

### Poker-Specific Semantics
```
Fold (Red)              #EF4444   — Fold actions
Call (Blue)             #3B82F6   — Call/Follow actions
Raise (Orange)          #E8571F   — Raise/Bet actions
Check (Gray)            #A8A6A2   — Check actions
All-in (Gold)           #C9A227   — All-in intensity
```

### Dark Mode
```
Dark Background         #0F172A   — Navy variant for dark UI
Dark Surface            #1E293B   — Elevated surfaces
Dark Text               #F9F9F9   — High contrast text
Dark Accent             #FCD34D   — Brighter gold for dark mode
```

### Usage
- **Navy** : Table surfaces, cards, premium sections, headers
- **Gold** : CTAs (buttons), premium badges, top achievements
- **Orange** : Alerts, action states, engagement moments
- **Parchemin** : Main feed backgrounds, card backgrounds
- **Neutrals** : Text, borders, secondary UI

---

## 2. Typography

### Font Family
```
Headings & Brand        : Fraunces 600 SemiBold
                          (serif, poker heritage, elegance)
                          
Body & UI               : Inter (or Visby CF as fallback)
                          (sans-serif, modern, readable, Apple-like)
                          
Code & Technical        : JetBrains Mono Regular
                          (monospace, poker hand notation)
```

### Type Scale (Modular Scale 1.125)

```
H1 (Display)            28px / 34px line-height   Fraunces 600   — Page titles
H2 (Hero)               24px / 30px line-height   Fraunces 600   — Section headers
H3 (Section)            20px / 26px line-height   Fraunces 600   — Subsection
H4 (Subheading)         18px / 24px line-height   Inter 600      — Small headers

Body Large              16px / 24px line-height   Inter 400      — Primary body text
Body Regular            14px / 20px line-height   Inter 400      — Standard UI text
Body Small              12px / 18px line-height   Inter 400      — Secondary text

Label Large             14px / 20px line-height   Inter 600      — Button labels, tags
Label Regular           12px / 16px line-height   Inter 600      — Small labels
Label Small             11px / 16px line-height   Inter 500      — Mini labels, badges

Caption                 12px / 16px line-height   Inter 400      — Timestamps, hints
Meta                    10px / 14px line-height   Inter 500      — Poker notation (small)
```

### Font Weights
```
Fraunces : 400 (Regular), 600 (SemiBold), 700 (Bold)
Inter    : 400 (Regular), 500 (Medium), 600 (SemiBold), 700 (Bold)
```

### Font Colors
```
Primary Text            : #1E293B (navy-dark, high contrast)
Secondary Text          : #5C5A56 (medium gray, readable but muted)
Tertiary Text           : #A8A6A2 (light gray, hints/timestamps)
Inverted Text           : #FFFFFF (on dark/navy backgrounds)
Disabled Text           : #D1CFC9 (muted, not interactive)
```

---

## 3. Icons

### Icon System
```
Style                   : Minimalist, 2px stroke weight
                          (Linear, Arc Browser style)
                          
Size Standard           : 16px, 20px, 24px, 32px
                          (Multiples of 4 for rhythm)
                          
Animation               : 150ms ease-out by default
                          No bounce, smooth transitions
```

### Core Icons
```
Navigation
  — Home                : House with slightly rounded corners
  — Search              : Magnifying glass (thin)
  — Create              : Plus in circle (prominent)
  — Profile             : Person in circle (avatar-ready)
  — Notifications       : Bell with dot indicator

Actions
  — Share               : Arrow pointing out
  — Like/Heart          : Outlined → Filled on interaction
  — Comment             : Speech bubble
  — Save                : Bookmark
  — More                : Three dots (horizontal)

Poker-Specific
  — Fold                : X with curve (like folding paper)
  — Check               : Checkmark circle
  — Call                : Arrow going right
  — Bet/Raise           : Arrow going up
  — All-in              : Filled circle (intensity)
  — Showdown            : Two cards revealing

Hand Notation
  — Spades (♠)          : Solid spade shape
  — Hearts (♥)          : Solid heart
  — Diamonds (♦)        : Solid diamond
  — Clubs (♣)           : Solid club
```

### Icon Colors
```
Default                 : #5C5A56 (medium gray)
Active/Hover            : #C9A227 (gold)
Destructive             : #EF4444 (error red)
Success                 : #10B981 (green)
Disabled                : #D1CFC9 (muted)
```

---

## 4. Animations & Interactions

### Principles (Apple + Linear)
```
- Smooth, not bouncy
- Purpose-driven (every motion tells a story)
- Sub-400ms for micro-interactions
- 150-300ms for moderate transitions
- No motion sickness (avoid extreme parallax)
- Respects prefers-reduced-motion
```

### Standard Easing
```
Entrance                : ease-out (150ms)
                          [0.0, 0.0, 0.2, 1.0]
                          
Exit                    : ease-in (150ms)
                          [0.4, 0.0, 1.0, 1.0]
                          
Interaction             : ease-in-out (200ms)
                          [0.4, 0.0, 0.2, 1.0]
```

### Key Animations

#### Button Interactions
```
Hover                   : Scale 1.02 + brightness +5%
                          150ms ease-out
                          
Press                   : Scale 0.98
                          100ms ease-in
                          
Loading                 : Rotating spinner
                          Linear, continuous
```

#### Card Entrance (Replayer, Feed)
```
Slide up + Fade in      : translateY(20px) → 0
                          opacity 0 → 1
                          250ms ease-out
                          Stagger: 50ms between cards
```

#### Hand Replay Animations
```
Card reveal             : Flip animation (3D perspective)
                          300ms ease-out
                          
Chip movement           : Arc trajectory
                          200ms ease-in-out
                          
Action callout          : Fade in + scale
                          150ms ease-out
                          
Fold visual             : Fade out + slight zoom
                          250ms ease-in
```

#### Like/Heart Animation
```
Outline → Filled        : 200ms ease-out
Add bounce              : Scale 1.0 → 1.2 → 1.0
                          150ms cubic-bezier(0.68, -0.55, 0.265, 1.55)
```

#### Page Transitions
```
Push (enter new page)   : Slide right + fade out (old)
                          Slide left + fade in (new)
                          300ms ease-out
                          
Pop (go back)           : Reverse of push
```

---

## 5. Spacing System

### Base Unit
```
Base                    : 4px
Scale                   : 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96
```

### Common Spacings
```
xs                      : 4px     (icon spacing, very tight)
sm                      : 8px     (element padding, compact)
md                      : 16px    (standard spacing, breathing room)
lg                      : 24px    (section spacing, clear separation)
xl                      : 32px    (major spacing, big blocks)
2xl                     : 48px    (full page padding)
3xl                     : 64px    (major section gap)
```

### Layout Rules
```
Page padding            : 16px (mobile), 24px (tablet), 32px (desktop)
Section gap             : 24px
Component gap           : 8-12px (flex/grid)
Text line-height        : 1.5x font size (minimum)
Paragraph spacing       : 16px between paragraphs
```

---

## 6. Components & Patterns

### 6.1 Buttons

#### Primary Button
```
Background              : #C9A227 (Gold)
Text                    : #FFFFFF
Padding                 : 12px 24px
Border Radius           : 8px
Typography              : Inter 600, 14px
Height                  : 44px (touch-friendly)

States
  Default               : Background #C9A227, shadow subtle
  Hover                 : Background #B8931F, brightness +5%
  Active                : Scale 0.98
  Disabled              : Background #D1CFC9, opacity 0.6
  Loading               : Show spinner (16px), disable interaction
```

#### Secondary Button
```
Background              : Transparent
Border                  : 1px solid #A8A6A2
Text                    : #1E293B
Padding                 : 12px 24px
Border Radius           : 8px
Typography              : Inter 600, 14px

States
  Hover                 : Background #F2F0ED, border #5C5A56
  Active                : Background #E8E6E3
```

#### Tertiary Button
```
Background              : Transparent
Text                    : #5C5A56
Padding                 : 12px 16px
Border Radius           : 6px
Typography              : Inter 500, 14px

States
  Hover                 : Background #F2F0ED
  Active                : Background #E8E6E3
```

#### Icon Button
```
Size                    : 40x40px (touch target)
Icon Size               : 20px
Background              : Transparent
Hover Background        : #F2F0ED
Border Radius           : 8px
Transition              : 150ms ease-out
```

#### Floating Action Button (FAB)
```
Size                    : 56x56px
Icon Size               : 24px
Background              : #E8571F (Orange)
Shadow                  : 0 4px 12px rgba(0,0,0,0.15)
Border Radius           : 16px
Position                : Fixed bottom-right, 16px margin
Hover Shadow            : 0 6px 16px rgba(0,0,0,0.2)
```

### 6.2 Cards

#### Feed Card (Post)
```
Background              : #FFFFFF
Border                  : 1px solid #E8E6E3
Border Radius           : 12px
Padding                 : 16px
Shadow                  : 0 1px 3px rgba(0,0,0,0.05)

Components
  Avatar + Name         : 40px avatar, 12px spacing
  Timestamp             : Caption text, #A8A6A2
  Hand Replayer         : Max-width 100%, aspect-ratio 16:9
  Action Bar            : Like, comment, share, more (bottom)
  Stats                 : View count, like count, comment count (subtle)

Hover State             : Shadow 0 4px 12px rgba(0,0,0,0.1)
```

#### Hand Card (Replayer Preview)
```
Background              : #16233D (Navy, poker table)
Border Radius           : 8px
Aspect Ratio            : 16:9
Padding                 : 16px
Shadow                  : 0 2px 8px rgba(0,0,0,0.15)

Content
  Table (SVG)           : Centered, elliptical
  Seats (6 positions)   : Around table, badges with stacks
  Board                 : Center-top, cards visible
  Controls              : Play button (center), skip backward/forward
  Callout               : Action description, fade animation

Interaction
  Tap                   : Expand to full replayer
  Hover (desktop)       : Slight zoom, shadow increase
```

#### User Card (Profile Preview)
```
Background              : #FFFFFF
Border                  : 1px solid #E8E6E3
Border Radius           : 12px
Padding                 : 16px
Width                   : ~200px

Content
  Avatar                : 64px, centered
  Name                  : H4, centered
  Position              : "Pro", "Coach", "Grinder" (label)
  Stats                 : Hands shared, followers, win rate (optional)
  Button                : Follow/Unfollow (primary small)

Hover State             : Shadow increase, slight translateY(-2px)
```

#### Chip Stack Badge
```
Background              : Linear gradient (gold → orange)
Border Radius           : 4px
Padding                 : 4px 8px
Typography              : Inter 600, 12px
Text Color              : #FFFFFF
Shadow                  : 0 1px 3px rgba(0,0,0,0.2)
Emoji/Icon              : Chip icon prefix

Variants
  500                   : "♣ 500"
  10k                   : "♥ 10K"
  All-in                : Pulsing gold background
```

### 6.3 Replayer (Hand Viewer)

#### Layout
```
Container               : Full screen or expanded modal
Background              : #16233D (Navy table)
Aspect Ratio            : 16:9 (landscape), responsive

Components
  Table (SVG)           : Center, elliptical, proper perspective
  Seats                 : 6 positions (customizable)
    Avatar              : 40px, centered at seat
    Name                : Below avatar
    Stack               : Gold badge, right of avatar
    Cards               : Above/behind seat, 60x85px each
    Fold Label          : "FOLD" if folded, red text
    Action Indicator    : Gold border if acting
    
  Board
    Location            : Top center
    Cards               : Shown progressively (preflop → flop → river)
    Pot Display         : Below board
    
  Action Callout        : Center screen, temporary
    Text                : "Hero raises to 100"
    Animation           : Fade in + scale up (300ms)
    
  Controls
    Play/Pause          : Large play button (orange)
    Step Back/Forward   : Arrow buttons
    Timeline Scrubber   : Horizontal slider (optional)
    Speed Control       : 0.5x, 1x, 2x (optional)
    
  Info Panel (Side)
    Action History      : List of all actions taken
    Current Street      : "Flop", "River", etc.
    Pot Size            : Updated live
    Player Stats        : Win rate, positions
```

#### Card Appearance
```
Face-up Card
  Style                 : Rounded 8px corners
  Font                  : Bold serif rank, suit symbol
  Colors               : Black/Red for suit
  Shadow               : 0 2px 8px rgba(0,0,0,0.2)
  
Face-down Card
  Style                 : Card back pattern (elegant)
  Color                 : #C9A227 with subtle pattern
  
Animated Reveal
  3D Flip              : rotateY(0 → 180°)
  Duration             : 300ms ease-out
  Perspective          : 1000px
```

#### Animations
```
Card Reveal             : Flip + appear (300ms ease-out)
Chip Movement           : Arc trajectory (200ms ease-in-out)
Action Update           : Fade + scale (150ms ease-out)
Fold Animation          : Fade out + slide (250ms ease-in)
```

### 6.4 Feed

#### Structure
```
Layout                  : Single column, max-width 600px
Background              : #EDEAE2 (Parchemin)
Padding                 : 16px (mobile), 24px (desktop)

Post Card
  Spacing between       : 16px gap
  
Infinite Scroll
  Load trigger          : Bottom 200px visible
  Skeleton loader       : Show while loading
  
Refresh                 : Pull-to-refresh (mobile)
                          Refresh button (desktop)
```

#### Feed Item Structure
```
Header
  Avatar (40px)         : User profile picture
  Name + Handle         : @username
  Timestamp             : "2h ago"
  Menu (...)            : More options (report, mute, etc.)
  
Hand Replayer           : Interactive preview (see 6.3)
  
Metadata
  Game Type             : "Cash 2/5 (6-max)"
  Hand Result           : "Won 240"
  
Action Bar
  Heart (Like)          : Count displayed
  Comment               : Count displayed
  Share                 : Only icon
  Save                  : Bookmark icon
  More                  : Kebab menu
  
Comments (Collapsed)
  Show top 2            : "2 more comments"
  Comment Preview       : "Great play! The 3bet here was..."
```

### 6.5 Profiles

#### Profile Header
```
Background              : Gradient (navy → dark navy)
Height                  : 180px (mobile), 240px (desktop)

Content
  Cover Image           : Poker-themed or user-uploaded
  Avatar                : 80px, positioned -40px from bottom
  
Main Section
  Name                  : H2, white text
  Handle                : @username, gray text
  Title                 : "Pro", "Coach", "Grinder" (gold badge)
  Bio                   : 2-3 lines, gray text
```

#### Profile Stats (Below Header)
```
Layout                  : Horizontal scroll (mobile), 3-column (desktop)
Background              : White
Padding                 : 16px

Stats
  Hands Shared          : Large number, smaller label
  Followers             : Count
  Win Rate              : "52.3%"
  Coaching              : "Available" or "Full"
  
Spacing                 : Dividers between stats
```

#### Profile Tabs
```
Sticky header           : Hands | Analyses | Comments | Likes
Active indicator        : Gold underline
Transition              : 200ms slide
```

#### Hand Gallery (Grid)
```
Grid                    : 2 columns (mobile), 3 columns (desktop)
Card Size               : 16:9 aspect ratio
Gap                     : 12px
Image                   : Replayer preview thumbnail
Overlay on Hover        : Play button appears

Pagination              : Infinite scroll
Loading                 : Skeleton grid
```

---

## 7. Data Visualization

### Stats Displays
```
Metric Card
  Large Number          : H3, navy
  Label                 : Caption, gray
  Optional Trend        : Arrow + percent change (green/red)
  
Example                 : "52.3%" "Win Rate" "↑ 2.1%"
```

### Charts (if needed)
```
Style                   : Line charts, not bars (Linear-inspired)
Colors                  : Gold accent, gray background
Smooth curves           : Bezier interpolation
No 3D effects           : Flat, minimal

Hand Statistics Over Time
  X-axis                : Days/Weeks/Months
  Y-axis                : Win rate, profit, volume
```

---

## 8. Forms & Inputs

### Text Input
```
Height                  : 44px
Padding                 : 12px 16px
Border                  : 1px solid #E8E6E3
Border Radius           : 8px
Font                    : Inter 14px
Placeholder             : #A8A6A2, italic

States
  Focus                 : Border #C9A227, shadow 0 0 0 3px gold/10%
  Error                 : Border #EF4444
  Disabled              : Background #F2F0ED, text #D1CFC9
```

### Select/Dropdown
```
Height                  : 44px
Padding                 : 12px 16px
Border                  : 1px solid #E8E6E3
Border Radius           : 8px
Icon                    : Chevron down (#5C5A56)

Dropdown Menu
  Background            : #FFFFFF
  Border                 : 1px solid #E8E6E3
  Shadow                 : 0 4px 12px rgba(0,0,0,0.1)
  Item height           : 40px
  Item hover            : Background #F2F0ED
  Item selected         : Background #E8E6E3, text #C9A227
```

### Checkbox
```
Size                    : 20x20px
Border                  : 2px solid #C9A227
Border Radius           : 4px
Checked                 : Background #C9A227, white checkmark
Unchecked               : Transparent background
Focus                   : Ring 2px #C9A227/30%
```

### Toggle
```
Size                    : 44x24px (width x height)
Border Radius           : 12px
Background Off          : #E8E6E3
Background On           : #C9A227
Circle Size             : 20x20px
Animation               : Slide 200ms ease-out
```

---

## 9. Dark Mode

### Override Colors
```
Dark Background         : #0F172A (navy-dark)
Dark Surface            : #1E293B
Dark Card               : #2A3550
Dark Text               : #F9F9F9 (near white)
Dark Secondary          : #CBD5E1 (light gray)
Dark Accent             : #FCD34D (brighter gold)

All text colors increase contrast
All shadows become more subtle (dark-on-dark)
Replayer background: Navy stays mostly the same (already dark)
```

---

## 10. Responsive Breakpoints

### Mobile-First Approach
```
Mobile                  : 0px - 640px (single column, large touch targets)
Tablet                  : 641px - 1024px (2-column layouts)
Desktop                 : 1025px+ (3-column, expanded)

Adjustments
  Font sizes            : Scale down 1-2px on mobile
  Spacing               : Reduce to 12px on mobile (was 16px)
  Icons                 : Consistent size (scale doesn't change)
  Cards                 : Full-width on mobile, constrained on desktop
```

---

## 11. Accessibility

### WCAG 2.1 AA Compliance

```
Color Contrast
  Body text             : 7:1 (navy on light)
  Secondary text        : 4.5:1 minimum
  UI components         : 3:1 for graphics
  
Focus States
  All interactive       : Visible focus ring (2px gold)
  Keyboard nav          : Tabindex order logical
  
Motion
  Respect prefers-reduced-motion
  No auto-play videos
  No infinite animations
  
Typography
  Font size minimum     : 14px for body text
  Line height           : 1.5x minimum
  Letter spacing        : Allow user override
  
Images
  All have alt text
  Replayer has descriptive labels
  
Buttons
  Minimum 44x44px touch target
  Clear labels
  
Forms
  Labels associated with inputs
  Error messages clear and specific
```

---

## 12. Voice & Tone

### Micro-copy Principles
```
Button Labels           : Action-oriented, short ("Play Hand", "Share")
Error Messages          : Helpful, not scary ("Oops, that didn't work. Try again?")
Placeholders            : Hint, not instruction ("e.g., @username")
Confirmations           : Celebratory when good ("Hand published! 🎉")
Notifications           : Direct, friendly ("Alice liked your analysis")
```

### Examples
```
Good ✅                 : "Share this hand"
Bad ❌                  : "Click to share"

Good ✅                 : "Hand not found"
Bad ❌                  : "ERROR 404: Resource unavailable"

Good ✅                 : "Keep it private or share with friends?"
Bad ❌                  : "Configure privacy settings"
```

---

## 13. Implementation Checklist

Before shipping any UI component:

- [ ] Color from palette (no arbitrary hex)
- [ ] Typography on scale (no random sizes)
- [ ] Spacing uses grid (multiples of 4px)
- [ ] Buttons have all states (default, hover, active, disabled)
- [ ] Animation is smooth and purposeful (< 400ms)
- [ ] Respects dark mode
- [ ] Touch targets ≥ 44x44px
- [ ] Text contrast ≥ 4.5:1
- [ ] Focus ring visible and on-brand
- [ ] Responsive at mobile/tablet/desktop
- [ ] Tested in light + dark mode
- [ ] No motion sickness (checked prefers-reduced-motion)
- [ ] Performance: icons are SVG, images optimized
- [ ] Micro-copy is friendly and clear

---

## 14. Design Tokens (for developers)

```javascript
// Colors
--color-navy: #16233D;
--color-gold: #C9A227;
--color-orange: #E8571F;
--color-parchemin: #EDEAE2;
--color-text-primary: #1E293B;
--color-text-secondary: #5C5A56;

// Spacing
--space-xs: 4px;
--space-sm: 8px;
--space-md: 16px;
--space-lg: 24px;
--space-xl: 32px;

// Typography
--font-display: Fraunces 600;
--font-body: Inter 400;
--font-mono: JetBrains Mono;
--text-size-h1: 28px;
--text-size-body: 14px;

// Shadows
--shadow-sm: 0 1px 3px rgba(0,0,0,0.05);
--shadow-md: 0 4px 12px rgba(0,0,0,0.1);
--shadow-lg: 0 6px 16px rgba(0,0,0,0.15);

// Radius
--radius-sm: 4px;
--radius-md: 8px;
--radius-lg: 12px;
--radius-full: 9999px;

// Transitions
--ease-out: cubic-bezier(0.0, 0.0, 0.2, 1.0);
--ease-in: cubic-bezier(0.4, 0.0, 1.0, 1.0);
--ease-in-out: cubic-bezier(0.4, 0.0, 0.2, 1.0);
```

---

## 15. References & Inspiration

Palettes & Style Guides Studied:
- **Apple** : Minimalism, generous spacing, system fonts
- **Linear** : Precision, clean lines, functional beauty
- **Arc Browser** : Modern gradients, subtle animations, attention to detail
- **Strava** : Community celebration, activity focus, stat visualization
- **Binked** : Poker-specific UI, hand visualization, action feedback

Goal: Combine poker heritage (Navy + Gold) with modern, premium design that feels as native as Strava or Linear, but uniquely Pokza.

