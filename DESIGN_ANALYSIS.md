# Hello Driver - Figma Design File Analysis

**File Key:** zLeplTpJokyUyuWEaI1qaH
**Analysis Date:** March 10, 2026

---

## 1. MAIN PAGES/SCREENS OVERVIEW

The design file contains a comprehensive mobile app experience for a ride-sharing platform with two main user types: **Clients (Passengers)** and **Drivers**. Below are all major screens identified in the design:

### Core Navigation Structure:
- **0. Splash Screens** (3 variations) - App launch screens
- **1. Identity Selection** - User type selection (Client vs Driver)
- **2. Authentication & Sign-up** - Multi-step registration
- **3. Home/Dashboard** - Main interface after login
- **4. Booking Flow** - Trip planning and route selection
- **5. Driver Search & Selection** - Browse available drivers and bid acceptance
- **6. Trip Details & Confirmation** - Trip information and driver confirmation
- **7. Payment** - Payment processing and method selection
- **8. Completion** - Thank you/confirmation page
- **9. Trip Status Tracking** - Real-time driver tracking and wait status
- **10. Ratings & Reviews** - Post-trip client reviews
- **11-15. Profile, History, Settings** - User management features

---

## 2. USER FLOWS

### **Flow 1: Client (Passenger) User Journey**

```
Splash Screens
  ↓
Identity Selection (Je suis: Client)
  ↓
Phone/Email Sign In
  ↓
Home/Dashboard
  ↓
Plan Trip (Lieu de départ / Select Route)
  ↓
Trip Details (Route type, estimated cost)
  ↓
Trip Search (Recherche de Driver)
  ↓
Review Driver Offers (Select Driver)
  ↓
Confirm Driver & Trip
  ↓
Payment (Payment Method Selection)
  ↓
Trip In Progress (Attente Driver / Real-time tracking)
  ↓
Trip Completion (Thank You Page / Paiement Reçu)
  ↓
Rate Driver & Write Review (Avis Client)
  ↓
Trip History
```

**Key Features:**
- Phone/Facebook/Google sign-in options
- Ability to select from multiple payment methods (Mobile Money, Debit Card)
- Promo code application
- Real-time driver tracking
- Trip history with receipt details
- Friend referral system

---

### **Flow 2: Driver User Journey**

```
Splash Screens
  ↓
Identity Selection (Je suis: Driver)
  ↓
Driver Sign-up/Registration
  ↓
Account Verification (Phone verification)
  ↓
Driver Profile Setup (Vehicle type, documents)
  ↓
Driver Dashboard
  ↓
Availability Management (Activer ma disponibilité)
  ↓
Receive Trip Requests
  ↓
Submit Bid/Offer
  ↓
Confirm Trip Acceptance
  ↓
Trip In Progress (Real-time navigation)
  ↓
Trip Completion
  ↓
Payment Receipt (Gain Details)
  ↓
Driver Profile & Earnings
  ↓
Trip History
```

**Key Features:**
- Multi-step registration with document verification (driver's license, ID)
- Vehicle type selection (TaxiGab+, Taxi classique, Gozem, Chauffeur Privé)
- Availability toggle
- Bid/pricing submission
- Earnings tracking (Détails des Gains)
- Client reviews and ratings

---

## 3. KEY COMPONENTS (Reusable UI Elements)

### **Form Elements**
- Input fields (text, password, email)
- Form text areas
- Dropdown selectors
- Phone number input with country codes
- Card number input (with CVV, cardholder name fields)
- Payment method selection cards

### **Buttons**
- Primary button (blue gradient background)
- Secondary button (outlined/gray)
- Button with icons (submit, validate, confirm)
- Floating action buttons (chat/message icon)
- Tab buttons for navigation

### **Navigation Components**
- Top navigation bar with back arrow (icons/arrow-left)
- Bottom tab bar (Home, Search, Plus button, Messages, Profile)
- Home indicator bar (iPhone X style)
- Status bar (white and black variants)

### **Icons**
- `icons/arrow-left` - Back navigation
- `icons/arrow-dropdown` - Dropdown indicator
- `icons/close` - Close/dismiss
- `icons/notification` - Notifications
- `icons/search` - Search
- `icons/settings` - Settings
- `icons/help` - Help/support
- `icons/contact` - Contacts
- `icons/money-1` - Financial/earnings
- `icons/invitefriends` - Referral/invite
- `icons/promo` - Promo codes
- `icons/trash` - Delete
- `icons/Time` - Time/schedule
- `icons/tabbar/message` - Messaging
- `icons/tabbar/Plus-white` - Add/create new
- `Iconly/Bold/Profile` - Profile picture

### **Cards & Lists**
- Driver profile cards (name, rating, photo, vehicle type)
- Trip cards (route, price, status)
- Payment method cards (Mastercard, Mobile Money, Airtel Money)
- Transaction/receipt cards
- Review/rating cards

### **Badges & Status Indicators**
- Star rating badges (1-5 stars)
- Verified user badges (5 ans de Permis B / Profil vérifié)
- Status badges (Active, Cancelled, Completed)
- Trip type badges (Course Partagée, Course Exclusive)
- Driver of the week badge (Driver de la semaine)

### **Input States**
- Default state
- Focused/active state
- Error state
- Disabled state

---

## 4. DESIGN PATTERNS

### **Color Scheme**

**Primary Colors:**
- **Blue/Cyan** (#1F90FF approximately) - Primary actions, headers, active states
- **Teal/Green** (#00D4AA approximately) - Secondary accents, selected states, highlights
- **White** (#FFFFFF) - Backgrounds, cards, text containers
- **Light Gray** (#F5F5F5) - Secondary backgrounds, disabled states
- **Dark Gray/Charcoal** (#333333, #666666) - Primary text, secondary text

**Background Patterns:**
- City skyline silhouettes (light blue gradient background on auth screens)
- Clean white card surfaces over gradient backgrounds

### **Typography**

**Font Families:** Appears to use system fonts (San Francisco for iOS)
- **Large Headers:** Bold, ~24-32px (titles like "DRIVER", "Je suis :")
- **Body Text:** Regular, ~14-16px (labels, descriptions)
- **Small Text:** Regular, ~12-14px (helper text, secondary information)
- **Button Text:** Medium/Bold, ~14-16px, white on colored background

### **Spacing & Layout**

- **Vertical padding:** Consistent 16-24px between sections
- **Horizontal padding:** 16px margin from screen edges
- **Card padding:** 16px internal padding
- **Button height:** Standard 56px (accessibility standard)
- **Component spacing:** 12-16px between form fields
- **Screen layout:** Single column mobile-first design

### **Border Radius**

- **Buttons & Cards:** 12-16px border radius
- **Input fields:** 8-12px border radius
- **Icons:** Circular (50% border radius for avatars)

### **Shadows & Elevation**

- Subtle drop shadows on cards (appears to use iOS shadow style)
- Elevated cards for interactive elements
- Minimal shadow hierarchy

### **Interactive States**

- **Hover/Active:** Color change (blue to darker blue)
- **Disabled:** Grayed out with reduced opacity
- **Loading:** Progress indicators (progress bars shown at bottom of screens)
- **Focus:** Border highlight on input fields (teal/green)

### **Consistency Patterns**

- Consistent icon styling (solid, outlined, filled variants)
- Unified button styling across all screens
- Standard input field appearance throughout
- Consistent status indicator usage
- Uniform card designs for different content types

---

## 5. SCREENS BY FEATURE

### **5.1 AUTHENTICATION & ONBOARDING**

#### Splash Screens
- **0. Splash Screens 1/3** - Initial app launch
- **0. Splash Screens 2/3** - Feature highlight
- **0. Splash Screens 3/3** - Feature highlight

#### Identity & Sign-up
- **1. Identité** - "Je suis :" (I am:) with Client/Driver selection buttons
  - Client option (person icon)
  - Driver option (car icon) - with "(TaxiGab+, Taxi classique, Gozem)" subtitle

- **1. Connexion_Client** - Client login screen
  - Phone number input
  - Email input
  - Sign-up button
  - Social login options (Facebook)

- **2. Driver Sign In** - Driver login options
  - "Créer un compte" (Create account) heading
  - Driver type dropdown
  - Name & surname fields
  - Password creation
  - Password confirmation
  - Email field
  - Disclaimer: "En continuant, vous consentez de recevoir des appels, messages Whatsapp ou SMS..."
  - Validate button

#### Phone Verification
- **2.1 bis Valider Téléphone** - Phone validation screen
- **2.2 bis Phone verification** - Additional verification step

#### Driver Registration Variants
- **2.1. Driver Sign In** - Alternative driver registration flow
- **2.2. Driver Sign In** - Additional driver sign-in variant
- **2.3. Inviter un ami Driver** - Invite friend driver prompt

#### Social Sign-In
- **1.1 Connexion_Téléphone** - Phone-based login
- **1.2 Connexion_Facebook** - Facebook login
- **1.2 Connexion_Google** - Google login

---

### **5.2 HOME/DASHBOARD**

#### Main Dashboard
- **3. Home** - Main app home screen
- **12. Dashboard** - Alternative dashboard view (likely for driver)

#### Dashboard Features
- Welcome message
- Quick action buttons
- Trip summary
- Available balance/earnings display
- Recent trips
- Notifications

---

### **5.3 BOOKING & TRIP PLANNING**

#### Trip Initiation
- **2. Lieu de départ** - Departure location selection
  - "Changer de point de départ" (Change departure point)

- **2.1 Trajet** - Trip/route planning
  - Route type selection

- **2.2 Utiliser ma position actuelle** - Use current location option

#### Trip Type & Details
- **3. Planifier Course** - Plan trip screen
  - Trip details input
  - Destination selection

- **3.1 Type de course (Pop Up)** - Trip type modal
  - Course Exclusive (Private ride)
  - Course Partagée (Shared ride)
  - Pricing display
  - "Disponibilité Optimale : Prix conseillé pour trouver rapidement un Driver"
  - "Faible Disponibilité : Très peu de chance de trouver un Driver"

#### Trip Information
- **4. Infos complémentaires** - Additional trip information
  - Additional passenger details
  - Special requests

---

### **5.4 DRIVER SEARCH & BIDDING**

#### Search & Discovery
- **5. Recherche de Driver** - Active driver search screen
  - "Votre demande à été transmise aux Drivers à proximité. Ils vont vous proposer un prix pour la course"
  - Loading/searching state

- **5.0** - Alternative search state

- **5.1 Aucun Driver** - "No drivers available" screen
  - Message: "AUCUN DRIVER DANS LA ZONE"

#### Driver Offers
- **4.1 Validation Enchère** - Bid validation screen
  - Driver offer details
  - Price breakdown
  - Accept/reject buttons

- **4.2 Enchère envoyée** - Bid sent confirmation
  - Confirmation message
  - "Le(s) Client(s) ont bien reçu la proposition de prix pour la course"

#### Driver Selection
- **6. Select Driver** - Browse and select driver
  - Driver cards with:
    - Profile photo
    - Name and rating (e.g., "Astrid, 32 ans")
    - Driver type badge
    - Vehicle type
    - Verification badges
    - Price quote
  - "Confirm Your Driver" button

---

### **5.5 TRIP CONFIRMATION**

#### Pre-Trip Screens
- **6.2_Avis Clients** - Client ratings view (drivers' reviews)
  - Display of driver ratings and reviews

- **6_Profil Driver** - Driver profile card
  - Full driver information
  - Reviews summary
  - Verification status

#### Waiting State
- **9. Attente Driver** - Waiting for driver screen
  - Map view area
  - Driver ETA
  - "En recherche de Driver" status
  - "Un Driver vous téléphonera une fois votre commande acceptée"
  - Real-time location tracking
  - Message from driver: "Camille a accepté votre offre. Dirigez-vous vers IGAD maintenant."

---

### **5.6 PAYMENT**

#### Payment Method Selection
- **4.2 Mode de Paiement** - Payment method selection
  - Credit/Debit card option
  - Mobile Money option
  - Airtel Money option
  - Default payment method display

- **4.3 Ajout Carte Bancaire** - Add bank card
  - Card number input
  - Cardholder name
  - Expiry date
  - CVV input
  - Save card option

- **4.4 Ajout Mobile Money** - Add Mobile Money
  - Provider selection
  - Account verification

#### Payment Processing
- **7. Paiement** - Payment confirmation screen
  - Trip details summary
  - Price breakdown
  - Payment method confirmation
  - "Choisir Paiement" (Choose Payment) button
  - Status: "Heure de Paiement"

#### Payment States
- **7.1 Paiement échoué** - Payment failed
  - Error message
  - Retry option

- **9.1_Paiement reçu** - Payment received confirmation
  - "Paiement Reçu !"
  - Receipt details
  - Trip reference
  - Amount paid

#### Payment Confirmation
- **8. Thank you page** - Completion screen
  - "Paiement terminé"
  - "Paiement Réussi!!"
  - "💰 Paiement effectué !"
  - Trip summary
  - Receipt/invoice option

#### Promo & Discounts
- **4.1 Code Promo** - Promo code input
  - Code entry field
  - Apply button
  - Discount preview

---

### **5.7 TRIP HISTORY & RECEIPTS**

#### History Views
- **14. Historique des courses** - Trip history list
  - All past trips
  - Trip status (completed, cancelled)
  - Date and amount

- **9_Historique des Courses** - Alternative history view

- **14.1 Reçu** - Receipt/invoice view
  - Trip ID (e.g., "Course #123", "Course #567")
  - Route details (departure, destination)
  - Duration and distance
  - Price breakdown
  - Payment info
  - "Détails Paiement"
  - "Détails des Gains" (for drivers)

#### Trip Status
- **Course Annulée** - Trip cancelled status
  - "Annulée par : Client Motif : Horaire décalé"
  - "Annulée par : Moi Motif : Retard du Client"
  - Cancellation fee information

---

### **5.8 RATINGS & REVIEWS**

#### Review Submission
- **10. Avis Client** - Post-trip client review
  - Star rating selector (1-5 stars)
  - Comment text area
  - Examples:
    - "Bon service"
  - Submit button

#### Review Display
- **6.2_Avis Clients** - View of driver's reviews
  - Driver name
  - Average rating
  - Individual reviews from passengers
  - Review text with rating

---

### **5.9 PROFILE & SETTINGS**

#### Client Profile
- **13. Profil Client** - Client profile page
  - Profile photo/avatar
  - Name display
  - Phone number
  - Email
  - Badges obtained ("Badges Obtenus")
  - Payment methods list
  - Settings options

- **6.1_Modifier les informations du profil** - Edit profile
  - Form fields for:
    - Name
    - Email
    - Phone
    - Location
    - Preferences

#### Driver Profile
- **6_Profil Driver** - Driver profile (public view)
  - Photo
  - Name and age
  - Rating/stars
  - Vehicle information
  - Verification badges
  - Bio (visible to clients)
  - Insurance info
  - Trip count

- **Modifier Profil** / **Modifier le Profil** - Driver edit profile
  - Profile information update
  - Vehicle details update

#### Driver Dashboard-Specific
- **7.1 Détails des Gains (à compléter)** - Earnings details
  - Total earnings
  - Trip breakdown
  - Commission information
  - Payout history
  - "Crédit Driver" (Driver credit)

---

### **5.10 REFERRAL & INVITATIONS**

#### Referral Program
- **11. Inviter des amis** / **2.4 Inviter des amis** - Invite friends screen
  - "Chaque parrainage vous rapporte de l'argent" (Each referral earns you money)
  - Referral link
  - Share buttons
  - Track referral earnings

- **2.3. Inviter un ami Driver** - Invite friend as driver
  - Driver-specific referral

#### Terms & Conditions
- **11.1_CGV** - Terms & Conditions page 1
- **11.2_CGV** - Terms & Conditions page 2
- **11.3_CGV** - Terms & Conditions page 3
  - Conditions Générales de Vente (CGV)
  - Privacy policy
  - Data sharing policies
  - User responsibilities
  - Cancellation and refund policies
  - Contact information

---

### **5.11 INFORMATION & EDUCATION SCREENS**

#### App Information
- **1. Présentation du service** - Service overview screen
  - Hello Driver platform description
  - How it works
  - Sign-up and access process
  - Reservation and course functionality
  - Real-time tracking info

#### Privacy & Security
- **3. Partage des données** - Data sharing policy
  - What data is shared
  - How data is protected
  - User rights
  - Data retention policy

- **📲 Mettez à jour Hello Driver !** - App update notification
  - Update prompt screen

---

## 6. ADDITIONAL OBSERVATIONS

### **Device & Platform**
- Designed for iPhone X and later
- iPhone notch accommodation (status bar, home indicator)
- Portrait orientation (mobile-first)
- Status bar handling (both light and dark variants)

### **Localization**
- **Primary Language:** French
- Screen labels, buttons, and messages are in French
- Examples:
  - "Je suis :" (I am:)
  - "Créer un compte" (Create account)
  - "Valider" (Validate)
  - "Lieu de départ" (Departure location)
  - "Recherche de Driver" (Driver search)
  - "Paiement" (Payment)

### **Key Business Features**

**For Clients:**
- Phone/Email/Social sign-up
- Trip planning with route selection
- Real-time driver bidding system
- Multiple payment methods (Card, Mobile Money, Airtel Money)
- Promo code support
- Real-time tracking
- Driver ratings and review system
- Trip history and receipts
- Friend referral program

**For Drivers:**
- Professional registration with document verification
- Vehicle type selection
- Availability toggle
- Bid submission for trip requests
- Earnings tracking and payouts
- Client review system
- Profile management

### **Technical Indicators**
- iOS-specific UI patterns (status bar, home indicator)
- Standard mobile form patterns
- Progressive disclosure (step-by-step flows)
- Real-time state management (searching, waiting, confirmed)
- Location-based services integration

---

## 7. DESIGN SYSTEM STRUCTURE

The design appears to follow a systematic component library including:

1. **Layout Components**
   - Screens/frames (standardized iPhone X dimensions)
   - Safe area considerations
   - Card-based layout patterns

2. **Form System**
   - Input fields with icon prefixes
   - Text areas for longer content
   - Dropdown selectors
   - Payment card forms

3. **Navigation System**
   - Top navigation with back button
   - Bottom tab bar
   - Breadcrumb-style progress indicators

4. **Content Components**
   - Profile cards
   - Trip cards
   - Rating components
   - Transaction cards

5. **Feedback Components**
   - Loading states
   - Error messages
   - Success confirmations
   - Status badges

---

## 8. SUMMARY

The Hello Driver design system represents a comprehensive, well-structured mobile rideshare application with:

- **Dual user flow architecture** supporting both clients and drivers
- **Transactional flow design** optimized for quick ride booking and payment
- **Trust & safety features** including ratings, reviews, and verification badges
- **Localized experience** in French for the African market
- **Mobile-first approach** with iOS platform considerations
- **Consistent visual language** using blue/cyan primary colors and clean typography
- **Progressive disclosure** in complex flows (authentication, booking, payment)
- **Accessibility considerations** with standard button sizes and readable typography

The design file demonstrates professional UI/UX patterns suitable for production implementation.

---

**End of Analysis**
