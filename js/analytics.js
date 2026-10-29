// 방문 분석: Google 애널리틱스(GA4)로 유입 경로와 주요 행동(클릭·섹션 도달·신청 완료)을 기록합니다.
// GA4 측정 ID: analytics.google.com > 관리 > 데이터 스트림 > 웹 (G-로 시작). 비워 두면 아무것도 불러오지 않습니다.
// 이름·연락처 등 개인정보는 이벤트로 보내지 않습니다.
const ANALYTICS_CONFIG={ga4:'G-V4EM770QJB'};

(function(){
const {ga4}=ANALYTICS_CONFIG;
if(!ga4)return;
const s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(ga4);document.head.appendChild(s);
window.dataLayer=window.dataLayer||[];window.gtag=function(){dataLayer.push(arguments)};gtag('js',new Date());
// index.html에서 길동점으로 넘어올 때 원래 유입 경로(네이버, 인스타 등)를 이어 받습니다.
let ref='';try{ref=sessionStorage.getItem('rafikReferrer')||'';sessionStorage.removeItem('rafikReferrer')}catch(e){}
gtag('config',ga4,ref?{page_referrer:ref}:{});
})();

// 이벤트 기록: GA4 > 보고서 > 참여도 > 이벤트에서 확인할 수 있습니다.
function rafikTrack(name,params={}){
 if(window.gtag)gtag('event',name,Object.assign({branch:document.body.dataset.pageBranch||''},params));
}

// 버튼·링크 클릭
document.addEventListener('click',e=>{
 const el=e.target.closest('a,button');if(!el)return;
 const href=el.getAttribute('href')||'';
 if(href.startsWith('tel:'))return rafikTrack('phone_click');
 if(el.id==='naverTalk')return rafikTrack('naver_talk_click');
 if(el.classList.contains('event-cta'))return rafikTrack('event_banner_click',{label:el.textContent.trim()});
 if(el.id==='naverMapLink'||el.id==='mapFallbackLink')return rafikTrack('map_click');
 if(el.dataset.productId){const p=(typeof products!=='undefined'?products:[]).find(x=>x.id===el.dataset.productId);return rafikTrack('select_product',{product_name:p?p.name:el.dataset.productId})}
 if(el.dataset.category)return rafikTrack('membership_tab',{category:el.dataset.category});
 if(el.dataset.program)return rafikTrack('program_view',{program:el.dataset.program});
 if(el.dataset.timetable)return rafikTrack('timetable_tab',{program:el.dataset.timetable});
 if(el.id==='timetableOpen')return rafikTrack('timetable_open');
 if(el.closest('.hero-actions'))return rafikTrack('hero_cta',{label:el.textContent.trim()});
 if(el.closest('.bottom'))return rafikTrack('bottom_cta');
 if(/(^|\/)(gildong|cheonho)\.html/.test(href))return rafikTrack('branch_switch',{to:href});
},true);

// 360° 투어 조작: 투어 화면을 누르면 페이지 포커스가 iframe으로 넘어가는 것으로 감지합니다(1회).
window.addEventListener('blur',()=>{if(document.activeElement&&document.activeElement.id==='tourFrame'&&!window.rafikTourTracked){window.rafikTourTracked=true;rafikTrack('tour_interact')}});

// 섹션 도달: 방문자가 어디까지 내려 봤는지 섹션별로 1회 기록합니다.
if('IntersectionObserver'in window){const seen=new Set();const io=new IntersectionObserver(entries=>entries.forEach(en=>{if(en.isIntersecting&&!seen.has(en.target.id)){seen.add(en.target.id);rafikTrack('section_view',{section:en.target.id});io.unobserve(en.target)}}),{threshold:.35});document.querySelectorAll('main section[id]').forEach(s=>io.observe(s))}
