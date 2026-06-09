#!/usr/bin/env bash
# Extract the exact frame for each AI-detected overlay and upload it so the
# console's overlay slider shows real screenshots.
#
#   bash scripts/overlay-frames.sh <video_id> <video_url>
#   e.g. bash scripts/overlay-frames.sh tiktok_tiktok_manuprays_764916... "https://www.tiktok.com/@manuprays/video/764916..."
#
# Needs: yt-dlp, ffmpeg, jq (brew install yt-dlp ffmpeg jq), .env with the
# Supabase keys, and an admin login (override via ADMIN_EMAIL / ADMIN_PASSWORD).
# Frames land in the public overlay-frames bucket at <video_id>/<seconds>.jpg —
# the app derives those URLs from overlay timestamps, so no DB write is needed.
set -euo pipefail
cd "$(dirname "$0")/.."

VIDEO_ID="${1:?usage: overlay-frames.sh <video_id> <video_url>}"
VIDEO_URL="${2:?usage: overlay-frames.sh <video_id> <video_url>}"
ADMIN_EMAIL="${ADMIN_EMAIL:-demo.support@mtp.app}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-mtp-demo-1234}"

set -a; source .env; set +a
URL="$EXPO_PUBLIC_SUPABASE_URL"
ANON="$EXPO_PUBLIC_SUPABASE_ANON_KEY"

echo "▸ Signing in as $ADMIN_EMAIL…"
TOKEN=$(curl -s -X POST "$URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" | jq -r '.access_token // empty')
[ -n "$TOKEN" ] || { echo "login failed"; exit 1; }

echo "▸ Reading overlay timestamps for $VIDEO_ID…"
TIMESTAMPS=$(curl -s "$URL/rest/v1/video_analyses?video_id=eq.$VIDEO_ID&select=analysis" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" \
  | jq -r '.[0].analysis.textOverlays[]?.timestamp // empty' | sort -u)
[ -n "$TIMESTAMPS" ] || { echo "no textOverlays found for that video — analyze it first"; exit 1; }

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
echo "▸ Downloading video…"
yt-dlp -q --no-warnings -f "mp4/best" -o "$WORK/video.mp4" "$VIDEO_URL"

for TS in $TIMESTAMPS; do
  MIN="${TS%%:*}"; SEC="${TS##*:}"
  S=$((10#$MIN * 60 + 10#$SEC))
  # +0.5s so the overlay has actually rendered by the captured frame
  ffmpeg -v error -ss "$S.5" -i "$WORK/video.mp4" -frames:v 1 -vf scale=480:-2 -q:v 4 "$WORK/$S.jpg" -y
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$URL/storage/v1/object/overlay-frames/$VIDEO_ID/$S.jpg" \
    -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: image/jpeg" -H "x-upsert: true" --data-binary "@$WORK/$S.jpg")
  echo "  frame $TS → upload $CODE"
done
echo "✓ Done — overlay slider for $VIDEO_ID now shows real frames."
