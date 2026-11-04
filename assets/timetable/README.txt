[길동점·천호역점 공통] 매달 시간표 바꾸는 방법
1. tools/timetable-maker.html 을 열어 TIMETABLE 값을 이번 달 시간표로 수정합니다.
   - gildong-yoga, gildong-pilates, cheonho-yoga, cheonho-barre, cheonho-pilates 가 각각 이미지 한 장입니다.
   - rows: ['시작 시간(24시)', ['월','화','수','목','금','토','일']] / 수업이 없는 칸은 ''
   - 강사를 함께 표시하려면 '수업명|강사' (예: '콤비리포머|김아영')
   - month: '12월'처럼 적으면 이미지 제목 옆에 표시됩니다 (비워두면 표시 안 함)
2. Git Bash에서 프로젝트 폴더로 이동한 뒤 아래 명령을 실행합니다.
     sh tools/make-timetable.sh
3. assets/timetable/ 의 PNG가 새로 만들어지면 커밋/푸시합니다.
   (직접 만든 이미지를 쓰려면 같은 파일명의 PNG로 덮어써도 됩니다.)
