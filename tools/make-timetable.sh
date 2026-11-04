#!/bin/sh
# 지점별 시간표 이미지 만들기 (Git Bash에서 프로젝트 폴더 기준으로 실행: sh tools/make-timetable.sh)
# tools/timetable-maker.html 의 TIMETABLE 값으로 assets/timetable/ 의 PNG를 만듭니다.
# 한글 경로에서는 Edge 캡처가 되지 않아 임시 폴더에 복사해서 캡처합니다.
set -e
cd "$(dirname "$0")/.."
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
[ -x "$EDGE" ] || EDGE="/c/Program Files/Microsoft/Edge/Application/msedge.exe"
TMP="$(cygpath -m "${TEMP:-/tmp}")/rafik-timetable"
mkdir -p "$TMP"
cp tools/timetable-maker.html "$TMP/maker.html"
# 이미지이름:세로크기 (timetable-maker.html 의 height와 같게)
for item in gildong-yoga:1000 gildong-pilates:1000 cheonho-yoga:820 cheonho-barre:1000 cheonho-pilates:1500; do
  p="${item%%:*}"
  h="${item##*:}"
  rm -f "$TMP/$p.png"
  "$EDGE" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=2 --window-size=1400,"$h" --virtual-time-budget=2000 --screenshot="$TMP/$p.png" "file:///$TMP/maker.html?p=$p" 2>/dev/null
  cp "$TMP/$p.png" "assets/timetable/$p.png"
  echo "완료: assets/timetable/$p.png"
done
