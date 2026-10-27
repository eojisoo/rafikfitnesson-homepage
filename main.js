// 공통 기능: 센터 투어, 구글시트 상품 목록, 신청 모달
// 지점은 각 페이지의 <body data-branch="..."> 값으로 정합니다.

// 지점별 실제 투어 URL 입력 시 iframe으로 표시됩니다. 외부 URL은 https만 허용합니다.
const BRANCH_CONFIG = {
  cheonho: { name: '천호역점', tourUrl: '' },
  gildong: {
    name: '길동점',
    tourUrl: 'https://momento360.com/e/u/200180640db74212a0bdf27927157d54?heading=0&pitch=0&field-of-view=75&size=medium&display-plan=true&wheel=false'
  }
};

// 구글시트 '웹에 게시' CSV 주소 (필수 열: id, branch, category, name, price, active)
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ62Y06eHzdAWQaeszEGquKBpiGXq87Y4tYpmO7AZT9I1LuddaFzkNKSAs8toPEb8T8BUbj_mx_U0hs/pub?output=csv';

const ACTIVE_VALUES = ['TRUE', 'true', '1', '판매중', 'Y'];

const branch = BRANCH_CONFIG[document.body.dataset.branch]
  ? document.body.dataset.branch
  : 'gildong';

let category = 'all';
let products = [];
let selectedProduct = null;


// -----------------------------------
// 상품 목록
// -----------------------------------

function csvParse(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (c === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some(v => v.trim())) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += c;
    }
  }

  row.push(cell);
  if (row.some(v => v.trim())) rows.push(row);

  return rows;
}

function parseSheetPrice(value) {
  const cleaned = String(value ?? '').replace(/[,원\s₩]/g, '');
  return cleaned ? Number(cleaned) : NaN;
}

async function loadProducts() {
  const notice = document.getElementById('productNotice');

  try {
    const response = await fetch(SHEET_CSV_URL, { cache: 'no-store' });
    if (!response.ok) throw Error('HTTP ' + response.status);

    const rows = csvParse(await response.text());
    if (!rows.length) throw Error('빈 CSV');

    const headers = rows
      .shift()
      .map(x => x.replace(/^﻿/, '').trim().toLowerCase());

    const required = ['id', 'branch', 'category', 'name', 'price', 'active'];
    if (!required.every(h => headers.includes(h))) throw Error('필수 열 누락');

    products = rows
      .map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] || '').trim()])))
      .filter(x => {
        const price = parseSheetPrice(x.price);
        return x.id && x.name && Number.isFinite(price) && price > 0;
      })
      .map(x => ({
        id: x.id,
        name: x.name,
        cat: x.category,
        branch: x.branch,
        price: parseSheetPrice(x.price),
        tag: x.tag || x.category,
        description: x.description || '',
        active: ACTIVE_VALUES.includes(x.active)
      }));

    notice.textContent = '가격 및 이용 조건을 확인해 주세요. 온라인 결제 대신 등록 신청을 받습니다.';
  } catch (err) {
    console.error('상품 목록 오류:', err);
    products = [];
    notice.textContent = '회원권 정보를 불러오지 못했습니다. 잠시 후 다시 시도하시거나 센터로 문의해 주세요.';
  }

  render();
}

function isAvailable(p) {
  return p.active && (p.branch === 'all' || p.branch === branch);
}

function formatPrice(p) {
  return typeof p.price === 'number'
    ? p.price.toLocaleString('ko-KR') + '원'
    : p.price;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function render() {
  const shown = products.filter(p =>
    isAvailable(p) && (category === 'all' || p.cat === category)
  );

  const list = document.getElementById('products');

  list.innerHTML = shown.length
    ? shown.map(p => `<article class="card"><span class="badge">${escapeHtml(p.tag || 'MEMBERSHIP')}</span><h3>${escapeHtml(p.name)}</h3><div class="price">${escapeHtml(formatPrice(p))}</div><p>${escapeHtml(BRANCH_CONFIG[branch].name)} · ${escapeHtml(p.description || '상세 이용 조건은 상담 시 안내드립니다')}</p><button type="button" data-product-id="${escapeHtml(p.id)}">등록 신청 ↗</button></article>`).join('')
    : '<p>현재 표시할 상품이 없습니다.</p>';

  list.querySelectorAll('[data-product-id]').forEach(btn =>
    btn.addEventListener('click', () => openProduct(btn.dataset.productId))
  );
}

document.querySelectorAll('[data-category]').forEach(tab =>
  tab.addEventListener('click', () => {
    category = tab.dataset.category;
    document.querySelectorAll('[data-category]').forEach(t =>
      t.classList.toggle('active', t === tab)
    );
    render();
  })
);


// -----------------------------------
// 신청 모달
// -----------------------------------

function openProduct(id) {
  selectedProduct = products.find(p => p.id === id && isAvailable(p));
  if (!selectedProduct) return;
  openModal(selectedProduct.name, formatPrice(selectedProduct));
}

function openModal(name, price) {
  const dialog = document.querySelector('#modal .dialog');
  if (dialog) dialog.classList.remove('application-complete');

  const success = document.getElementById('applicationSuccess');
  if (success) success.hidden = true;

  document.getElementById('modalTitle').textContent = name;
  document.getElementById('modalPrice').textContent = price;
  document.getElementById('purchaseBranch').textContent = '이용 지점: ' + BRANCH_CONFIG[branch].name;
  document.getElementById('applicationStatus').hidden = true;

  // 선택 가능한 날짜: 오늘 ~ 1년 뒤 (서버 검증과 동일)
  const dateInput = document.getElementById('startDate');
  dateInput.min = new Date().toLocaleDateString('sv-SE');
  dateInput.max = new Date(Date.now() + 365 * 86400000).toLocaleDateString('sv-SE');

  document.getElementById('modal').classList.add('show');
  document.getElementById('buyerName').focus();
}

function closeModal() {
  document.getElementById('modal').classList.remove('show');
}

document.getElementById('modal').addEventListener('click', e => {
  if (e.target.id === 'modal') closeModal();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});


// -----------------------------------
// 센터 투어
// -----------------------------------

function updateTour() {
  const url = BRANCH_CONFIG[branch].tourUrl;
  const container = document.getElementById('tourContainer');
  const frame = document.getElementById('tourFrame');

  if (url && /^https:\/\//.test(url)) {
    frame.src = url;
    container.classList.add('has-tour');
  } else {
    frame.removeAttribute('src');
    container.classList.remove('has-tour');
  }
}

updateTour();
loadProducts();
