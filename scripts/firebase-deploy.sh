#!/usr/bin/env bash
# ============================================
# TokoWarung — One-time Firebase Deploy Script
# ============================================
# Jalankan dari terminal lokal (Bukan di CI/CD).
#
# Prasyarat:
#   1. Node.js 18+
#   2. npm install sudah dijalankan di root project
#   3. Anda punya akses admin ke Firebase project: tokowarung-15b64
#
# Cara pakai:
#   chmod +x scripts/firebase-deploy.sh
#   ./scripts/firebase-deploy.sh
# ============================================

set -e  # exit on first error

PROJECT_ID="tokowarung-15b64"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

echo "============================================"
echo "  TokoWarung — Firebase Deploy"
echo "  Project: $PROJECT_ID"
echo "============================================"
echo ""

# 1. Cek apakah firebase-tools ter-install
if ! command -v npx firebase &> /dev/null; then
  echo "❌ firebase-tools belum terinstall."
  echo "   Jalankan: npm install --save-dev firebase-tools"
  exit 1
fi

# 2. Login (interaktif — akan buka browser)
echo "Step 1/4: Login ke Firebase..."
echo "(Jika sudah login sebelumnya, step ini akan skip otomatis)"
npx firebase login --no-localhost || true

# 3. Set active project
echo ""
echo "Step 2/4: Set active project ke $PROJECT_ID..."
npx firebase use "$PROJECT_ID" --add

# 4. Deploy Security Rules (CRITICAL)
echo ""
echo "Step 3/4: Deploy Firestore Security Rules + Storage Rules..."
npx firebase deploy --only firestore:rules,firestore:indexes,storage

# 5. Deploy Cloud Functions (opsional — pakai jika sudah setup functions/)
read -p "Deploy Cloud Functions juga? (y/N) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "Step 4/4: Deploy Cloud Functions..."
  cd functions
  if [ ! -d "node_modules" ]; then
    echo "  Installing functions dependencies..."
    npm install
  fi
  cd "$ROOT_DIR"
  npx firebase deploy --only functions
else
  echo "⏭  Skipping Cloud Functions deploy."
fi

echo ""
echo "============================================"
echo "  ✅ DEPLOY SELESAI!"
echo "============================================"
echo ""
echo "Verifikasi di Firebase Console:"
echo "  https://console.firebase.google.com/project/$PROJECT_ID"
echo ""
echo "Firestore: https://console.firebase.google.com/project/$PROJECT_ID/firestore/rules"
echo "Storage:   https://console.firebase.google.com/project/$PROJECT_ID/storage/rules"
echo "Functions: https://console.firebase.google.com/project/$PROJECT_ID/functions"
echo ""
echo "Selanjutnya: setup Vercel auto-deploy (lihat README.md bagian Deployment)"
