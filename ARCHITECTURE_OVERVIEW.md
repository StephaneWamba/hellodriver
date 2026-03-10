# Hello Driver - Application Architecture Overview

## Application Structure Map

```
┌─────────────────────────────────────────────────────────────────┐
│                    HELLO DRIVER MOBILE APP                       │
│                    (iOS - iPhone X+)                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                ┌─────────────┴─────────────┐
                │                           │
         ┌──────▼──────┐           ┌────────▼────────┐
         │   CLIENT    │           │     DRIVER      │
         │  (Passenger)│           │  (Professional) │
         └──────┬──────┘           └────────┬────────┘
                │                           │
    ┌───────────┴────────────┬──────────────┴─────────────┐
    │                        │                            │
    ▼                        ▼                            ▼
[AUTH FLOW]          [AUTH FLOW]              [VERIFICATION FLOW]
- Phone/Email        - Phone/Email           - Document Upload
- Social Login       - Social Login          - ID Verification
- OTP Verify         - OTP Verify            - License Check
                     - Driver Profile        - Phone Verify


    CLIENT FLOW                          DRIVER FLOW
    ═══════════════════════════════════════════════════════════

    ┌─────────────┐                    ┌──────────────┐
    │   SPLASH    │                    │   SPLASH     │
    │  SCREENS    │                    │   SCREENS    │
    └──────┬──────┘                    └──────┬───────┘
           │                                   │
           ▼                                   ▼
    ┌─────────────┐                    ┌──────────────┐
    │  DASHBOARD  │                    │  DASHBOARD   │
    │   (Home)    │                    │ (Earnings)   │
    └──────┬──────┘                    └──────┬───────┘
           │                                   │
           ├─► [BOOKING]                      ├─► [AVAILABILITY]
           │   - Location                      │   - Toggle Active
           │   - Destination                   │   - View Queue
           │   - Trip Type                     │
           │   - Details                       ├─► [TRIP OFFERS]
           │                                   │   - View Requests
           │                                   │   - Submit Bid
           ├─► [SEARCH]                       │   - Price Quote
           │   - Driver List                   │   - Route Map
           │   - Ratings View                  │
           │   - Availability                  ├─► [TRIP TRACKING]
           │   - Price Bids                    │   - Navigation
           │                                   │   - Client Contact
           ├─► [SELECTION]                     │   - ETA
           │   - Driver Confirm                │
           │   - Trip Confirm                  ├─► [EARNINGS]
           │                                   │   - Total Balance
           ├─► [PAYMENT]                       │   - Trip History
           │   - Method Select                 │   - Payout Schedule
           │   - Card Input                    │
           │   - Promo Code                    ├─► [PROFILE]
           │   - Confirmation                  │   - Vehicle Info
           │                                   │   - Documents
           ├─► [TRACKING]                      │   - Ratings
           │   - Real-time Map                 │   - Bio
           │   - Driver ETA                    │
           │   - Chat/Call                     └─► [SETTINGS]
           │                                       - Account
           ├─► [COMPLETION]                       - Preferences
           │   - Receipt                          - Help
           │   - Success Msg
           │   - Booking Next
           │
           ├─► [REVIEW]
           │   - Star Rating
           │   - Comment
           │   - Submit
           │
           ├─► [HISTORY]
           │   - Trip List
           │   - Receipts
           │   - Filters
           │
           ├─► [PROFILE]
           │   - Personal Info
           │   - Payment Methods
           │   - Badges
           │   - Preferences
           │
           └─► [REFERRAL]
               - Share Link
               - Invite Friends
               - Track Rewards

```

---

## Feature Set Map

```
┌─────────────────────────────────────────────────────────────┐
│                    CORE FEATURES                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ REAL-TIME    │  │   BIDDING    │  │  REPUTATION  │      │
│  │ TRACKING     │  │    SYSTEM    │  │    SYSTEM    │      │
│  ├──────────────┤  ├──────────────┤  ├──────────────┤      │
│  │ - GPS Map    │  │ - Driver      │  │ - Star       │      │
│  │ - ETA        │  │   Offers      │  │   Ratings    │      │
│  │ - Chat       │  │ - Price       │  │ - Reviews    │      │
│  │ - Call       │  │   Quotes      │  │ - Badges     │      │
│  │              │  │ - Selection   │  │ - Verification│     │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  PAYMENTS    │  │   EARNINGS   │  │ REFERRAL     │      │
│  ├──────────────┤  ├──────────────┤  ├──────────────┤      │
│  │ - Cards      │  │ - Dashboard  │  │ - Share Link │      │
│  │ - Mobile $   │  │ - Breakdown  │  │ - Rewards    │      │
│  │ - Airtel $   │  │ - Payouts    │  │ - Tracking   │      │
│  │ - Promo      │  │ - Analytics  │  │ - Commission │      │
│  │ - Receipts   │  │              │  │              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Flow Architecture

```
                          ┌──────────────┐
                          │   FIGMA      │
                          │  DESIGN      │
                          │   FILE       │
                          └──────┬───────┘
                                 │
                ┌────────────────┼────────────────┐
                │                │                │
                ▼                ▼                ▼
        ┌────────────┐   ┌────────────┐   ┌────────────┐
        │  AUTH      │   │ BOOKING    │   │  PAYMENT   │
        │  SCREENS   │   │  SCREENS   │   │  SCREENS   │
        └────┬───────┘   └────┬───────┘   └────┬───────┘
             │                │                │
             └────────────────┼────────────────┘
                              │
                    ┌─────────▼────────┐
                    │   MOBILE APP     │
                    │   (FRONTEND)     │
                    └─────────┬────────┘
                              │
                ┌─────────────┼──────────────┐
                │             │              │
                ▼             ▼              ▼
         ┌─────────┐  ┌──────────┐  ┌──────────────┐
         │ LOCAL   │  │   API    │  │  PUSH        │
         │ STORAGE │  │ REQUESTS │  │  NOTIFICATIONS
         │         │  │          │  │              │
         └─────────┘  └─────┬────┘  └──────────────┘
                            │
                    ┌───────▼──────┐
                    │   BACKEND    │
                    │   SERVICES   │
                    └───────┬──────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
   ┌─────────┐         ┌─────────┐         ┌─────────┐
   │ USER    │         │  TRIP   │         │PAYMENT  │
   │DATABASE │         │DATABASE │         │GATEWAY  │
   └─────────┘         └─────────┘         └─────────┘
```

---

## Screen Dependency Graph

```
                         SPLASH SCREENS
                              │
                              ▼
                    ┌──────────────────┐
                    │  IDENTITY SELECT │
                    │ (Client/Driver)  │
                    └────┬───────┬─────┘
                         │       │
        CLIENT FLOW ──┐   │       │   ┌── DRIVER FLOW
                      │   │       │   │
                      ▼   ▼       ▼   ▼
                   ┌────────┐  ┌────────┐
                   │ LOGIN/ │  │ LOGIN/ │
                   │  SIGNUP│  │ REGISTER
                   └────┬───┘  └───┬────┘
                        │          │
                        ▼          ▼
                    ┌─────────────────┐
                    │  VERIFICATION   │
                    │   (OTP/DOCS)    │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  PROFILE SETUP  │
                    │  (Optional)     │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  MAIN DASHBOARD │
                    └────────┬────────┘
                             │
        ┌────────────────────┼───────────────────┐
        │                    │                   │
        ▼                    ▼                   ▼
    BOOKING          TRIP DETAILS         PROFILE/
    FLOW             SCREEN              SETTINGS
        │                │                   │
        ▼                ▼                   ▼
    DESTINATION     REAL-TIME           EARNINGS
    SELECTION       TRACKING            (Driver)
        │                │                   │
        ▼                ▼                   ▼
    TRIP TYPE       TRIP STATUS         PAYMENT
    SELECTION       & PROGRESS          METHODS
        │                │
        ▼                ▼
    FIND DRIVER      TRIP COMPLETE
    (SEARCH)         & RATING
        │                │
        ▼                ▼
    SELECT DRIVER    RECEIPT VIEW
    & CONFIRM
        │
        ▼
    PAYMENT METHOD
        │
        ▼
    PAYMENT PROCESS
        │
        ▼
    PAYMENT CONFIRM
        │
        ▼
    TRIP HISTORY &
    REFERRAL
```

---

## Component Hierarchy

```
APPLICATION
│
├── LAYOUT SYSTEM
│   ├── Safe Area Handler
│   ├── Status Bar
│   ├── Navigation Bar (Top)
│   ├── Tab Bar (Bottom)
│   └── Content Area
│
├── FORM SYSTEM
│   ├── Text Input
│   ├── Phone Input
│   ├── Password Input
│   ├── Dropdown
│   ├── Textarea
│   └── Form Container
│
├── BUTTON SYSTEM
│   ├── Primary Button
│   ├── Secondary Button
│   ├── Outlined Button
│   ├── Icon Button
│   └── Tab Button
│
├── CARD SYSTEM
│   ├── Driver Card
│   ├── Trip Card
│   ├── Payment Card
│   └── Review Card
│
├── STATUS SYSTEM
│   ├── Star Rating
│   ├── Status Badge
│   ├── Verification Badge
│   └── Progress Indicator
│
├── NAVIGATION SYSTEM
│   ├── Back Button
│   ├── Tab Navigation
│   ├── Modal Sheet
│   └── Breadcrumb
│
├── FEEDBACK SYSTEM
│   ├── Loading State
│   ├── Success Toast
│   ├── Error Toast
│   └── Error Message
│
└── ICON SYSTEM
    ├── Navigation Icons
    ├── Action Icons
    ├── Feature Icons
    └── Status Icons
```

---

## User Type Comparison Matrix

```
┌─────────────────────────────────────────────────────────────┐
│ FEATURE              │    CLIENT      │       DRIVER        │
├─────────────────────────────────────────────────────────────┤
│ Sign-up              │ Phone/Email    │ Phone/Email +       │
│                      │ + Social       │ Documents           │
├─────────────────────────────────────────────────────────────┤
│ Verification         │ OTP only       │ OTP + Document      │
│                      │                │ Verification        │
├─────────────────────────────────────────────────────────────┤
│ Main Action          │ Book Trip      │ Accept Offers       │
├─────────────────────────────────────────────────────────────┤
│ Payment              │ Multiple       │ Receive Only        │
│                      │ Methods        │ (Payout)            │
├─────────────────────────────────────────────────────────────┤
│ Dashboard View       │ Upcoming Trips │ Earnings/Queue      │
├─────────────────────────────────────────────────────────────┤
│ Tracking             │ Live Driver    │ N/A (They're the    │
│                      │ Location       │ driver)             │
├─────────────────────────────────────────────────────────────┤
│ Ratings             │ Rate Driver    │ Receive Ratings     │
├─────────────────────────────────────────────────────────────┤
│ Revenue Impact      │ Pays Fare      │ Earns - 5% Comm     │
├─────────────────────────────────────────────────────────────┤
│ Key Metrics         │ Trip History   │ Earnings, Rating    │
│                     │ Spent, Rating  │ Availability        │
└─────────────────────────────────────────────────────────────┘
```

---

## Technology Stack Indicators

Based on design file analysis:

### Frontend (Designed For)
```
Platform:     iOS (iPhone X+)
Language:     Likely Swift or React Native
Framework:    Possibly UIKit or SwiftUI
State:        Redux/MobX-like patterns evident
Navigation:   Tab bar + modal/sheet patterns
```

### Backend Requirements (Inferred)
```
Authentication:   Phone OTP, OAuth integration
Real-time:        WebSocket for tracking
Payments:         Mobile Money, Airtel Money, Card processing
Database:         User, Trip, Payment, Review entities
APIs:             RESTful or GraphQL
Notifications:    Push notification system
```

### Third-party Integrations
```
Maps/Location:    GPS tracking, routing
Payment Gateway:  Multiple provider support
SMS/OTP:          Phone verification
Document Upload:  File handling, storage
Social Auth:      Facebook, Google OAuth
```

---

## State Management Flow

```
App State
├── Authentication State
│   ├── isAuthenticated
│   ├── userType (Client/Driver)
│   ├── userProfile
│   └── sessionToken
│
├── Trip State
│   ├── currentTrip
│   ├── searchingForDriver
│   ├── availableDrivers
│   ├── selectedDriver
│   └── tripHistory
│
├── Payment State
│   ├── paymentMethods
│   ├── selectedMethod
│   ├── transactionInProgress
│   └── paymentStatus
│
├── User State
│   ├── profile
│   ├── ratings
│   ├── badges
│   └── referralInfo
│
├── Notification State
│   ├── incomingOffers
│   ├── messages
│   ├── tripUpdates
│   └── systemNotifications
│
└── UI State
    ├── currentScreen
    ├── modalOpen
    ├── loadingStates
    └── errorMessages
```

---

## Business Flow Summary

```
COMMISSION MODEL:
Client pays $100 for trip
│
├─► Platform takes 5% = $5
├─► Driver receives = $95
└─► Client can use promo to reduce

REFERRAL PROGRAM:
Existing user invites friend
│
├─► Friend signs up
├─► Friend completes first trip
└─► Both users get referral bonus

DRIVER VERIFICATION:
1. Document upload (License, ID)
2. Platform verification
3. Badge awarded
4. Higher visibility in client search
5. Higher earnings potential
```

---

## Key Metrics Dashboard (Driver)

```
DRIVER DASHBOARD SHOWS:
├── Total Earnings (Lifetime)
├── This Month Earnings
├── Available Balance (Ready to payout)
├── Trip Count
├── Average Rating
├── Verification Status
├── Current Availability Status
├── Recent Trip History
└── Payout Schedule
```

---

## Key Metrics View (Client)

```
CLIENT DASHBOARD SHOWS:
├── Recent Trips
├── Total Trips
├── Favorite Drivers
├── Payment Methods
├── Available Balance (Credits/Promos)
├── Referral Earnings
├── Saved Locations
└── Account Status
```

---

**Note:** This architecture overview is based solely on the Figma design file analysis. Actual implementation may vary. Use this as a planning reference for development.
