#!/usr/bin/env bash
# ============================================
# TokoWarung — Brand Migration Script
# Ubah semua "TokoWarung" → "TokoWarung" di codebase
# ============================================
# Process:
# 1. "TokoWarung" → "TokoWarung"
# 2. "TokoWarung" → "TokoWarung"
# 3. "tokowarung.com" → "tokowarung.com"
# 4. "tokowarung" → "tokowarung" (lowercase, e.g., localStorage key, folder name)
# 5. Logo split: "Toko<span>Warung</span>" → "Toko<span>Warung</span>"
# 6. Logo split (separate text): "TOK" + "Online" → "Toko" + "Warung"
# 7. aria-label: "TokoWarung home" → "TokoWarung home"
# ============================================

set -e

cd /home/z/my-project

echo "=== Brand migration: TokoWarung → TokoWarung ==="
echo ""

# File patterns to update
INCLUDE_DIRS="src/ functions/ scripts/ public/"
INCLUDE_FILES="index.html vite.config.js firebase.json firestore.rules storage.rules firestore.indexes.json vercel.json package.json .env.example README.md DEPLOYMENT.md worklog.md"

# Excluded: node_modules, dist, skills, download (build artifacts, not source)

# Create list of files to update
ALL_FILES=$(find $INCLUDE_DIRS -type f \( -name "*.js" -o -name "*.css" -o -name "*.html" -o -name "*.json" -o -name "*.rules" -o -name "*.md" -o -name "*.sh" -o -name "*.mjs" -o -name "*.svg" \) 2>/dev/null | grep -v node_modules)
for f in $INCLUDE_FILES; do
  [ -f "$f" ] && ALL_FILES="$ALL_FILES $f"
done

echo "Files to process:"
echo "$ALL_FILES" | tr ' ' '\n' | sort -u | head -30
echo "..."
echo "Total: $(echo "$ALL_FILES" | tr ' ' '\n' | sort -u | wc -l) files"
echo ""

# Apply replacements to all files
for f in $ALL_FILES; do
  [ -f "$f" ] || continue
  # 1. TokoWarung → TokoWarung (drop the .com — brand doesn't need it)
  sed -i 's/TokoWarung\.com/TokoWarung/g' "$f"
  # 2. TokoWarung → TokoWarung (catch-all for capital case)
  sed -i 's/TokoWarung/TokoWarung/g' "$f"
  # 3. tokowarung.com → tokowarung.com
  sed -i 's/tokowarung\.com/tokowarung.com/g' "$f"
  # 4. tokowarung → tokowarung (lowercase, e.g., localStorage keys, folder names)
  sed -i 's/tokowarung/tokowarung/g' "$f"
  # 5. Logo split HTML: Toko<span>Warung</span> → Toko<span>Warung</span>
  sed -i 's/TOK<span>Online<\/span>/Toko<span>Warung<\/span>/g' "$f"
done

echo "=== Bulk replacements done ==="
echo ""

# Now handle the buyer-header logo in components/ui.js (separate text values)
echo "=== Handle buyer-header logo (components/ui.js) ==="
if [ -f src/components/ui.js ]; then
  # Change "text: 'TOK'" → "text: 'Toko'"
  sed -i "s/text: 'TOK'/text: 'Toko'/g" src/components/ui.js
  # Change "text: 'Online'" → "text: 'Warung'" (only in buyer-header context)
  # But careful — there might be other "text: 'Online'" in other contexts
  # Let's check first
  grep -n "text: 'Online'" src/components/ui.js || echo "(no other 'text: Online' found — safe to replace)"
  sed -i "s/text: 'Online'/text: 'Warung'/g" src/components/ui.js
  # Also fix aria-label if it says 'TokoWarung home' (already replaced by bulk, but verify)
  echo "After replacement:"
  grep -n "Toko\|Warung\|logo" src/components/ui.js | head -10
fi

echo ""
echo "=== Done. Verify no TokoWarung references remain ==="
REMAIN=$(grep -rin "tokowarung\|TOK Online\|TOK-Online" --include="*.js" --include="*.css" --include="*.html" --include="*.json" --include="*.rules" --include="*.md" --include="*.sh" --include="*.mjs" --include="*.svg" . 2>/dev/null | grep -v "node_modules\|/dist/\|/skills/\|/download/\|package-lock" || true)
if [ -z "$REMAIN" ]; then
  echo "✅ No 'TokoWarung' references remain in source code!"
else
  echo "⚠️  Still found references:"
  echo "$REMAIN"
fi
