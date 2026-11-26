/** 라피끄 & 피트니스온: 신청 POST + 저장 확인 GET(JSONP). 짐스테이션 사전 등록(kind=preregister)도 함께 처리합니다.
 * 배포: 웹앱 / 실행 사용자=나 / 액세스=모든 사용자.
 * 신청 전용 시트는 비공개로 유지하세요.
 */
const PRODUCT_SPREADSHEET_ID = '12DRlN1Byk0EzaJ6cw7oslq36utIO3p2rerW_tikNkZU';
const PRIVATE_APPLICATION_SPREADSHEET_ID = '1PvDoSZdl34WWFza2rPOOHNAEJtWv7SOfOaFon31zivc';
const APPLICATION_SHEET_NAME = '등록신청';
const APPLICATION_HEADERS = ['접수일시','신청번호','지점','상품ID','상품명','신청당시가격','이름','연락처','이용희망일','개인정보동의','처리상태','확인토큰'];

function applicationSheet_() {
  const book = SpreadsheetApp.openById(PRIVATE_APPLICATION_SPREADSHEET_ID);
  let sheet = book.getSheetByName(APPLICATION_SHEET_NAME);
  if (!sheet) sheet = book.insertSheet(APPLICATION_SHEET_NAME);
  if (sheet.getLastRow() === 0) sheet.getRange(1,1,1,APPLICATION_HEADERS.length).setValues([APPLICATION_HEADERS]);
  const heads = sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0];
  if (!heads.includes('확인토큰')) sheet.getRange(1,sheet.getLastColumn()+1).setValue('확인토큰');
  return sheet;
}

// 짐스테이션 사전 등록 신청 (회원권 상품 시트와 무관한 간단 신청)
const PREREG_SHEET_NAME = '짐스테이션 사전등록';
const PREREG_HEADERS = ['접수일시','신청번호','브랜드','차수','관심 요금제','이름','연락처','연락 희망 시간','개인정보동의','처리상태','확인토큰'];
const PREREG_PLANS = ['베이직','프리미엄','시그니처','PT','상담 후 결정'];
const PREREG_ROUNDS = ['1차','2차','정상가'];
const PREREG_TIMES = ['상관없음','평일 오전','평일 오후','평일 저녁','주말'];

function preregSheet_() {
  const book = SpreadsheetApp.openById(PRIVATE_APPLICATION_SPREADSHEET_ID);
  let sheet = book.getSheetByName(PREREG_SHEET_NAME);
  if (!sheet) sheet = book.insertSheet(PREREG_SHEET_NAME);
  if (sheet.getLastRow() === 0) sheet.getRange(1,1,1,PREREG_HEADERS.length).setValues([PREREG_HEADERS]);
  return sheet;
}

function preregister_(p) {
  try {
    const requestId = String(p.requestId || '');
    const token = String(p.token || '');
    const name = String(p.name || '').trim();
    const phone = String(p.phone || '').replace(/\D/g,'');
    const plan = String(p.plan || '');
    const round = String(p.round || '');
    const time = String(p.contactTime || '');
    if (!/^[a-zA-Z0-9-]{10,100}$/.test(requestId) || !/^[a-zA-Z0-9-]{20,150}$/.test(token)) throw Error('신청번호 오류');
    if (!name || name.length > 40 || !/^01[016789][0-9]{7,8}$/.test(phone)) throw Error('신청자 정보 오류');
    if (!PREREG_PLANS.includes(plan) || !PREREG_ROUNDS.includes(round) || !PREREG_TIMES.includes(time)) throw Error('선택 항목 오류');
    if (p.consent !== 'yes') throw Error('동의 오류');
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const sheet = preregSheet_();
      const columns = headers_(sheet);
      const existing = sheet.getLastRow() > 1 ? sheet.getRange(2,columns['신청번호']+1,sheet.getLastRow()-1,1).getDisplayValues().flat() : [];
      if (existing.indexOf(requestId) === -1) {
        const safe = v => "'" + String(v).replace(/[\r\n]/g,' ');
        const record = {
          '접수일시':new Date(), '신청번호':safe(requestId), '브랜드':'짐스테이션 천호점', '차수':safe(round),
          '관심 요금제':safe(plan), '이름':safe(name), '연락처':safe(phone), '연락 희망 시간':safe(time),
          '개인정보동의':'동의', '처리상태':'신규', '확인토큰':safe(token)
        };
        const row = Array(sheet.getLastColumn()).fill('');
        for (const [key,value] of Object.entries(record)) row[columns[key]] = value;
        sheet.getRange(sheet.getLastRow()+1,1,1,row.length).setValues([row]);
        SpreadsheetApp.flush();
      }
    } finally { lock.releaseLock(); }
  } catch(err) { console.error(err); }
  return HtmlService.createHtmlOutput('<!doctype html><html><body>접수 처리 완료</body></html>');
}

function headers_(sheet) {
  const h = sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0];
  return Object.fromEntries(h.map((name,i) => [name, i]));
}

function doPost(e) {
  const p = e && e.parameter || {};
  if (p.kind === 'preregister') return preregister_(p);
  let ok = false, message = '신청 처리 중 오류가 발생했습니다.';
  try {
    const requestId = String(p.requestId || '');
    const token = String(p.token || '');
    const branch = String(p.branch || '');
    const productId = String(p.productId || '');
    const name = String(p.name || '').trim();
    const phone = String(p.phone || '').replace(/\D/g,'');
    const startDate = String(p.startDate || '');
    if (!/^[a-zA-Z0-9-]{10,100}$/.test(requestId) || !/^[a-zA-Z0-9-]{20,150}$/.test(token)) throw Error('신청번호 오류');
    if (!['gildong','cheonho'].includes(branch)) throw Error('지점 오류');
    if (!name || name.length > 40 || !/^01[016789][0-9]{7,8}$/.test(phone)) throw Error('신청자 정보 오류');
    if (p.consent !== 'yes' || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw Error('동의 또는 날짜 오류');
    const chosen = new Date(startDate + 'T00:00:00+09:00');
    const today = Utilities.formatDate(new Date(),'Asia/Seoul','yyyy-MM-dd');
    if (isNaN(chosen.getTime()) || startDate < today || chosen.getTime() > Date.now() + 366*86400000) throw Error('날짜 범위 오류');

    const source = SpreadsheetApp.openById(PRODUCT_SPREADSHEET_ID).getSheets()[0].getDataRange().getDisplayValues();
    const keys = source.shift().map(x => x.trim().toLowerCase());
    const at = key => keys.indexOf(key);
    if (['id','branch','name','price','active'].some(k => at(k)<0)) throw Error('상품 시트 열 확인 필요');
    const item = source.find(r => r[at('id')] === productId && ['all',branch].includes(r[at('branch')]) && ['TRUE','true','1','판매중','Y'].includes(r[at('active')]));
    if (!item) throw Error('현재 신청할 수 없는 상품입니다.');
    const price = Number(String(item[at('price')]).replace(/[,원\s]/g,''));
    if (!Number.isFinite(price) || price <= 0) throw Error('상품 가격 오류');

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const sheet = applicationSheet_();
      const columns = headers_(sheet);
      const existing = sheet.getLastRow() > 1 ? sheet.getRange(2,columns['신청번호']+1,sheet.getLastRow()-1,1).getDisplayValues().flat() : [];
      const index = existing.indexOf(requestId);
      if (index !== -1) {
        const oldToken = sheet.getRange(index+2,columns['확인토큰']+1).getDisplayValue();
        if (oldToken !== token) throw Error('중복 신청번호 오류');
      } else {
        const next = sheet.getLastRow()+1;
        const safe = v => "'" + String(v).replace(/[\r\n]/g,' ');
        const record = {
          '접수일시':new Date(), '신청번호':safe(requestId), '지점':safe(branch),
          '상품ID':safe(productId), '상품명':safe(item[at('name')]), '신청당시가격':price,
          '이름':safe(name), '연락처':safe(phone), '이용희망일':safe(startDate),
          '개인정보동의':'동의', '처리상태':'신규', '확인토큰':safe(token)
        };
        const row = Array(sheet.getLastColumn()).fill('');
        for (const [key,value] of Object.entries(record)) row[columns[key]] = value;
        sheet.getRange(next,1,1,row.length).setValues([row]);
        SpreadsheetApp.flush();
      }
      ok = true; message = '접수 완료';
    } finally { lock.releaseLock(); }
  } catch(err) {
    message = String(err.message || message).slice(0,120);
    console.error(err);
  }
  // POST 결과는 사용자 브라우저가 직접 신뢰하지 않고 GET 저장 조회로 검증합니다.
  return HtmlService.createHtmlOutput('<!doctype html><html><body>접수 처리 완료</body></html>');
}

function doGet(e) {
  const p = e && e.parameter || {};
  const requestId = String(p.requestId || '');
  const token = String(p.token || '');
  const callback = String(p.callback || '');
  let saved = false;
  const extra = {};
  if (p.ping === 'prereg') extra.prereg = true; // 사전 등록 기능이 배포됐는지 페이지가 확인하는 용도
  try {
    if (/^[a-zA-Z0-9-]{10,100}$/.test(requestId) && /^[a-zA-Z0-9-]{20,150}$/.test(token)) {
      const sheet = p.kind === 'preregister' ? preregSheet_() : applicationSheet_();
      const columns = headers_(sheet);
      if (sheet.getLastRow() > 1) {
        const rows = sheet.getRange(2,1,sheet.getLastRow()-1,sheet.getLastColumn()).getDisplayValues();
        saved = rows.some(r => r[columns['신청번호']] === requestId && r[columns['확인토큰']] === token);
      }
    }
  } catch(err) { console.error(err); }
  const json = JSON.stringify(Object.assign({saved}, extra));
  if (/^rafikCallback_[a-zA-Z0-9_]+$/.test(callback)) {
    return ContentService.createTextOutput(callback+'('+json+');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
