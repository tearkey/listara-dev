# Listara UsedTech + Escrow: Phase-by-Phase Implementation Roadmap

**Status:** Phase 1 Complete (Database Schema) | Phase 2 Starting (Frontend)  
**Timeline:** 8 weeks to full MVP  
**Team:** 2-3 engineers + 1 part-time moderator (by week 6)

---

## Overview

This roadmap translates strategic documents into actionable implementation phases. Each phase has clear deliverables, success metrics, and go/no-go decision gates.

### Strategic Objectives
- **Primary:** Launch UsedTech (electronics) marketplace with escrow protection
- **Secondary:** Launch Personals/Dating with romance scam prevention
- **Revenue Driver:** Escrow float + release fees (3.6% take rate vs 12.9% industry)
- **Brand Differentiator:** "Trust Through Escrow" - funds held until satisfaction confirmed

---

## Phase 1: Database Foundation (Week 1-2) ✅ COMPLETE

### Completed Deliverables

**✅ Core Escrow System**
- `escrow_transactions` table: Payment lifecycle tracking (pending → shipped → in_transit → released)
- `escrow_disputes` table: Dispute audit log with resolution workflow
- `escrow_balance` table: Daily reconciliation for accounting + float tracking
- RLS policies: Users see only their own transactions, direct inserts disabled

**✅ RPC Functions (Escrow Lifecycle)**
```
create_escrow_transaction()     - Buyer initiates purchase
escrow_mark_shipped()           - Seller confirms shipment with tracking
escrow_mark_received()          - Buyer marks received, starts inspection
escrow_confirm_satisfied()      - Buyer releases funds to seller
escrow_initiate_dispute()       - Raise concern during transaction
escrow_auto_release()           - Cron job: auto-release after 21 days
```

**✅ Electronics Category**
- 32 subcategories (laptops, phones, audio, gaming, etc.)
- Specialized indexes for condition-based queries
- `ads.condition_type` enum (pristine|excellent|good|fair|needs_repair)
- `profiles.is_electronics_seller` + sales_count + avg_rating

**✅ Dating/Personals System**
- ID verification fields: `phone_verified_at`, `id_verified_at`, `verification_status`
- `date_escrows` table: $20 hold until both parties confirm meeting
- 4 dating subcategories (Women Seeking Men, Men Seeking Women, Couples, Friends)
- RPC functions: create_date_escrow, date_confirm_met, date_dispute, date_escrow_auto_release

**Database Files:**
- `supabase/migrations/20260719000000_escrow_system.sql` (433 lines)
- `supabase/migrations/20260719000001_electronics_category.sql` (113 lines)
- `supabase/migrations/20260719000002_dating_escrow_system.sql` (416 lines)

### Success Metrics (Phase 1)
- ✅ All migrations created and tested locally
- ✅ RLS policies prevent unauthorized access
- ✅ RPC functions validate inputs and enforce business logic
- ⏳ CI passes (pending automated schema validation)
- ⏳ Deployed to dev environment (staging)

---

## Phase 2: Frontend - Buyer Checkout Flow (Week 3-4)

### Deliverables

**New Routes:**
```
/checkout/:ad_id                  - Escrow checkout page
/dashboard/escrow                 - Buyer/seller escrow dashboard
/dashboard/escrow/:escrow_id      - Transaction detail + shipping tracking
/electronics                      - UsedTech landing page
/$state/$city/electronics         - City-level electronics listings
```

**Components:**

1. **EscrowCheckout** Component
   - Displays item details (photo, title, price, seller info)
   - Shows price breakdown: Item + Commission (8%) + Escrow Fee ($2.40)
   - "Buy Now" button → Stripe/NowPayments → create_escrow_transaction RPC
   - Explains escrow guarantee: "Your money stays with us until you confirm it's perfect"
   - Handles payment processing and escrow creation

2. **EscrowDashboard** Component
   - **For Buyers:** Shows active escrows, mark received, inspect phase, confirm satisfied
   - **For Sellers:** Shows incoming escrows, mark shipped (with tracking input), awaiting confirmation
   - Timeline visual: Pending → Shipped → In Transit → Released
   - Shows escrow duration and estimated release date

3. **EscrowShippingStatus** Component
   - Seller-only view after purchase
   - "Mark as Shipped" button
   - Tracking number input (fedex, ups, usps)
   - Auto-formatted tracking links

4. **EscrowInspection** Component
   - Buyer-only view after marking received
   - "Item Received & Inspecting" status
   - Photo upload for condition verification
   - Condition rating: pristine|excellent|good|fair|damaged
   - "Confirm Satisfied" or "Raise Dispute" buttons

5. **EscrowDispute** Component
   - Reason dropdown: item_not_received | item_defective | not_as_described | seller_unresponsive
   - Evidence upload (photos/video)
   - Message thread with admin/other party
   - Shows resolution path

**API Integration Points:**
- POST /escrow/create - create_escrow_transaction RPC
- POST /escrow/mark-shipped - escrow_mark_shipped RPC
- POST /escrow/mark-received - escrow_mark_received RPC
- POST /escrow/confirm-satisfied - escrow_confirm_satisfied RPC
- POST /escrow/dispute - escrow_initiate_dispute RPC
- GET /escrow/:id - fetch transaction + related data
- GET /dashboard/escrow - list user's escrows (paginated)

**Success Metrics (Phase 2):**
- ✅ 5+ e2e tests for checkout flow (test all state transitions)
- ✅ Mobile responsive design passes lighthouse (>90 performance)
- ✅ Escrow creation rate tracked via analytics
- ⏳ First 50 transactions completed successfully
- ⏳ Zero payment failures (Stripe integration solid)
- ⏳ <5% dispute rate (trust model working)

### Implementation Checklist
- [ ] Create checkout route + EscrowCheckout component
- [ ] Integrate Stripe payment processing
- [ ] Create dashboard routes + listing components
- [ ] Implement shipping status + tracking UI
- [ ] Build inspection phase with photo upload
- [ ] Implement dispute flow with messaging
- [ ] Add e2e tests for all state transitions
- [ ] Mobile responsive testing
- [ ] Analytics tracking (escrow creation, confirmation, disputes)
- [ ] Error handling + retry logic for failed payments

---

## Phase 3: Seller Tools & Verification (Week 5-6)

### Deliverables

1. **Seller Verification Workflow**
   - Form: business name, tax ID, phone verification
   - Admin approval dashboard (manual review)
   - Approval badge displayed on listings
   - Rejection reason communicated to seller

2. **Seller Dashboard**
   - "My Electronics Listings" section
   - Pending, Active, Sold tabs
   - Stats: total sales, avg rating, response rate
   - Action buttons: relist, promote, deactivate

3. **Bulk Upload CSV**
   - Template download (title, description, price, condition, brand, model)
   - Drag-and-drop uploader
   - Auto-tagging: "iPhone 14 Pro Max" → brand: Apple, model: iPhone 14, generation: Pro Max
   - Validation: required fields, price range checks, photo requirement
   - Async processing: batch insert via background job

4. **Scheduled Posting**
   - Date/time picker: "Post these 5 ads at 6pm daily"
   - Helps distribute listings for better visibility
   - Shows posting queue and history

5. **Analytics Dashboard**
   - Views per listing (histogram by time of day)
   - Click-through rate
   - Average time to sale
   - Comparison to category average

6. **Premium Seller Tier ($9.99/mo)**
   - Unlimited listings (vs 20 free listings)
   - Bulk upload (vs manual upload only)
   - Scheduled posting
   - Analytics dashboard
   - Priority search placement

**Database Changes:**
- `seller_verifications` table: track approval workflow
- `bulk_uploads` table: track CSV import jobs + status
- `ads.boost_until` column: for promoted listings
- `profiles.listings_quota` column: limit free listings

**Success Metrics (Phase 3):**
- ✅ 50+ seller sign-ups (organic)
- ✅ 10+ verified sellers
- ✅ 500+ active listings
- ✅ 30+ bulk uploads processed successfully
- ⏳ 100+ premium tier subscribers
- ⏳ Average seller rating > 4.3 stars

---

## Phase 4: Buyer Tools & Trust Features (Week 7-8)

### Deliverables

1. **Saved Searches**
   - "Laptops under $500 in NYC, excellent condition"
   - Subscribe to alerts (daily, weekly digest)
   - Edit/delete saved searches
   - Email notification when new listing matches

2. **Price Drop Alerts**
   - Auto-detect when similar item listed cheaper
   - Example: "Same MacBook M1 dropped from $800 → $750"
   - Buyer gets notified within 24 hours

3. **Comparison Tool**
   - Side-by-side specs: brand, CPU, RAM, storage, condition, price
   - Link multiple listings to compare
   - Highlight differences

4. **Watchlist**
   - "Heart" button on listings to add to watchlist
   - Weekly email digest: "5 new items in your watchlist"
   - Auto-remove sold items

5. **Seller Ratings UI**
   - Display on seller profile: "4.8★ (250 sales)"
   - Show on each listing: "Sold by Jane (4.8★ 125 sales)"
   - Ratings badge prevents scammers (can't hide bad history)

6. **Condition Guides**
   - Photo gallery: "What is Excellent condition?"
   - Example photos for each condition level
   - FAQ: "Can I return if condition isn't as described?"

**Database Changes:**
- `saved_searches` table: user + search params (JSONB)
- `watchlist` table: user + ad_id + added_at
- Add condition level examples to category metadata

**Success Metrics (Phase 4):**
- ✅ 25%+ repeat buyer rate (users buying 2+ electronics)
- ✅ Saved searches/watchlist adoption > 30%
- ✅ Avg time to sale < 7 days (vs Craigslist 10+ days)
- ⏳ Mobile traffic > 65%
- ⏳ NPS > 50 (customer satisfaction)

---

## Phase 5: Premium Features & Scale (Weeks 9-12)

### Deliverables

1. **Condition Verification Service** ($9.99)
   - Professional inspection before buyer inspection
   - Photos + condition report PDF
   - Sellers opt-in for competitive advantage
   - Reduces disputes by ~40%

2. **Extended Inspection Window** ($4.99)
   - Default 14 days → buyer wants 30 days
   - Seller explicitly accepts extended hold
   - Shows seller commitment to trust

3. **Seller Insurance** (Seller pays $2-5)
   - Covers accidental damage claims
   - Protects against false buyer claims
   - Reduces seller refund requests by 60%

4. **Auto-Release Improvements**
   - Day 14 after shipment: notify seller of auto-release
   - Prevent indefinite holds
   - Seller can appeal if buyer not responding

5. **Admin Dispute Resolution Dashboard**
   - Queue of active disputes
   - Evidence viewer (photos, messages)
   - Automated recommendation (AI suggests refund/replace/close)
   - Admin approval + reason
   - Notification to both parties

**Success Metrics (Phase 5):**
- ✅ 5%+ adoption of premium features (per transaction)
- ✅ Dispute resolution SLA: < 48 hours average
- ✅ Admin efficiency: 1 mod per 500 users
- ⏳ Revenue model on track ($540k Year 1 projection)

---

## Phase 6: Dating MVP (Week 9-12, parallel with Phase 5)

### Deliverables

1. **ID Verification Flow**
   - Phone number verification (SMS code)
   - Photo ID upload + liveness detection (AWS Rekognition)
   - Selfie comparison (face matching)
   - Verification status badge on profile

2. **Dating Profile Creation**
   - Name, age, bio, interests
   - Photo requirements (multiple photos mandatory)
   - Verification status badge
   - "Meet Count" + rating visible after first confirmed date

3. **Date Proposal Flow**
   - Browse verified profiles
   - Click "Request a Date"
   - $20 escrow hold until confirmed
   - Both users agree on date/time

4. **Meet Confirmation UI**
   - "I met them & they are who they said they are" button
   - Photo upload for proof (optional)
   - Rating from date partner (communication, safety, would_date_again)
   - Both confirm → funds released as credits

5. **Dispute Flow**
   - "They're not who they said" → report fake profile
   - Evidence upload (photos, video call)
   - Admin review + account flag
   - Refund issued if verified fake

**Launch Strategy:**
- Beta in 3 metros: NYC, LA, Austin
- Manual profile review (catch catfish early)
- Heavy moderation (dating = higher-risk)

**Success Metrics (Phase 6):**
- ✅ 100+ verified dating profiles
- ✅ 50+ confirmed dates (month 1 beta)
- ✅ 0% catfish reports on verified profiles
- ✅ NPS > 6 for dating feature
- ⏳ Expand to 20 cities (month 2)
- ⏳ $46.6k annual revenue (long-term)

**Go/No-Go Criteria (30-day beta):**
- **GO if:** 100+ profiles + 50+ dates + 0% catfish + NPS > 6
- **NO-GO if:** <30 profiles OR fraud rate >5% OR moderation cost unsustainable

---

## Daily/Weekly Check-ins

### Metrics Dashboard (Real-time)

```
PLATFORM HEALTH:
  Total Escrow Held:              $XXX,XXX
  Active Escrow Transactions:     XXX
  Daily New Escrows:              XXX
  Avg Hold Time:                  7.3 days
  
USEDTECH METRICS:
  Active Listings:                XXX
  Verified Sellers:               XXX
  Monthly Transactions:           XXX
  Avg Transaction Value:          $XXX
  Dispute Rate:                   X.X%
  Avg Seller Rating:              4.X★
  Repeat Buyer Rate:              X%
  
DATING METRICS (Post-Launch):
  Verified Profiles:              XXX
  Confirmed Dates:                XXX
  Date Confirmation Rate:         XX%
  Catfish Catch Rate:             X%
  
REVENUE:
  Escrow Float Earned:            $X,XXX
  Release Fees (2%):              $X,XXX
  Premium Features:               $X,XXX
  Total MRR:                      $X,XXX
```

### Decision Gates

| Gate | Timing | Criteria | Action |
|------|--------|----------|--------|
| **Phase 2 Pass** | End of Week 4 | <5% payment failures, 50 txns, zero escrow bugs | → Proceed to Phase 3 |
| **Seller Adoption** | End of Week 6 | 10+ verified sellers, 500+ listings | → Green light Phase 4 |
| **Buyer Satisfaction** | End of Week 8 | 25%+ repeat rate, NPS > 40 | → Proceed to Phase 5 |
| **Dating Beta** | Day 30 | 100+ profiles, 50+ dates, 0% catfish, NPS > 6 | → Expand vs Pivot |
| **Revenue Validation** | Month 3 | $5k+ MRR, unit economics positive | → Scale aggressively |

---

## Technical Debt & Risks

### Pre-Phase 2 Blockers
1. **Stripe Integration** - Escrow requires holds, not immediate charges
   - Solution: Stripe Marketplace model (separate seller accounts)
   - Timeline: 2 weeks
   - Risk: Regulatory (money transmission) - need legal review

2. **Auto-Release Cron** - Needs Supabase pg_cron or external job queue
   - Solution: Use Supabase pg_cron extension (already enabled)
   - Timeline: 1 day
   - Risk: Low

3. **Payment Processing** - Holding customer funds requires trust
   - Solution: Partner with Stripe (licensed) or get Money Transmitter License
   - Timeline: 2-3 weeks legal review
   - Risk: Medium (regulatory)

### Operational Risks
1. **Dispute Overhead** - Disputes need human judgment
   - Mitigation: Create SOP + AI-powered recommendations
   - Budget: 1 mod per 500 users

2. **Fraud Detection** - Especially for dating (fake profiles)
   - Mitigation: AWS Rekognition for face matching
   - Cost: $0.001 per image

3. **Float Accounting** - Daily reconciliation required
   - Mitigation: Daily `escrow_balance` reconciliation cron
   - Criticality: High (IRS compliance)

---

## Success Criteria Summary

**90-Day Target (End of Phase 4):**
- 1,000+ active electronics listings
- 300+ monthly transactions
- $100k+ concurrent escrow held
- 100+ verified sellers
- 25%+ repeat buyer rate
- Dating beta: 100+ profiles, 50+ dates

**Year 1 Revenue Target:**
- $540k (UsedTech $493k + Dating $46k)
- $15M GMV
- 3.6% take rate (lower than competitors due to float)
- Positive unit economics by Month 3

---

## Next Steps (This Week)

1. **Code Review** - PR #4 with all Phase 1 migrations
2. **Deployment** - Apply migrations to dev/staging
3. **Frontend Start** - Begin Phase 2 (checkout flow)
4. **Payment Setup** - Stripe Marketplace integration
5. **Community** - Recruit first 50 electronics sellers for beta

**Estimated Time:** 8 weeks to full MVP  
**Team:** 2-3 engineers + 1 moderator (week 6+)  
**Budget:** TBD (Stripe/AWS/hosting costs grow with escrow volume)

---

**Document Version:** 1.0  
**Last Updated:** 2026-07-19  
**Owner:** Tanveer Rahat / Techtrick Technologies  
**Status:** In Progress (Phase 2 Starting)
