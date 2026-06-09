#!/usr/bin/env bash
# Build the Expo web app and deploy it to Vercel (production).
# Handles two gotchas automatically:
#   1. Vercel strips any folder named `node_modules`, which is where Expo puts
#      the vendored icon fonts — so we rename it and repoint the references.
#   2. SPA routing needs a catch-all rewrite to index.html.
#
# Usage:  bash scripts/deploy-web.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "▸ Exporting web build…"
rm -rf dist
npx expo export --platform web

echo "▸ Moving vendor fonts out of node_modules (Vercel strips that folder)…"
if [ -d dist/assets/node_modules ]; then
  mv dist/assets/node_modules dist/assets/vendor-fonts
  sed -i '' 's#assets/node_modules#assets/vendor-fonts#g' dist/_expo/static/js/web/*.js
  sed -i '' 's#assets/node_modules#assets/vendor-fonts#g' dist/_expo/static/css/*.css 2>/dev/null || true
fi

echo "▸ Adding legal pages (privacy / terms)…"
cp legal/privacy-policy.html dist/privacy.html
cp legal/terms-of-service.html dist/terms.html

echo "▸ Writing SPA rewrite config…"
cat > dist/vercel.json <<'JSON'
{
  "rewrites": [
    { "source": "/privacy", "destination": "/privacy.html" },
    { "source": "/terms", "destination": "/terms.html" },
    { "source": "/((?!_expo/|assets/|favicon\\.ico|metadata\\.json|privacy\\.html|terms\\.html).*)", "destination": "/index.html" }
  ]
}
JSON

# `rm -rf dist` above wipes the Vercel project link, so restore it — otherwise
# each deploy spawns a NEW project instead of updating viewtrack-console.
echo "▸ Linking to the viewtrack-console project…"
mkdir -p dist/.vercel
cat > dist/.vercel/project.json <<'JSON'
{"projectId":"prj_wIwi7e5SLQpIxCPsaKrNEzHFIspx","orgId":"team_tjtfZ5qTwiPnO9BUnDaVOsqP","projectName":"viewtrack-console"}
JSON

echo "▸ Deploying to Vercel…"
cd dist && vercel deploy --prod --yes
