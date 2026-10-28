#!/bin/sh
# 길동점 시간표 이미지 만들기 (Git Bash에서 프로젝트 폴더 기준으로 실행: sh tools/make-timetable.sh)
# tools/timetable-maker.html 의 TIMETABLE 값으로 assets/timetable/gildong-yoga.png, gildong-pilates.png 를 만듭니다.
# 한글 경로에서는 Edge 캡처가 되지 않아 임시 폴더에 복사해서 캡처합니다.
set -e
cd "$(dirname "$0")/.."
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
[ -x "$EDGE" ] || EDGE="/c/Program Files/Microsoft/Edge/Application/msedge.exe"
TMP="$(cygpath -m "${TEMP:-/tmp}")/rafik-timetable"
mkdir -p "$TMP"
cp tools/timetable-maker.html "$TMP/maker.html"
for p in yoga pilates; do
  rm -f "$TMP/$p.png"
  "$EDGE" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=2 --window-size=1400,1000 --virtual-time-budget=2000 --screenshot="$TMP/$p.png" "file:///$TMP/maker.html?p=$p" 2>/dev/null
  cp "$TMP/$p.png" "assets/timetable/gildong-$p.png"
  echo "완료: assets/timetable/gildong-$p.png"
done
