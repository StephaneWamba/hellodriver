# Hello Driver - Design Quick Reference Guide

## Screen Inventory by Feature Category

### AUTHENTICATION & ONBOARDING (10 screens)
| Screen | Purpose | Key Elements |
|--------|---------|--------------|
| 0. Splash Screens (x3) | App launch sequence | Branding, feature highlights |
| 1. Identité | User type selection | Client/Driver choice buttons |
| 1. Connexion_Client | Client login | Phone, email, social login |
| 2. Driver Sign In | Driver registration | Multi-field form, validation |
| 2.1 bis Valider Téléphone | Phone OTP verification | Code entry, resend option |
| 2.2 bis Phone verification | Secondary verification | Additional verification step |
| 1.1 Connexion_Téléphone | Phone login variant | Focused phone input |
| 1.2 Connexion_Facebook | Facebook OAuth | Social login integration |
| 1.2 Connexion_Google | Google OAuth | Social login integration |

### HOME & DASHBOARD (2 screens)
| Screen | Purpose | Key Elements |
|--------|---------|--------------|
| 3. Home | Client dashboard | Notifications, quick actions, trip summary |
| 12. Dashboard | Driver dashboard | Earnings, availability toggle, recent trips |

### BOOKING FLOW (5 screens)
| Screen | Purpose | Key Elements |
|--------|---------|--------------|
| 2. Lieu de départ | Select departure | Location input, use current location |
| 2.1 Trajet | Select route | Route type selector |
| 3. Planifier Course | Trip details | Destination, details input |
| 3.1 Type de course | Trip type modal | Exclusive vs Shared, pricing |
| 4. Infos complémentaires | Additional info | Extra passenger details, notes |

### DRIVER SEARCH & OFFERS (5 screens)
| Screen | Purpose | Key Elements |
|--------|---------|--------------|
| 5. Recherche de Driver | Search in progress | Loading state, "offers incoming" message |
| 5.0 | Alt search state | Search variant |
| 5.1 Aucun Driver | No drivers alert | "No drivers in zone" message |
| 4.1 Validation Enchère | Review driver offer | Price details, accept/reject |
| 4.2 Enchère envoyée | Offer sent | Confirmation message |

### DRIVER SELECTION (3 screens)
| Screen | Purpose | Key Elements |
|--------|---------|--------------|
| 6. Select Driver | Browse drivers | Driver cards (photo, rating, price) |
| 6_Profil Driver | Driver profile | Full driver info, reviews, verification |
| 9. Attente Driver | Wait screen | Real-time tracking, driver status |

### PAYMENT (6 screens)
| Screen | Purpose | Key Elements |
|--------|---------|--------------|
| 4.2 Mode de Paiement | Payment method | Card, Mobile Money, Airtel options |
| 4.3 Ajout Carte Bancaire | Add card | Card form, CVV, cardholder name |
| 4.4 Ajout Mobile Money | Add Mobile Money | Provider selection |
| 4.1 Code Promo | Promo code | Code entry, discount preview |
| 7. Paiement | Confirm payment | Trip summary, price, pay button |
| 7.1 Paiement échoué | Payment error | Error message, retry option |

### TRIP COMPLETION (3 screens)
| Screen | Purpose | Key Elements |
|--------|---------|--------------|
| 9.1_Paiement reçu | Payment confirmed | Receipt, trip summary |
| 8. Thank you page | Trip complete | Success message, receipt option |
| 10. Avis Client | Leave review | Star rating, comment textarea |

### HISTORY & DETAILS (3 screens)
| Screen | Purpose | Key Elements |
|--------|---------|--------------|
| 14. Historique des courses | Trip history | List of past trips, status, amount |
| 14.1 Reçu | Receipt/Invoice | Trip details, breakdown, receipt |
| 9_Historique des Courses | Alt history | History variant |

### PROFILE & SETTINGS (5 screens)
| Screen | Purpose | Key Elements |
|--------|---------|--------------|
| 13. Profil Client | Client profile | Avatar, info, badges, payment methods |
| 6.1_Modifier les informations du profil | Edit profile | Profile form fields |
| 6.2_Avis Clients | View reviews | Driver ratings and client reviews |
| Modifier Profil | Driver edit | Update driver info |
| 7.1 Détails des Gains | Earnings breakdown | Total earned, trip breakdown, payouts |

### REFERRAL & LEGAL (5 screens)
| Screen | Purpose | Key Elements |
|--------|---------|--------------|
| 11. Inviter des amis | Referral program | Share link, referral benefits |
| 2.3. Inviter un ami Driver | Driver invite | Driver-specific referral |
| 2.4 Inviter des amis | Alt referral | Referral variant |
| 11.1_CGV / 11.2_CGV / 11.3_CGV | Terms & Conditions | Legal text, policies, contact |

### INFORMATIONAL SCREENS (2 screens)
| Screen | Purpose | Key Elements |
|--------|---------|--------------|
| 1. Présentation du service | Service overview | Platform description, how it works |
| 3. Partage des données | Privacy policy | Data handling, security info |

---

## Color Palette

| Color | Hex (approx) | Usage |
|-------|-------------|-------|
| Primary Blue | #1F90FF | Buttons, headers, active states, links |
| Teal/Mint Green | #00D4AA | Accents, highlights, selected states |
| White | #FFFFFF | Backgrounds, cards, light text containers |
| Light Gray | #F5F5F5 | Secondary background, disabled states |
| Dark Gray | #333333 | Primary text, dark elements |
| Medium Gray | #666666 | Secondary text, borders |
| Success Green | #2ECC71 | Positive states (optional) |
| Error Red | #E74C3C | Error states (optional) |

---

## Core UI Components

### Inputs
- Text input (default, focused, error states)
- Phone input with country code
- Dropdown selector
- Textarea (for comments, reviews)
- Payment card input form

### Buttons
- Primary button (solid blue, 56px height)
- Secondary button (outlined, gray)
- Icon buttons (navigation, actions)
- Tab buttons

### Navigation
- Top back button (arrow-left icon)
- Bottom tab bar (5 tabs)
- Status bar (iOS style)
- Home indicator

### Cards
- Driver card (photo, name, rating, price)
- Trip card (route, status, price)
- Payment method card (logo, last 4 digits)
- Review/rating card

### Icons
- Navigation: arrow-left, arrow-dropdown, close
- Actions: search, settings, help, contact
- Features: notification, money, invite, promo, trash, time
- Tabbar: message, plus button

### Status Elements
- Star ratings (1-5 stars)
- Verification badges
- Status indicators (Active, Cancelled, etc.)
- Trip type badges (Exclusive, Shared)
- Progress indicators

---

## Typography System

| Element | Size | Weight | Color | Usage |
|---------|------|--------|-------|-------|
| Large Header | 24-32px | Bold | Dark Gray (#333) | Screen titles |
| Body Text | 14-16px | Regular | Dark Gray (#333) | Main content |
| Small Text | 12-14px | Regular | Medium Gray (#666) | Helper text |
| Button Text | 14-16px | Medium/Bold | White | Button labels |
| Labels | 12-14px | Medium | Dark Gray (#333) | Form labels |
| Caption | 11-13px | Regular | Light Gray | Secondary info |

---

## Spacing Guidelines

| Element | Spacing |
|---------|---------|
| Screen edge padding | 16px |
| Section spacing | 24px |
| Component spacing | 12-16px |
| Button height | 56px |
| Card padding | 16px |
| Icon size | 20-24px (standard), 32-40px (large) |

---

## Key Interaction Patterns

### Authentication Flow
1. Identity selection (Client/Driver)
2. Credential entry (phone/email/social)
3. OTP verification
4. Profile setup
5. Dashboard

### Booking Flow
1. Trip destination entry
2. Trip type selection
3. Driver search
4. Driver offer review
5. Driver selection
6. Payment

### Payment Flow
1. Payment method selection
2. Confirm amount and details
3. Process payment
4. Confirmation screen
5. Receipt generation

### Review Flow
1. Star rating selection
2. Comment entry
3. Submit review
4. Confirmation

---

## Localization Notes

- **Language:** French
- **Regional Considerations:** African market (Gabon region)
- **Payment Methods:** Mobile Money, Airtel Money, Credit Cards
- **Vehicle Types:** TaxiGab+, Taxi classique, Gozem, Chauffeur Privé

---

## Platform Specifications

- **Target Device:** iPhone X and later
- **Orientation:** Portrait
- **Safe Area:** Notch accommodation at top
- **Home Indicator:** Handled at bottom
- **Status Bar:** Light and dark variants
- **Resolution:** Designed for iPhone 6+ baseline (375px width)

---

## File Structure Summary

- **Total Screens:** ~50+ unique screens
- **Component Library:** Aber UI Kit (based on metadata)
- **Design Patterns:** iOS-native patterns
- **Navigation Model:** Tab bar + modal flows
- **State Management:** Loading, success, error, confirmation states

---

## Key Business Flows Supported

1. **Client Onboarding & Booking** - Sign up → Book trip → Pay → Rate
2. **Driver Registration & Earnings** - Sign up → Verify → Accept trips → Earn
3. **Payment Processing** - Method selection → Confirmation → Receipt
4. **Reputation System** - Ratings → Reviews → Profile badges
5. **Referral Program** - Invite → Tracking → Rewards

---

**File Key:** zLeplTpJokyUyuWEaI1qaH
**Analysis Date:** March 10, 2026
