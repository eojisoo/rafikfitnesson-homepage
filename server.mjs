import http from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {join, extname, resolve} from 'node:path';
import {randomBytes, createSign} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

const root=resolve(import.meta.dirname), publicDir=join(root,'public');
await mkdir(join(root,'data'),{recursive:true});
const db=new DatabaseSync(join(root,'data','bookings.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS bookings (
 id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT UNIQUE NOT NULL,
 branch TEXT NOT NULL, product TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL,
 name TEXT NOT NULL, phone TEXT NOT NULL, amount INTEGER NOT NULL,
 status TEXT NOT NULL, expires_at INTEGER NOT NULL, payment_key TEXT,
 sheet_synced INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, paid_at TEXT
); CREATE INDEX IF NOT EXISTS slot_idx ON bookings(date,time,product,status);`);
const config=JSON.parse(await readFile(join(root,'booking-config.json'),'utf8'));
const ids=new Set();
for(const p of config.products){
 if(ids.has(p.id))throw Error(`Duplicate product id: ${p.id}`);
 ids.add(p.id);
 if(p.enabled&&(!Number.isInteger(p.amount)||p.amount<=0))throw Error(`Invalid price: ${p.id}`);
 if(p.enabled&&(!p.terms||typeof p.terms!=='string'))throw Error(`Missing product terms: ${p.id}`);
 if(p.enabled&&p.requiresSlot&&(!p.resourceId||!p.weeklySlots))throw Error(`Missing schedule: ${p.id}`);
}
for(const [column,type] of [['product_name','TEXT'],['category','TEXT']]){
 if(!db.prepare('PRAGMA table_info(bookings)').all().some(c=>c.name===column))db.exec(`ALTER TABLE bookings ADD COLUMN ${column} ${type}`);
}
const orderStmt=db.prepare('SELECT * FROM bookings WHERE order_id=?');
const json=(res,code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data))};
const error=(res,code,message)=>json(res,code,{error:message});
function seoulNow(){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());const v=Object.fromEntries(p.map(x=>[x.type,x.value]));return `${v.year}-${v.month}-${v.day}T${v.hour}:${v.minute}`}
function isOnSale(p){return p.enabled&&(!p.saleEndDate||p.saleEndDate>=seoulNow().slice(0,10))}
function available(date,product){const entry=config.products.find(p=>p.id===product&&isOnSale(p)&&p.requiresSlot&&Number.isInteger(p.amount)&&p.amount>0);if(!entry||config.closedDates?.includes(date)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)return [];
 const today=seoulNow().slice(0,10),limit=new Date(today+'T00:00:00Z');limit.setUTCDate(limit.getUTCDate()+30);if(date<today||date>limit.toISOString().slice(0,10))return [];
 const day=new Date(date+'T00:00:00Z').getUTCDay();return (entry.weeklySlots[String(day)]||[]).filter(s=>`${date}T${s.time}`>seoulNow()).map(s=>{const shared=config.products.filter(p=>p.resourceId===entry.resourceId).map(p=>p.id);
 const placeholders=shared.map(()=>'?').join(',');
 const count=db.prepare(`SELECT count(*) n FROM bookings WHERE date=? AND time=? AND product IN (${placeholders}) AND (status IN ('paid','confirming') OR (status='pending' AND expires_at>?))`).get(date,s.time,...shared,Date.now()).n;return {time:s.time,remaining:Math.max(0,s.capacity-count)}});
}
function body(req){return new Promise((resolve,reject)=>{let raw='';req.on('data',c=>{raw+=c;if(raw.length>8192){reject(new Error('요청이 너무 큽니다'));req.destroy()}});req.on('end',()=>{try{resolve(JSON.parse(raw||'{}'))}catch{reject(new Error('입력값을 확인해 주세요'))}});req.on('error',reject)})}
async function toss(path,payload){const key=process.env.TOSS_SECRET_KEY;if(!key)throw Error('결제 시크릿 키 미설정');const r=await fetch('https://api.tosspayments.com'+path,{method:payload?'POST':'GET',headers:{Authorization:'Basic '+Buffer.from(key+':').toString('base64'),'Content-Type':'application/json','Idempotency-Key':payload?.orderId||''},body:payload?JSON.stringify(payload):undefined});const data=await r.json();if(!r.ok)throw Error(data.message||'결제 승인에 실패했습니다');return data}
function b64u(v){return Buffer.from(v).toString('base64url')}
async function googleToken(){const email=process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,key=process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n');if(!email||!key)throw Error('구글시트 인증 미설정');const now=Math.floor(Date.now()/1000),header=b64u(JSON.stringify({alg:'RS256',typ:'JWT'})),payload=b64u(JSON.stringify({iss:email,scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600}));const sign=createSign('RSA-SHA256');sign.update(header+'.'+payload);const assertion=header+'.'+payload+'.'+sign.sign(key,'base64url');const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})});const data=await r.json();if(!r.ok)throw Error('구글 인증 실패');return data.access_token}
async function syncSheet(row){if(!process.env.GOOGLE_SHEET_ID)return;const token=await googleToken();const range=encodeURIComponent(`${process.env.GOOGLE_SHEET_TAB||'예약'}!A${row.id+1}:J${row.id+1}`);const values=[[row.order_id,row.branch,row.product_name||row.product,row.date,row.time,row.name,row.phone,row.amount,row.paid_at,'결제완료']];const r=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(process.env.GOOGLE_SHEET_ID)}/values/${range}?valueInputOption=RAW`,{method:'PUT',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({range:`${process.env.GOOGLE_SHEET_TAB||'예약'}!A${row.id+1}:J${row.id+1}`,majorDimension:'ROWS',values})});if(!r.ok)throw Error('구글시트 기록 실패');db.prepare('UPDATE bookings SET sheet_synced=1 WHERE id=?').run(row.id)}
async function reconcile(row,paymentKey,amount){let payment;try{payment=await toss('/v1/payments/confirm',{paymentKey,orderId:row.order_id,amount})}catch(e){try{payment=await toss('/v1/payments/'+encodeURIComponent(paymentKey))}catch{}if(payment?.status!=='DONE')throw e}
 if(payment.status!=='DONE'||payment.orderId!==row.order_id||payment.totalAmount!==row.amount)throw Error('결제 승인 정보가 일치하지 않습니다');db.prepare("UPDATE bookings SET status='paid', payment_key=?, paid_at=COALESCE(paid_at,?) WHERE id=?").run(paymentKey,new Date().toISOString(),row.id);const paid=db.prepare('SELECT * FROM bookings WHERE id=?').get(row.id);try{await syncSheet(paid)}catch(e){console.error('Sheet sync pending for order',row.order_id,e.message)}return paid}
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(req.method==='GET'&&url.pathname==='/api/config'){return json(res,200,{branch:config.branch,products:config.products.map(p=>({id:p.id,category:p.category,name:p.name,description:p.description,terms:p.terms,amount:p.amount,enabled:!!isOnSale(p),requiresSlot:!!p.requiresSlot,saleEndDate:p.saleEndDate||null})),clientKey:process.env.TOSS_CLIENT_KEY||null,privacyPolicyUrl:config.privacyPolicyUrl||null,ready:!!(process.env.TOSS_CLIENT_KEY&&process.env.TOSS_SECRET_KEY&&process.env.GOOGLE_SHEET_ID&&process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL&&process.env.GOOGLE_PRIVATE_KEY&&config.privacyPolicyUrl)})}
 if(req.method==='GET'&&url.pathname==='/api/slots')return json(res,200,{slots:available(url.searchParams.get('date')||'',url.searchParams.get('product')||'')});
 if(req.method==='POST'&&url.pathname==='/api/orders'){if(!process.env.TOSS_CLIENT_KEY||!process.env.TOSS_SECRET_KEY||!process.env.GOOGLE_SHEET_ID||!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL||(!process.env.GOOGLE_PRIVATE_KEY||!config.privacyPolicyUrl))return error(res,503,'결제·구글시트 설정 후 예약을 열 수 있습니다');const x=await body(req),product=config.products.find(p=>p.id===x.product&&isOnSale(p)&&Number.isInteger(p.amount)&&p.amount>0);
 const name=String(x.name||'').trim(),phone=String(x.phone||'').replace(/[^0-9]/g,'');
 if(!product||name.length<2||name.length>30||!/^01\d{8,9}$/.test(phone)||x.privacyConsent!==true)return error(res,400,'입력 내용을 확인해 주세요');
 if(product.requiresSlot&&(!/^\d{4}-\d{2}-\d{2}$/.test(x.date||'')||!/^\d{2}:\d{2}$/.test(x.time||'')))return error(res,400,'날짜와 시간을 선택해 주세요');
 let order;
 db.exec('BEGIN IMMEDIATE');try{
  if(product.requiresSlot){const slot=available(x.date,x.product).find(s=>s.time===x.time);if(!slot?.remaining)throw Error('선택한 시간이 마감되었습니다')}
  const orderId='RAFIK-'+randomBytes(12).toString('hex');
  db.prepare("INSERT INTO bookings(order_id,branch,product,product_name,category,date,time,name,phone,amount,status,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").run(orderId,config.branch,product.id,product.name,product.category||'상품',product.requiresSlot?x.date:'',product.requiresSlot?x.time:'',name,phone,product.amount,'pending',Date.now()+600000,new Date().toISOString());
  order={orderId,amount:product.amount,name:product.name,customerName:name,expiresAt:Date.now()+600000};db.exec('COMMIT')
 }catch(e){db.exec('ROLLBACK');return error(res,409,e.message)}
 return json(res,201,order)}
 if(req.method==='POST'&&url.pathname==='/api/confirm'){const x=await body(req),row=orderStmt.get(x.orderId);if(!row||typeof x.paymentKey!=='string'||x.paymentKey.length>200||Number(x.amount)!==row.amount)return error(res,400,'주문 정보가 일치하지 않습니다');if(row.status==='paid'){if(row.payment_key!==x.paymentKey)return error(res,409,'이미 처리된 주문입니다');return json(res,200,{status:'paid',orderId:row.order_id,sheetSynced:!!row.sheet_synced})}if(row.status==='pending'&&row.expires_at<Date.now())return error(res,409,'예약 시간이 만료됐습니다. 다시 신청해 주세요');if(row.status==='pending')db.prepare("UPDATE bookings SET status='confirming',payment_key=? WHERE id=? AND status='pending'").run(x.paymentKey,row.id);else if(row.payment_key!==x.paymentKey)return error(res,409,'결제 정보가 일치하지 않습니다');try{const paid=await reconcile(row,x.paymentKey,row.amount);return json(res,200,{status:'paid',orderId:paid.order_id,sheetSynced:!!paid.sheet_synced})}catch(e){console.error('Payment confirmation requires review',row.order_id,e.message);return error(res,502,'결제 상태를 확인 중입니다. 재결제하지 말고 매장에 문의해 주세요')}}
 if(req.method==='POST'&&url.pathname==='/api/admin/sync-sheet'){if(!process.env.ADMIN_SYNC_TOKEN||req.headers.authorization!==`Bearer ${process.env.ADMIN_SYNC_TOKEN}`)return error(res,401,'인증이 필요합니다');let synced=0;for(const row of db.prepare("SELECT * FROM bookings WHERE status='paid' AND sheet_synced=0 ORDER BY id LIMIT 100").all()){try{await syncSheet(row);synced++}catch(e){console.error('Sheet sync error',row.order_id,e.message)}}return json(res,200,{synced})}
 if(req.method==='GET'&&url.pathname==='/api/payment-status'){const row=orderStmt.get(url.searchParams.get('orderId'));if(!row)return error(res,404,'주문을 찾을 수 없습니다');return json(res,200,{status:row.status,orderId:row.order_id,sheetSynced:!!row.sheet_synced})}
 if(req.method!=='GET')return error(res,405,'허용되지 않은 요청입니다');let path=url.pathname==='/'?'/experience-booking.html':url.pathname;const target=resolve(publicDir,'.'+decodeURIComponent(path));if(!target.startsWith(publicDir+'/'))return error(res,403,'접근할 수 없습니다');try{const file=await readFile(target);res.writeHead(200,{'Content-Type':mime[extname(target)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});res.end(file)}catch{return error(res,404,'파일을 찾을 수 없습니다')}
 }catch(e){console.error(e);if(!res.headersSent)error(res,500,'서버 오류가 발생했습니다')}});
if(process.env.RAFIK_NO_LISTEN!=='1')server.listen(Number(process.env.PORT||3000),()=>console.log('Booking server listening'));
export {server,available,config,db};
