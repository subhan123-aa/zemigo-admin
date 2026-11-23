# ZemiGo Admin Panel (`zemigo-admin`)

Standalone responsive **React + TypeScript + Tailwind CSS + Firebase** Admin Panel for the **ZemiGo Multi-Vendor Marketplace**, designed to share the same Firebase Authentication, Cloud Firestore, and Firebase Storage backend with the ZemiGo React Native Expo customer app.

## Quick Start

1. Copy `.env.example` to `.env` and add your Firebase credentials (accepts either `VITE_FIREBASE_*` or `EXPO_PUBLIC_FIREBASE_*` variables):
   ```bash
   cp .env.example .env
   ```
2. Install dependencies and start the development server:
   ```bash
   npm install
   npm run dev
   ```
3. Typecheck and build for production:
   ```bash
   npm run lint
   npm run build
   ```

## Shared Firestore Collections

- `orders` — Customer orders & multi-vendor `vendor_suborders` (`overall_status` / `status`, `total_amount`, `order_number`, `delivery_address`)
- `vendors` — Verified marketplace sellers (`storeName`, `categoryLabel`, `city`, `active`, `commissionRate`, `logoUrl`)
- `products` — Marketplace product catalog
- `categories` — Marketplace categories
- `banners` — Home promotional banners
- `users` — Customer & Admin profiles
- `coupons` — Promotional discount codes
- `payouts` — Vendor settlement & payout records
- `settings` — Platform commission & delivery rules
