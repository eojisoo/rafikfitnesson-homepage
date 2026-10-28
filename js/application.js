// 라피끄 & 피트니스온 회원권 신청 시스템
// 개인정보는 비공개 신청 시트에만 저장합니다.

let submitting = false;

function applicationStatus(message, error = false) {
  const el = document.getElementById(
    'applicationStatus'
  );

  if (!el) return;

  el.hidden = false;
  el.textContent = message;
  el.style.color = error ? '#a22' : '#333';
}


// -----------------------------------
// 신청 저장 여부 조회
// -----------------------------------

function checkApplicationSaved(
  endpoint,
  requestId,
  token
) {
  return new Promise(resolve => {
    const callbackName =
      'rafikCallback_' +
      Math.random()
        .toString(36)
        .slice(2);

    const script = document.createElement(
      'script'
    );

    let finished = false;

    function finish(result) {
      if (finished) return;

      finished = true;

      clearTimeout(timer);

      delete window[callbackName];

      script.remove();

      resolve(result);
    }

    window[callbackName] = data => {
      finish(data?.saved === true);
    };

    const params = new URLSearchParams({
      requestId,
      token,
      callback: callbackName
    });

    script.src =
      endpoint + '?' + params.toString();

    script.onerror = () => finish(false);

    const timer = setTimeout(
      () => finish(false),
      8000
    );

    document.body.appendChild(script);
  });
}


// -----------------------------------
// 회원권 등록 신청
// -----------------------------------

async function submitApplication() {
  if (submitting) return;

  const endpoint =
    window.RAFIK_CONFIG
      ?.applicationEndpoint
      ?.trim();

  if (
    !endpoint ||
    !/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/
      .test(endpoint)
  ) {
    applicationStatus(
      '신청 접수 기능을 설정 중입니다.',
      true
    );

    return;
  }

  if (
    !selectedProduct ||
    !products.some(p =>
      p.id === selectedProduct.id &&
      p.active &&
      (
        p.branch === branch ||
        p.branch === 'all'
      )
    )
  ) {
    applicationStatus(
      '상품을 다시 선택해 주세요.',
      true
    );

    return;
  }

  const name = document
    .getElementById('buyerName')
    .value.trim();

  const phone = document
    .getElementById('buyerPhone')
    .value.replace(/\D/g, '');

  const date = document
    .getElementById('startDate')
    .value;

  const agree = document
    .getElementById('privacyAgree')
    .checked;

  if (!name || name.length > 40) {
    return applicationStatus(
      '이름을 확인해 주세요.',
      true
    );
  }

  if (!/^01[016789][0-9]{7,8}$/.test(phone)) {
    return applicationStatus(
      '연락처를 확인해 주세요.',
      true
    );
  }

  const today = new Date()
    .toLocaleDateString('sv-SE');

  const maxDate = new Date(
    Date.now() + 365 * 86400000
  ).toLocaleDateString('sv-SE');

  if (
    !date ||
    date < today ||
    date > maxDate
  ) {
    return applicationStatus(
      '이용 시작 희망일을 확인해 주세요.',
      true
    );
  }

  if (!agree) {
    return applicationStatus(
      '개인정보 수집·이용 동의가 필요합니다.',
      true
    );
  }

  if (!window.crypto?.randomUUID) {
    return applicationStatus(
      '보안 연결에서 다시 접속해 주세요.',
      true
    );
  }

  const requestId = crypto.randomUUID();

  const token =
    crypto.randomUUID() +
    '-' +
    crypto.randomUUID();

  const button = document.getElementById(
    'applySubmit'
  );

  submitting = true;

  if (button) button.disabled = true;

  applicationStatus(
    '등록 신청을 접수하고 있습니다...'
  );

  // 숨겨진 iframe 생성
  const iframe = document.createElement(
    'iframe'
  );

  iframe.name =
    'application-target-' + Date.now();

  iframe.style.display = 'none';

  iframe.title = '등록 신청 전송';

  document.body.appendChild(iframe);

  // 신청 전송용 폼
  const form = document.createElement(
    'form'
  );

  form.action = endpoint;
  form.method = 'POST';
  form.target = iframe.name;
  form.style.display = 'none';

  const payload = {
    requestId,
    token,
    branch,
    productId: selectedProduct.id,
    name,
    phone,
    startDate: date,
    consent: 'yes'
  };

  Object.entries(payload).forEach(
    ([key, value]) => {
      const input = document.createElement(
        'input'
      );

      input.type = 'hidden';
      input.name = key;
      input.value = value;

      form.appendChild(input);
    }
  );

  document.body.appendChild(form);

  try {
    // 신청 전송
    form.submit();

    // 서버가 저장할 시간을 확보
    await new Promise(resolve =>
      setTimeout(resolve, 2000)
    );

    let saved = false;

    // 최대 10회 저장 여부 확인
    for (let attempt = 0; attempt < 10; attempt++) {
      saved = await checkApplicationSaved(
        endpoint,
        requestId,
        token
      );

      if (saved) break;

      if (attempt < 9) {
        await new Promise(resolve =>
          setTimeout(resolve, 2000)
        );
      }
    }

    if (saved) {
      // 방문 분석: 신청 완료(전환). 개인정보는 보내지 않습니다.
      if (typeof rafikTrack === 'function') {
        rafikTrack('generate_lead', {
          product_name: selectedProduct.name
        });
      }

      showApplicationSuccess({
        branchName: typeof BRANCH_CONFIG !== 'undefined' ? BRANCH_CONFIG[branch].name : branch,
        productName: selectedProduct.name,
        productPrice: typeof formatPrice === 'function' ? formatPrice(selectedProduct) : Number(selectedProduct.price).toLocaleString('ko-KR') + '원',
        name,
        date
      });

      document.getElementById(
        'buyerName'
      ).value = '';

      document.getElementById(
        'buyerPhone'
      ).value = '';

      document.getElementById(
        'privacyAgree'
      ).checked = false;

    } else {
      applicationStatus(
        '접수 여부를 확인하지 못했습니다. 중복 신청하지 마시고 센터에 문의해 주세요.',
        true
      );
    }

  } catch (error) {
    console.error(
      '신청 처리 오류:',
      error
    );

    applicationStatus(
      '접수 여부를 확인하지 못했습니다. 센터에 문의해 주세요.',
      true
    );

  } finally {
    submitting = false;

    if (button) button.disabled = false;

    form.remove();

    setTimeout(
      () => iframe.remove(),
      2000
    );
  }
}
// 서버에서 저장 완료를 확인한 후에만 접수 완료 화면을 표시합니다.
function showApplicationSuccess(details) {
  const panel = document.getElementById('applicationSuccess');
  const dialog = document.querySelector('#modal .dialog');
  if (!panel || !dialog) {
    applicationStatus('✅ 신청이 접수되었습니다! 담당자가 확인 후 연락드리겠습니다.');
    return;
  }
  const fields = {
    successBranch: details.branchName,
    successProduct: details.productName,
    successPrice: details.productPrice,
    successName: details.name,
    successDate: details.date
  };
  for (const [id, value] of Object.entries(fields)) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }
  panel.hidden = false;
  dialog.classList.add('application-complete');
  dialog.scrollTop = 0;
}
