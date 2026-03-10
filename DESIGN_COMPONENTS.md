# Hello Driver - Component & Visual Hierarchy Reference

## 1. FORM COMPONENTS

### Text Input Field
```
Structure:
┌─────────────────────────┐
│ [Icon]  Placeholder     │
└─────────────────────────┘

Properties:
- Height: 56px
- Padding: 16px (left/right)
- Border radius: 8-12px
- Border: 1px solid #E0E0E0
- Focus state: Border color #1F90FF
- Icon: 24px, left-aligned
- Font: 14-16px, Regular

States:
- Default: Light gray border
- Focused: Blue border, blue icon
- Filled: Blue icon
- Error: Red border
- Disabled: Gray background, reduced opacity
```

### Phone Input
```
Variant of Text Input with:
- Country code prefix (+84, etc.)
- Numeric keyboard trigger
- Auto-formatting for phone numbers
```

### Password Input
```
Variant with:
- Hidden character display (•••)
- Show/hide toggle icon
- Lock icon prefix
```

### Dropdown/Select
```
Structure:
┌───────────────────────────────┐
│ [Icon]  Selected Option    ▼  │
└───────────────────────────────┘

Properties:
- Similar to text input
- Chevron/arrow icon on right
- Opens modal or menu on tap
- Default to first option if not set
```

### Textarea
```
Properties:
- Multiple lines
- Min height: 100px
- Scalable based on content
- Same border/padding as input
- Border radius: 12px
```

### Payment Card Form
```
Fields:
1. Card Number Input
   - Placeholder: "Card number"
   - Auto-groups digits (4-4-4-4)
   - Accepts numbers only

2. Cardholder Name
   - Text input
   - Alphanumeric

3. Expiry Date
   - Masked: MM/YY
   - Date picker optional

4. CVV
   - 3-4 digits
   - Hidden input
   - Tooltip on focus

Visual:
- Card preview at top showing live input
- Card type icon (Mastercard, Visa)
- All in contained form section
```

---

## 2. BUTTON COMPONENTS

### Primary Button
```
Style:
- Background: Linear gradient blue (#1F90FF to darker blue)
- Text: White, 14-16px, Medium/Bold
- Height: 56px (full width typical)
- Border radius: 12px
- No border
- Drop shadow: Light iOS shadow

States:
- Default: Gradient blue
- Hover/Active: Darker blue gradient
- Disabled: Light gray, opacity 0.5
- Loading: Spinner overlay, text hidden

Label examples:
"Valider" (Validate)
"Confirmer" (Confirm)
"Payer" (Pay)
"Continuer" (Continue)
"S'inscrire" (Sign up)
```

### Secondary Button
```
Style:
- Background: Light gray (#F5F5F5)
- Text: Dark gray (#333), 14-16px, Medium
- Height: 56px
- Border: 1px solid #E0E0E0
- Border radius: 12px

States:
- Default: Light gray
- Active: Darker gray background
- Disabled: Lighter gray, reduced opacity
```

### Outlined Button
```
Style:
- Background: Transparent/White
- Border: 2px solid #1F90FF
- Text: Blue (#1F90FF), 14-16px, Medium
- Height: 56px
- Border radius: 12px

Usage:
- Secondary actions
- Dismissal options (Cancel)
```

### Icon Button
```
Types:
1. Navigation (Back, Close)
   - Size: 32-40px
   - Icon: 24px centered
   - Background: None (transparent) or light gray

2. Action (Search, Settings, More)
   - Size: 44-56px
   - Icon: 20-24px centered
   - Interactive area: Full size

3. Small Action (Favorite, Share)
   - Size: 32-40px
   - Icon: 16-20px
```

---

## 3. NAVIGATION COMPONENTS

### Top Navigation Bar
```
Layout:
[Back Arrow] [Title/Spacer] [Action Icon]
36-40px        flex           40px

Height: 56px (including safe area)
Background: White
Border: Optional bottom divider (1px #E0E0E0)

Elements:
- Back button (tap area 40x40px minimum)
- Title: 16-18px, Medium, dark gray
- Right action: Icon or text button
```

### Bottom Tab Bar
```
Structure:
┌──────────────────────────────┐
│ [✓] [🔍] [⊕] [💬] [👤]      │
│ Home Search Add Chat Profile │
└──────────────────────────────┘

Properties:
- Height: 49px + safe area bottom
- 5 equal-width tabs
- Icon: 24-28px
- Label: 10px, Medium, gray (#666)
- Active: Blue text + icon
- Background: White
- Border top: 1px #E0E0E0

Safe Area:
- iPhone X+ home indicator clearance
```

### Status Bar
```
iPhone X Style:
- Height: 44px (including safe area)
- Shows time, signal, battery
- Light variant: Black text/icons on white
- Dark variant: White text/icons on dark

Content:
[Time]    [Carrier] [Signal] [WiFi] [Battery]
```

---

## 4. CARD COMPONENTS

### Driver Card
```
Layout:
┌─────────────────────────────┐
│ [Photo]  Name, Age          │
│          ⭐ 4.8 (52 reviews) │
│          🚗 Vehicle Type     │
│          Price: $25.00       │
│                [Confirm >]   │
└─────────────────────────────┘

Properties:
- Width: Full width - 32px padding
- Border radius: 12px
- Background: White
- Border: Light gray 1px
- Padding: 12px
- Shadow: Light drop shadow

Elements:
- Avatar: 48x48px, circular
- Name: 14px, Bold
- Age: 14px, Regular, gray
- Rating: 12px, Medium, gold star icon
- Vehicle: 12px, Regular, gray
- Price: 16px, Bold, blue
- Button: 40px height, chevron icon
```

### Trip Card
```
Layout:
┌──────────────────────────┐
│ Route Details            │
│ From → To                │
│ Duration  |  Distance    │
│ Price: $XX Status [Icon] │
└──────────────────────────┘

Properties:
- Width: Full width - 32px padding
- Border radius: 12px
- Background: White or light gray
- Padding: 16px
- Margin bottom: 12px

Elements:
- Route: 16px, Bold
- Details: 13px, Regular, gray
- Price: 16px, Bold, blue
- Status badge: 11px, small pill shape
```

### Payment Method Card
```
Layout:
┌──────────────────────────┐
│ [Card Logo] •••• 4242    │
│ Mastercard               │
│ Expires 12/25            │
│ [Selected radio]         │
└──────────────────────────┘

Properties:
- Height: 100px
- Border radius: 12px
- Background: Light gray or white
- Padding: 12px
- Border: 2px (selected) or 1px
- Selected border: Blue

Elements:
- Logo: 32x32px top left
- Last 4: 16px, Bold, right-aligned
- Name: 13px, Regular
- Expiry: 12px, Regular, gray
```

### Review/Rating Card
```
Layout:
┌──────────────────────────┐
│ Name              ⭐⭐⭐⭐⭐ │
│ "Great driver!"          │
│ 2 days ago               │
└──────────────────────────┘

Properties:
- Padding: 12px
- Border bottom: 1px #E0E0E0
- Last item: No border

Elements:
- Name: 14px, Bold
- Stars: Gold icons, 16px
- Review text: 13px, Regular
- Date: 11px, Regular, gray
```

---

## 5. STATUS & INDICATOR COMPONENTS

### Star Rating
```
Display:
⭐⭐⭐⭐☆ 4.8 (52 reviews)

Properties:
- Filled star: Gold (#FFD700)
- Empty star: Light gray (#E0E0E0)
- Size: 16px standard, 24px large
- Spacing: 2px between stars
- Rating text: 12-14px, beside stars
```

### Status Badge
```
Styles:
1. Completed: Green background, white text
   Background: #2ECC71, Padding: 4px 8px
   Border radius: 4px, Font: 11px

2. Cancelled: Red background, white text
   Background: #E74C3C, Padding: 4px 8px

3. In Progress: Blue background, white text
   Background: #1F90FF, Padding: 4px 8px

4. Pending: Yellow/orange, dark text
   Background: #FFA500, Color: #333

Properties:
- Height: 20-24px
- Border radius: 4-6px
- Font: 11px, Bold
- Padding: 4-6px horizontal
```

### Verification Badge
```
Style:
✓ Verified | 5 ans de Permis B

Properties:
- Size: 16-20px
- Color: Green or teal (#00D4AA)
- Font: 12px, Medium
- Icon: Check mark or shield
- Background: Light teal background (optional)
- Padding: 4px 6px if background
```

### Progress Indicator
```
Linear Progress Bar:
┌─────────────────┐
│███░░░░░░░░░░░░░│ 40%
└─────────────────┘

Properties:
- Height: 4px
- Width: Full width - padding
- Filled: Blue/teal gradient
- Empty: Light gray
- Border radius: 2px
- Position: Bottom of screen typical

Steps Indicator:
● ● ○ ○ ○

Properties:
- Dot size: 8px
- Spacing: 8px
- Active: Blue, filled
- Inactive: Light gray
- Alignment: Center of screen
```

---

## 6. MODAL & OVERLAY COMPONENTS

### Trip Type Selection Modal
```
Structure:
┌────────────────────────────┐
│ Sélectionner Type de Course│
│ ─────────────────────────  │
│ ☐ Course Exclusive         │
│   Privée, plus cher        │
│   + 3 500 Fcfa             │
│                            │
│ ☐ Course Partagée          │
│   Partagée, moins cher     │
│   + 1 500 Fcfa             │
│                            │
│        [Sélectionner]      │
└────────────────────────────┘

Properties:
- Background: White
- Border radius: 16px top
- Position: Bottom sheet (slides up)
- Height: 60-70% of screen
- Padding: 16px
- Dismiss: Swipe down or X button
```

### Payment Method Selection Modal
```
Similar bottom sheet with:
- Payment method options
- Add new method button
- Default method indicator
```

### Loading State
```
Content:
Loading spinner animation (iOS style)
+ Text: "Recherche de Driver..."
or "En cours de traitement..."

Properties:
- Spinner: 40-48px
- Text: 14px, regular
- Layout: Centered, vertical stack
- Opacity: 80% background overlay
```

### Success/Error Messages
```
Success Toast:
┌─────────────────────────┐
│ ✓ Paiement Réussi!      │
└─────────────────────────┘

Error Toast:
┌─────────────────────────┐
│ ✗ Une erreur s'est...   │
└─────────────────────────┘

Properties:
- Height: 48-56px
- Background: Green (success) / Red (error)
- Text: White, 14px, Medium
- Border radius: 12px
- Position: Top or bottom of screen
- Auto-dismiss: 3-4 seconds
- Action: Optional dismiss/retry button
```

---

## 7. LAYOUT PATTERNS

### Safe Area Layout
```
Standard Screen:
┌─────────────────────────┐ ← Safe area top (44px)
│ Status bar / Nav        │
├─────────────────────────┤
│                         │
│  Content Area           │
│  16px padding h         │
│                         │
├─────────────────────────┤
│ Tab bar / Action        │
└─────────────────────────┘ ← Safe area bottom (34px)
```

### Form Screen Layout
```
┌─────────────────────────────────┐
│ ◄ Page Title                    │
├─────────────────────────────────┤
│                                 │
│ [Form Field 1]                  │
│ [Form Field 2]                  │
│ [Form Field 3]                  │
│                                 │
│ [Primary Button]                │
│                                 │
│ [Secondary Link/Button]         │
│                                 │
└─────────────────────────────────┘

Spacing:
- Top: 20px from nav
- Between fields: 12px
- Before button: 24px
- Bottom padding: 16px
```

### Card List Layout
```
┌─────────────────────────────────┐
│ [Card 1]                        │
│ margin: 16px                    │
│ ┌─────────────────────────────┐ │
│ │ Content                     │ │
│ └─────────────────────────────┘ │
│                                 │
│ [Card 2]                        │
│ ┌─────────────────────────────┐ │
│ │ Content                     │ │
│ └─────────────────────────────┘ │
│                                 │
└─────────────────────────────────┘

Properties:
- Card width: Full width - 32px padding
- Card margin bottom: 12px
- Card padding: 12-16px
```

---

## 8. TEXT STYLES & HIERARCHY

### Headlines
```
H1 (Main Title)
Font: 28-32px, Bold
Color: #333333
Line height: 1.2
Usage: "DRIVER", "Je suis :", "Dashboard"

H2 (Section Title)
Font: 20-24px, Medium/Bold
Color: #333333
Usage: "Créer un compte", "Choisir Paiement"

H3 (Subsection)
Font: 16-18px, Medium
Color: #333333
Usage: Form section headers
```

### Body Text
```
Body Regular
Font: 14-16px, Regular
Color: #333333
Line height: 1.5
Usage: Main content, descriptions

Body Small
Font: 12-14px, Regular
Color: #666666
Usage: Secondary info, metadata
```

### Labels & Placeholders
```
Form Label
Font: 12px, Medium
Color: #666666
Usage: "Nom & Prénom", "Email"

Placeholder
Font: 14px, Regular
Color: #999999
Opacity: 0.6
```

### Button Text
```
Font: 14-16px, Bold/Medium
Color: White (primary) or Blue (secondary)
All caps optional: "VALIDER"
Letter spacing: +0.5px optional for caps
```

---

## 9. VISUAL HIERARCHY GUIDELINES

### Importance Levels

**Level 1 (Primary Action)**
- Solid blue button
- 56px height
- Full width
- High contrast

**Level 2 (Secondary Action)**
- Gray outlined button
- 56px height
- Full width or inline

**Level 3 (Tertiary Action)**
- Text link or small icon button
- 14-16px text
- No background

### Prominence in Cards
```
HIGH: Driver name, rating, price
MEDIUM: Vehicle type, trip duration
LOW: Small metadata, timestamps
```

### Typography Contrast
- Headlines: Bold, large, dark (#333)
- Body: Regular, medium, dark (#333)
- Secondary: Regular, small, gray (#666)
- Disabled: Regular, opacity 0.5, gray

---

## 10. INTERACTION STATES

### Button States
```
Default → Hover → Active → Disabled
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Blue    Darker  Pressed  Gray
```

### Input Field States
```
Default    →  Focused    →  Filled
─────────────────────────────────────
Gray border   Blue border  Blue icon
Light bg      White bg     White bg
```

### Toggle/Checkbox States
```
☐ Unchecked  →  ☑ Checked  →  ◇ Disabled
─────────────────────────────────────
Gray          Blue          Gray
```

---

## 11. ANIMATIONS & TRANSITIONS

### Implicit Animations
- Button press: 200ms scale (0.98x) + feedback
- Input focus: 300ms border color transition
- Navigation: 300ms slide transition
- Modal appearance: 300ms slide up from bottom

### Loading States
- Spinner: Continuous rotation
- Progress bar: Smooth fill animation
- Skeleton loading: Shimmer effect (optional)

### Transition Timing
- Fast: 200ms (micro-interactions)
- Medium: 300ms (screen transitions)
- Slow: 500ms (modal open/close)

---

**Component Library:** Aber UI Kit
**Base Device:** iPhone X / 375px width
**Language:** French

