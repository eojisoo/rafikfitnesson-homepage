[길동점] 매달 시간표 바꾸는 방법
1. tools/timetable-maker.html 을 열어 TIMETABLE 값을 이번 달 시간표로 수정합니다.
   - rows: ['시작 시간(24시)', ['월','화','수','목','금','토','일']] / 수업이 없는 칸은 ''
   - month: '2026년 11월'처럼 적으면 이미지 제목 옆에 표시됩니다 (비워두면 표시 안 함)
2. Git Bash에서 프로젝트 폴더로 이동한 뒤 아래 명령을 실행합니다.
     sh tools/make-timetable.sh
3. gildong-yoga.png, gildong-pilates.png 가 새로 만들어지면 커밋/푸시합니다.
   (직접 만든 이미지를 쓰려면 같은 파일명의 PNG로 덮어써도 됩니다. 가로형 7:5 비율 권장)

[천호역점] 수업 시간표 이미지를 이 폴더에 아래 파일명으로 올리면 페이지에 자동으로 표시됩니다.
(파일이 없으면 '시간표 준비 중'으로 표시됩니다. 매달 같은 파일명으로 덮어쓰면 됩니다.)
천호역점 : cheonho-yoga-barre.jpg / cheonho-pilates.jpg
