#!/usr/bin/env sh
# Generate a 3s test video for extractFrames tests. Requires ffmpeg.
# Run from repo root: ./workers/__tests__/fixtures/generate-fake-video.sh
set -e
cd "$(dirname "$0")"
ffmpeg -f lavfi -i "color=c=blue:s=320x240:d=3" -t 3 -pix_fmt yuv420p -y fake-video.mp4
