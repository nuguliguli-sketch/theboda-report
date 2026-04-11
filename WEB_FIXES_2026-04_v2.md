# 보고서 개선 작업 계획서 v2 — 2026-04 (2차)

> **이 문서의 목적**: 1차 PDF 출력본(`대림 보고서 초안2.pdf`, 40페이지) 검토 후 발견한 이슈들을 처리하기 위한 자급자족 작업 지시서. 새 대화 세션에서 이 문서 하나만 보고 즉시 작업할 수 있도록 작성됨.
>
> **전제**: 1차 작업(`WEB_FIXES_2026-04.md`)과 이후 반복 개선은 이미 완료됨. Executive Summary·TOC·카테고리 배너·QR·상태 라벨 통일 등은 적용되어 있음.

---

## 새 대화 세션 시작 방법

```
"REPORT/WEB_FIXES_2026-04_v2.md 파일 읽고 Phase 1부터 시작해줘"
```

특정 Phase만 처리하려면:

```
"REPORT/WEB_FIXES_2026-04_v2.md 읽고 Phase 2만 처리해줘"
```

---

## 시스템 구조 요약

```
REPORT/
├── index.html              ← 입력 UI
├── list.html               ← 보고서 목록
├── preview.html            ← 미리보기 + 인쇄 (이번 작업 주 대상)
├── assets/
│   ├── report.js           ← STATUS_MAP, calcStats, calcCategoryStats
│   ├── criteria-data.js    ← 수정 금지 (구버전 리스트, 실제와 불일치)
│   ├── cloud-s3.js         ← 수정 금지
│   ├── style.css           ← 수정 금지
│   └── print.css           ← 수정 금지
│
└── review-tool/            ← 수정 금지 (독립 시스템)
    └── reviews/경기도_성남시_분당구_미금로_23_.../
        ├── versions/v005.json         ← 원본 버전 스냅샷 (이미지 미포함)
        └── v005_full_export.json      ← 이미지 포함 풀 export (테스트 사용)
```

---

## 공통 제약사항

- ❌ `review-tool/`, `cloud-s3.js`, `style.css`, `print.css`, `criteria-data.js` 수정 금지
- ❌ `DEFAULT_REPORT` 스키마 변경 금지 (하위 호환 유지)
- ❌ `STATUS_MAP` enum 값 변경 금지 (`good/normal/bad/danger/na` 유지, 6번째 상태 추가하지 않음)
- ❌ 전문가 분석 의견의 "안전 리스크/비용 리스크" 라벨은 유지 (리스크 평가 문맥상 적절)
- ✅ `preview.html` 자유 수정
- ✅ `report.js`의 `calcStats`, `calcCategoryStats`, `issueItemsP` 로직 수정 가능 (기존 호출부 호환 유지)
- ✅ `index.html`의 용어·표시 수정 가능

---

## 이슈 전체 맵

총 이슈 14건을 4개 Phase로 그룹화. **Phase 1(P0, 데이터 정확성) → Phase 2(P1, 표기 명확성) → Phase 3(P1, 구조 일관성) → Phase 4(P2, 레이아웃 견고성)** 순으로 진행.

| # | Phase | 이슈 | 난이도 | 파급력 |
|---|---|---|---|---|
| 1.1 | P0 | TOC 페이지 번호 off-by-one | 쉬움 5m | 큼 |
| 1.2 | P0 | `totalStats`를 `catStats` 합산으로 통일 | 쉬움 15m | 큼 |
| 1.3 | P0 | `issueItemsP`에 카드 `subJudgments` 포함 | 쉬움 20m | 큼 |
| 1.4 | P0 | `durWarnCount` / `durWarningsP` status 필터 | 쉬움 15m | 큼 |
| 2.1 | P1 | 진단 통계 박스에 "전체 N개 항목" 캡션 | 쉬움 20m | 큼 |
| 2.2 | P1 | 비용 "0" → "별도 산정" 자동 뱃지 | 쉬움 30m | 보통 |
| 2.3 | P1 | H 카테고리 "점검 생략" 배너 | 매우 쉬움 5m | 보통 |
| 2.4 | P1 | 내구연한 0년 + 양호 시각 정리 + 자동 비고 | 쉬움 30m | 큼 |
| 3.1 | P1 | APPENDIX 항목 리스트 Report.CATEGORIES 기반 전환 | 중간 45m | 큼 |
| 3.2 | P1 | "점검 생략 항목" 섹션 (E 결로 케이스) | 중간 45m | 보통 |
| 4.1 | P2 | splitOverflowPages 섹션 기반 재작성 | 큼 1.5h | 보통 |

**예상 총 시간**: Phase 1+2+3 ≈ 4시간, Phase 4 추가 시 5.5시간

---

# Phase 1 — 데이터 정확성 (P0, 약 55분)

## 1.1 TOC 페이지 번호 off-by-one 수정

### 현상
TOC의 모든 페이지 번호가 실제 footer보다 +1 큼.

| TOC 표시 | 실제 footer |
|---|---|
| 한눈에 보는 진단 요약 → 2 | 1 |
| 목차 → 3 | 2 |
| 점검 개요 · 세대 정보 → 4 | 3 |
| ... | ... |
| 더보다 AI 서비스 안내 → 36 | 35 |

### 원인
`buildAndInjectTOC()`가 cover를 `pageNum++`로 카운트하지만, 실제 `splitOverflowPages` 말미의 `finalNum` 재정렬은 cover를 건너뛰고 body 페이지부터 1로 시작함.

### 수정
[preview.html:1697-1704](preview.html#L1697-L1704) 근처 `buildAndInjectTOC` 내부에서 cover 분기 수정:

```js
// before
if (isCover) {
  pageNum++;
  return;
}

// after
if (isCover) {
  // cover는 footer 번호를 차지하지 않음 → 카운트 제외
  return;
}
```

### 검증
TOC의 첫 번째 body 페이지 (한눈에 보는 진단 요약)가 "1"로 표시되고, 마지막 페이지(서비스 안내)가 실제 footer 번호와 일치해야 함.

---

## 1.2 totalStats를 catStats 합산으로 통일

### 현상
Executive Summary 진단 통계: "7 / 4 / **9** / **1**"
세부진단 결과표(p.14) 합계: "7 / 4 / **13** / **2**"

두 페이지가 다른 숫자를 보여줌 → 고객 혼란.

### 원인
- `Report.calcStats()` — `subStatuses`만 카운트, 카드 `subJudgments` **제외**
- `Report.calcCategoryStats()` — `subStatuses` + 카드 `subJudgments` 모두 포함
- Executive Summary / p.10 진단 통계 박스 → `totalStats` (= calcStats 결과) 사용 → 값 9/1
- 세부진단 결과표 → `catStats` (= calcCategoryStats 결과) 사용 → 값 13/2

### 추가 맥락
`calcStats`에는 `na`를 `empty`로 뭉뚱그리는 기존 버그도 있음:
```js
// report.js:1034-1040
switch (st) {
  case 'good':   counts.good++;   break;
  case 'normal': counts.normal++; break;
  case 'bad':    counts.bad++;    break;
  case 'danger': counts.danger++; break;
  default:       counts.empty++;  break;  // ← 'na'가 여기로 감
}
```

`counts.na`는 초기화만 되고 증가 안 됨.

### 수정
`preview.html` `renderReport()` 상단의 집계 부분에서 `totalStats`를 `catStats` 합산으로 재계산:

```js
// [preview.html:664-680 근처]
const catStats = Report.calcCategoryStats(report);

// catStats 합산으로 totalStats 재계산 (기존 Report.calcStats는 미사용)
const totalStats = { good: 0, normal: 0, bad: 0, danger: 0, na: 0, total: 0 };
Object.values(catStats).forEach(s => {
  totalStats.good   += s.good   || 0;
  totalStats.normal += s.normal || 0;
  totalStats.bad    += s.bad    || 0;
  totalStats.danger += s.danger || 0;
  totalStats.na     += s.na     || 0;
  totalStats.total  += s.total  || 0;
});
```

### 영향 범위
- Executive Summary 진단 통계 박스 (p.2) → 13 bad, 2 danger 반영
- p.10 종합 진단 결과 요약의 진단 통계 박스 → 동일
- 세부진단 결과표는 그대로 `catStats` 사용 → 변동 없음 (이미 정확)

### 검증
v005 기준 예상 값:
- good: 7, normal: 4, bad: 13, danger: 2, na: 26, total: 52

---

## 1.3 issueItemsP에 카드 subJudgments 포함

### 현상
p.11 "관리 권장 항목" 테이블에 10개 항목만 나오지만, 실제 actionable(bad/danger) 판정은 15개.

**누락된 항목**:
- A. 공용 욕실 진단: **바닥 누수 추정 (즉시조치)**, **목재 문틀 부식 (보수/교체)**
- A. 부부 욕실 진단: **목재 문틀 부식 (보수/교체)**
- D. 일반 콘센트 카드: **콘센트 접지 단자 부식 (보수/교체)**
- F. 환기 시스템 카드: **부부 욕실 환풍기 (보수/교체)**

### 원인
[preview.html:974-981](preview.html#L974-L981) `issueItemsP` 생성 루프가 `subStatuses`만 순회하고 `cd.cards`, `cd.cardSlots`의 `subJudgments`를 무시.

```js
// 현재 (불완전)
const issueItemsP = [];
Object.entries(report.categoryData || {}).forEach(([cat, cd]) => {
  const catLabel = (Report.CATEGORIES[cat] || {}).label || cat;
  Object.entries(cd.subStatuses || {}).forEach(([name, st]) => {
    if (st === 'bad' || st === 'danger') issueItemsP.push({ cat: catLabel, name, status: st });
  });
});
```

### 수정

```js
const issueItemsP = [];
Object.entries(report.categoryData || {}).forEach(([cat, cd]) => {
  const catLabel = (Report.CATEGORIES[cat] || {}).label || cat;

  // subStatuses 순회
  Object.entries(cd.subStatuses || {}).forEach(([name, st]) => {
    if (st === 'bad' || st === 'danger') {
      issueItemsP.push({ cat: catLabel, name, status: st });
    }
  });

  // 카드 subJudgments도 순회 (calcCategoryStats와 동일 규칙)
  const allCards = [];
  if (cd.cards) allCards.push(...cd.cards);
  if (cd.cardSlots) {
    Object.values(cd.cardSlots).forEach(slotCards => allCards.push(...(slotCards || [])));
  }
  allCards.forEach(card => {
    (card.subJudgments || []).forEach(sj => {
      if (sj.status === 'bad' || sj.status === 'danger') {
        issueItemsP.push({ cat: catLabel, name: sj.name, status: sj.status });
      }
    });
  });
});
```

### 검증
v005 기준 예상 항목 수: 15 (기존 10 + 추가 5)
- A: 4 → 7 (+3 카드 이슈)
- D: 1 → 2 (+1 콘센트 접지)
- F: 0 → 1 (+1 환풍기)
- 나머지 동일

p.10/11 카테고리별 현황 표의 bad·danger 컬럼 합계와 일치해야 함.

---

## 1.4 durWarnCount / durWarningsP status 필터 추가

### 현상
- Executive Summary: "주요 설비 **8건**이 잔여 내구연한 5년 이하"
- 실제 actionable은 4건 (보수/교체권장 3 + 경미/관리필요 1)
- 나머지 4건은 특이사항없음(3) / 해당없음(1) — 기능상 문제 없음인데 "주의"로 카운트

p.11 "내구연한 주의 (잔여 5년 이하)" 테이블도 동일 문제 — 특이사항없음 항목이 같이 표시되어 "잔여 0년인데 특이사항 없음?" 혼동 유발.

### 수정
두 변수 모두 status 필터 추가:

**preview.html 상단 (durWarnCount — Executive Summary)**:
```js
const durWarnCount = (report.durability || []).filter(r => {
  const rem = parseFloat(r.remaining);
  if (isNaN(rem) || rem > 5) return false;
  // 실제 조치가 필요한 상태만 카운트
  return r.status === 'normal' || r.status === 'bad' || r.status === 'danger';
}).length;
```

**durWarningsP (p.11 테이블)**:
```js
const durWarningsP = (report.durability || []).filter(r => {
  const rem = parseFloat(r.remaining);
  if (isNaN(rem) || rem > 5) return false;
  return r.status === 'normal' || r.status === 'bad' || r.status === 'danger';
});
```

### 검증
v005 기준 예상:
- durWarnCount: 8 → **4** (난방배관·실란트·줄눈·창호하드웨어·바닥 마감재)
- durWarningsP 테이블 행: 8 → **4** (특이사항없음/해당없음 제거)
- Executive Summary "주요 설비 4건이 잔여 내구연한 5년 이하 — 교체 계획 수립 권장"

p.9 주요항목 내구연한 검토(전체 8행)는 **그대로 유지**. 거기선 모든 항목을 보여주는 게 맞음 (참고용).

---

# Phase 2 — 표기 명확성 (P1, 약 1시간 25분)

## 2.1 진단 통계 박스에 "전체 N개 항목 기준" 캡션 추가

### 현상
"7 / 4 / 9 / 1" 숫자만 있고 무엇의 개수인지 불명확. 카테고리 수인지 항목 수인지 혼동.

### 수정
Executive Summary와 p.10 진단 통계 박스 그룹 하단에 캡션 추가.

**예시**:
```html
<div class="rpt-section-title">진단 통계</div>
<div style="display:flex; gap:8px; margin-bottom:6px">
  <!-- 4박스 -->
</div>
<div style="font-size:8.5px; color:#7a8fa3; text-align:right; margin-bottom:14px">
  전체 ${totalStats.total}개 점검 항목 기준
  ${totalStats.na > 0 ? `· 해당없음 ${totalStats.na}개 별도` : ''}
</div>
```

### 위치
- Executive Summary(신규 페이지, 대략 [preview.html:820](preview.html#L820) 근처)
- p.10 종합 진단 결과 요약 ([preview.html:1001-1009](preview.html#L1001-L1009) 근처)

### 의존
**Phase 1.2 완료 전제** — `totalStats.total`이 catStats 합산 기반이어야 "52"가 정확히 나옴.

### 예상 표시
```
[7] 특이사항없음  [4] 경미/관리  [13] 보수/교체  [2] 즉시조치
                                전체 52개 점검 항목 기준 · 해당없음 26개 별도
```

---

## 2.2 비용 "0" → "별도 산정" 자동 뱃지

### 현상
p.8 "예상 수선 비용 내역"에 난방배관·급수/배수 배관이 "0"으로 표시. 점검자가 코멘트에 "상기 0원은 '미산정'을 의미합니다" 같은 해명 문구를 매번 수동 작성.

### 수정
`preview.html`의 비용 테이블 렌더 로직에 헬퍼 함수 추가:

```js
// 비용 값 렌더 헬퍼 (preview.html 상단 헬퍼 섹션에 추가)
function renderCost(value) {
  const v = String(value == null ? '' : value).trim();
  if (!v) return '<span style="color:#aab8c2">-</span>';
  if (v === '0' || v === '0원') {
    return '<span style="display:inline-block; padding:2px 10px; background:#f4f7fb; color:#7a8fa3; border:1px solid #d8e2ec; border-radius:9999px; font-size:9px; font-weight:600">별도 산정</span>';
  }
  return `<strong>${escapeHTML(v)}</strong>`;
}
```

[preview.html:886-914](preview.html#L886-L914) p.8 비용 테이블에서 기존 `${val(ind.heatingPipeCost)}` 같은 부분을 `${renderCost(ind.heatingPipeCost)}`로 교체:

```html
<tr>
  <td class="label-cell">난방배관</td>
  <td>${renderCost(ind.heatingPipeCost)}</td>
  <td colspan="2" style="font-size:9px">${val(ind.heatingPipeComment, '')}</td>
</tr>
```

### 코멘트 정리 (선택)
기존 입력 데이터의 "상기 0원은 '미산정'을 의미합니다" 같은 문구가 코멘트에 남아 있음. 뱃지로 대체되니 중복이지만 하위 호환을 위해 코멘트는 그대로 유지.

### 예상 표시
```
난방배관        [별도 산정]    본 세대 난방배관(PPC)은 리모델링 본공사에서 전면 교체가...
욕실/발코니 방수  700~1000      공용욕실 방수 공사 필수 / 부부욕실 권고
창호 및 외벽     1250~2000     큰 폭의 성능개선 효과 기대
급수/배수 배관    [별도 산정]    급·배수 성능은 양호하여 유지 사용이 가능합니다...
```

---

## 2.3 H 카테고리 "점검 생략" 배너

### 현상
H. 생활기능·마감 페이지(p.32)가 모두 "해당없음"이라 카테고리 종합 배너가 스킵됨. 빈 페이지로 보여 고객 혼란.

### 수정
[preview.html:1458-1468](preview.html#L1458-L1468) 근처 `catStatForBanner` 분기 로직에서 `else` 분기를 다음과 같이 세분화:

```js
} else if (catStatForBanner.good > 0) {
  // 기존 양호 분기
  bannerLevel = '양호';
  bannerLabel = '현재 상태 양호';
  // ...
} else if (catStatForBanner.na > 0 && catStatForBanner.na === catStatForBanner.total) {
  // 전 항목 해당없음 → 점검 생략 카테고리
  bannerLevel = '참고';
  bannerLabel = '점검 생략 — 리모델링 시 전면 재시공 전제';
  bannerAction = '본 카테고리는 해당 설비 부재 또는 진단 방침에 따라 세부 점검을 생략했습니다. 자세한 사유는 아래 종합의견을 참고해주세요.';
  bannerBg = '#f4f7fb';
  bannerBorder = '#7a8fa3';
  bannerColor = '#4a6a8a';
} else {
  // 완전히 비어있음 (판정 전혀 없음)
  bannerLevel = '';
}
```

### 예상 표시
H 카테고리 페이지 상단에 회색조의 `[카테고리 종합 — 참고] 점검 생략 — 리모델링 시 전면 재시공 전제` 배너 표시.

---

## 2.4 내구연한 0년 + 양호 시각 정리 + 자동 비고

### 현상
p.9 주요항목 내구연한 검토:
```
욕실 배수관 | 30 | 30 | 0년(빨강) | 특이사항없음(초록) | -
급수배관    | 25 | 30 | 0년(빨강) | 특이사항없음(초록) | 실측 성능 양호 — 예방적 교체 선택
```

"0년(빨강)" + "특이사항없음(초록)" 시각 충돌. 고객이 "내구연한 지났는데 문제 없다?" 혼동.

### 수정 — Plan A: 잔여연한 색상을 status 기반 오버라이드
[preview.html:935-960](preview.html#L935-L960) `주요항목 내구연한 검토` 테이블 렌더에서 잔여연한 셀 색상 계산 로직 분리:

```js
function getDurRemainingStyle(row) {
  const rem = parseFloat(row.remaining);
  const st = row.status;

  // 실측 양호 → 잔여 숫자는 참고 표시 (회색, 강조 없음)
  if (st === 'good' || st === 'na') {
    return 'color:#7a8fa3; font-weight:500';
  }

  // 기존 색상 로직
  if (isNaN(rem)) return 'color:#aab8c2';
  if (rem > 5)   return 'color:#27ae60; font-weight:700';
  if (rem >= 1)  return 'color:#e67e22; font-weight:700';
  return 'color:#c0392b; font-weight:700';
}
```

### 수정 — Plan B: 비고 자동 삽입 (비고가 비어있을 때만)

```js
function getDurNote(row) {
  // 사용자가 수동 입력한 비고 우선
  if (row.comment && row.comment.trim()) return row.comment;

  const rem = parseFloat(row.remaining);
  if (isNaN(rem)) return '';
  if (rem > 5) return '';

  // 잔여 5년 이하 + status 조합별 자동 문구
  if (row.status === 'good') return '실측 성능 양호 — 예방적 교체 선택';
  if (row.status === 'na')   return '해당 설비 없음 / 점검 제외';
  if (row.status === 'normal') return '내구연한 임박 — 정기 점검 강화';
  if (row.status === 'bad')    return '내구연한 초과 — 보수/교체 권장';
  if (row.status === 'danger') return '내구연한 초과 — 즉시 교체 검토';
  return '';
}
```

두 함수를 p.9 테이블 렌더에서 사용:

```js
<td style="${getDurRemainingStyle(row)}">${row.remaining}년</td>
<td>${pb(row.status)}</td>
<td style="font-size:9px; color:#4a6a8a">${getDurNote(row)}</td>
```

### 예상 표시 (v005 기준)
```
난방배관     | 15 | 30 | 0년(빨강)    | 보수/교체권장 | PPC 배관 (기존 수동 비고 유지)
보일러       | 12 | 30 | 0년(회색)    | 해당없음      | 해당 설비 없음 / 점검 제외
욕실 배수관  | 30 | 30 | 0년(회색)    | 특이사항없음  | 실측 성능 양호 — 예방적 교체 선택
급수배관     | 25 | 30 | 0년(회색)    | 특이사항없음  | 실측 성능(수압·중금속) 양호... (기존 비고 유지)
실란트·줄눈  | 10 | 30 | 0년(빨강)    | 보수/교체권장 | 전면 보수 권고
바닥 마감재  | 20 | 30 | 0년(주황)    | 경미/관리필요 | 사용상 지장 없음
창호 하드웨어| 25 | 30 | 0년(빨강)    | 보수/교체권장 | 교체 권고
조명기구     | 15 | 30 | 0년(회색)    | 특이사항없음  | 실측 성능 양호 — 예방적 교체 선택
```

빨강은 actionable, 회색은 "참고 상태"로 시각 구분.

---

# Phase 3 — 구조 일관성 (P1, 약 1시간 30분)

## 3.1 APPENDIX 항목 리스트 Report.CATEGORIES 기반 전환

### 현상
APPENDIX p.33 "카테고리별 점검 항목 요약"이 `window.CRITERIA_PAGES`(criteria-data.js)에서 항목을 가져옴. 하지만 이 리스트는 실제 세부진단 페이지의 `Report.CATEGORIES[x].subItems`와 다름.

| 카테고리 | APPENDIX 표시 | 실제 세부진단 항목 |
|---|---|---|
| A | 5개 | 8개 |
| B | 4개 | 7개 |
| C | 3개 | 7개 |
| D | 6개 | 7개 |
| E | 3개 | 4개 |
| F | 6개 | 6개 ✓ |
| G | 4개 | 6개 |
| H | 7개 | 4개 |

### 원인
`criteria-data.js`는 구버전 리스트이고 수정 금지 파일. 실제 세부진단 렌더는 `Report.CATEGORIES`(report.js) 사용.

### 수정 방향
APPENDIX 렌더 로직(`catCardsHTML` 생성 부분, [preview.html:1321-1355](preview.html#L1321-L1355) 근처)을 두 소스 혼합으로 전환:
- **항목 리스트**: `Report.CATEGORIES[key].subItems` (authoritative)
- **참고 근거**: `window.CRITERIA_PAGES[key].items[*].reference` unique 상위 2개 (기존 로직 유지)

```js
// 현재
const criteriaPages = window.CRITERIA_PAGES || {};
const catCardsHTML = Object.entries(criteriaPages).map(([key, cp]) => {
  // cp.items에서 항목명 추출 — 잘못된 리스트
  const pillsHTML = (cp.items || []).map(i => `<span>${i.name}</span>`).join('');
  // ...
});

// 수정 후
const cats = Report.CATEGORIES || {};
const criteriaPages = window.CRITERIA_PAGES || {};
const catCardsHTML = Object.entries(cats).filter(([k]) => k in criteriaPages || cats[k].subItems).map(([key, catInfo]) => {
  // 항목명: Report.CATEGORIES 기준 (authoritative)
  const subItems = catInfo.subItems || [];

  // 참고 근거: criteria-data.js 기준 (있으면)
  const cp = criteriaPages[key];
  const refSet = new Set();
  if (cp) {
    (cp.items || []).forEach(item => {
      (item.reference || '').split(/[,，、]/).forEach(r => {
        const rt = r.trim();
        if (rt) refSet.add(rt);
      });
    });
  }
  const refs = Array.from(refSet).slice(0, 2);

  const itemCount = subItems.length;
  const pillsHTML = subItems.map(name =>
    `<span style="display:inline-block; padding:1px 6px; margin:1px 1px 1px 0; background:#ffffff; border:1px solid #d8e2ec; border-radius:9999px; font-size:7.5px; color:#0a1628; font-weight:500">${escapeHTML(name)}</span>`
  ).join('');

  return `
    <div style="padding:8px 10px 7px; background:#f4f7fb; border-radius:6px; border-left:3px solid #4a90d9; page-break-inside:avoid">
      <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:4px; padding-bottom:3px; border-bottom:1px solid #d8e2ec">
        <div style="font-size:9.5px; font-weight:700; color:#1a3669">${key}. ${catInfo.label}</div>
        <div style="font-size:7px; font-weight:500; color:#4a6a8a">${itemCount}개 항목</div>
      </div>
      <div style="margin-bottom:4px; line-height:1.8">${pillsHTML}</div>
      ${refs.length > 0 ? `
        <div style="font-size:7px; color:#7a8fa3; padding-top:3px; border-top:1px dashed #e8eef6">
          <strong style="color:#4a6a8a">근거</strong> ${refs.join(' / ')}
        </div>
      ` : ''}
    </div>
  `;
}).join('');
```

### 주의
- `Report.CATEGORIES[key].label`은 "균열·안전·방수" 식으로 접두사 없음 → "A. 균열·안전·방수" 만들려면 `${key}. ${label}` 조합
- `Report.CATEGORIES`에 `subItems`가 없는 카테고리 처리 (빈 배열로 fallback)

### 검증
v005 기준 APPENDIX 항목 수 변화:
- A: 5 → 8
- B: 4 → 7
- C: 3 → 7
- D: 6 → 7
- E: 3 → 4
- F: 6 → 6
- G: 4 → 6
- H: 7 → 4

세부진단 페이지의 "주요점검항목" 테이블 항목과 개수·이름 일치 확인.

---

## 3.2 "점검 생략 항목" 섹션 추가 (해당없음 vs 미측정 구분)

### 현상
E. 단열·결로의 "결로" 항목이 `subStatuses`에 "해당없음"으로 표시되지만, 실제로는 "현장 일정 제약으로 이슈점 결로 측정 미실시"가 원인. 현재는 종합의견 본문에만 이 내용이 적혀 있고, 주요점검항목 표에서는 "해당없음" = "설비 부재"와 구분 안 됨.

### 옵션 비교

| 옵션 | 방법 | 장점 | 단점 |
|---|---|---|---|
| A | STATUS_MAP에 6번째 상태 `not_measured` 추가 | 데이터상 정확 | 스키마 변경 금지 제약 위반, 파급력 큼 |
| B | `subStatuses` 값을 object(`{status, reason}`)로 확장 | 항목 단위로 사유 기록 | 스키마 변경, 20+곳 수정 |
| C | 카테고리에 `skippedNote` 같은 optional 필드 추가 | 영향 최소 | 스키마 추가 (optional) |
| **D** | **시각 렌더만** — 종합의견 본문에서 "생략"/"미측정" 키워드 감지해 배너/박스로 끌어올림 | **스키마 변경 없음** | 본문 파싱 의존 |

### 권장: **옵션 D** (시각 렌더만, 스키마 변경 없음)

카테고리 종합의견(`cd.opinion`) 텍스트를 스캔해서 "생략", "미측정", "미실시", "일정 제약" 같은 키워드가 포함되어 있으면, 주요점검항목 표 아래(또는 종합의견 위)에 **"점검 생략 항목 안내"** 박스를 자동 생성.

```js
function extractSkipNote(opinion) {
  if (!opinion) return '';
  // "생략"/"미측정"/"미실시" 키워드를 포함한 문장 추출
  const SKIP_KEYWORDS = ['생략', '미측정', '미실시', '일정 제약', '부득이'];
  const sentences = opinion.split(/[.。\n]/).map(s => s.trim()).filter(Boolean);
  const skipSentences = sentences.filter(s =>
    SKIP_KEYWORDS.some(k => s.includes(k))
  );
  return skipSentences.join('. ');
}

// 카테고리 페이지 렌더 시
const skipNote = extractSkipNote(cd.opinion);
const skipNoteHTML = skipNote ? `
  <div style="margin:10px 0; padding:10px 14px; background:#f4f7fb; border-left:3px solid #7a8fa3; border-radius:6px">
    <div style="font-size:9px; font-weight:700; color:#4a6a8a; margin-bottom:3px; letter-spacing:0.03em">참고 — 점검 생략 항목</div>
    <div style="font-size:9px; color:#4a6a8a; line-height:1.65">${escapeHTML(skipNote)}</div>
  </div>
` : '';

// catContent 맨 앞(배너 바로 아래)에 삽입
```

### 대안 — 옵션 C (소규모 스키마 추가)
사용자가 동의한다면 `categoryData[X].skippedNote`라는 optional string 필드를 추가할 수 있음. 입력 UI에도 "점검 생략 사유" 텍스트박스 하나 추가. 더 명시적이고 파싱 의존성 없음.

### 의사결정 필요
옵션 D(스크립트 기반 키워드 추출) vs 옵션 C(스키마 필드 추가) 중 선택.

**Phase 3.2 시작 전 사용자 확인 필요.**

---

# Phase 4 — 레이아웃 견고성 (P2, 약 1시간 30분)

## 4.1 splitOverflowPages 섹션 기반 재작성

### 현상
B 카테고리 p.21 "수압 측정" 제목이 페이지 하단에 혼자 남고 테이블이 p.22로 분리되는 orphan 재발. 현재 keep-with-next 로직이 일부 케이스에서 실패.

### 원인
현재 로직은 element 단위로 순회하며 "이 제목 + 다음 요소"의 peek 계산 → 실제 렌더와 childHeights 측정 사이의 미묘한 편차로 잘못 판단.

### 수정 방향 — Section-based splitting

children을 **section**(rpt-section-title부터 다음 section-title 직전까지)으로 pre-grouping 후, 섹션 단위로 flush.

```js
// 1) 섹션 그룹핑
const sections = [];
let currentSection = [];
for (const child of children) {
  const isSectionStart = child.classList && child.classList.contains('rpt-section-title');
  if (isSectionStart && currentSection.length > 0) {
    sections.push(currentSection);
    currentSection = [];
  }
  currentSection.push(child);
}
if (currentSection.length > 0) sections.push(currentSection);

// 2) 섹션 높이 계산 (childHeights 합계)
const sectionHeights = sections.map(sec =>
  sec.reduce((sum, el) => sum + (childHeights[children.indexOf(el)] || 0), 0)
);

// 3) 섹션 단위 분할
let currentChildren = [];
let currentH = 0;
for (let s = 0; s < sections.length; s++) {
  const sec = sections[s];
  const secH = sectionHeights[s];

  if (currentH + secH > MAX_BODY_H && currentChildren.length > 0) {
    flushPage();  // 현재 페이지 마감, 다음 섹션은 새 페이지에
  }

  if (secH > MAX_BODY_H) {
    // 섹션이 너무 커서 한 페이지에 다 못 들어감
    // → fallback: 섹션 내부를 element 단위로 분할
    for (const el of sec) {
      const elH = childHeights[children.indexOf(el)];
      if (currentH + elH > MAX_BODY_H && currentChildren.length > 0) {
        flushPage();
      }
      currentChildren.push(el);
      currentH += elH;
    }
  } else {
    // 섹션 전체를 한 번에 추가
    for (const el of sec) {
      currentChildren.push(el);
      currentH += childHeights[children.indexOf(el)];
    }
  }
}
flushPage();
```

### 동작 원리
- 섹션 = [제목 + 제목에 속한 모든 후속 요소]
- 섹션 전체가 현재 페이지에 들어가면 → 함께 추가
- 안 들어가면 → 현재 페이지 flush, 다음 페이지에서 섹션 시작
- 섹션 자체가 한 페이지보다 크면(드문 케이스) → 내부 element 단위로 분할 (이전 로직)

### 장점
- "제목 혼자 남는" orphan 원천 방지
- 측정 오차에 덜 민감 (섹션 단위로 합산하니 작은 오차 누적 영향 작음)
- 로직이 더 단순하고 이해하기 쉬움

### 위험
- 기존 작동하던 케이스가 역회귀할 가능성 → 전체 페이지 스캔 후 검증 필요
- 섹션이 너무 큰 경우 처리 복잡도 증가

### 검증 체크리스트
- 전체 PDF 출력해서 페이지별로 섹션 제목이 내용과 붙어있는지 확인
- p.21 "수압 측정" 정상화 여부 (가장 중요)
- 페이지 수 변동 (+/-1 수준은 허용)
- 기존 정상 페이지에 역회귀 없는지

---

# 권장 작업 순서

## Session 1 — Phase 1 + Phase 2 (약 2시간 20분)

**1단계**: Phase 1 전체 (데이터 정확성)
1. 1.1 TOC off-by-one
2. 1.2 totalStats 재계산
3. 1.3 issueItemsP 카드 포함
4. 1.4 durability 필터

→ **PDF 재출력 후 숫자 검증**

**2단계**: Phase 2 전체 (표기 명확성)
5. 2.1 진단 통계 단위 캡션 (1.2 의존)
6. 2.2 비용 0원 뱃지
7. 2.3 H 배너
8. 2.4 내구연한 시각 정리

→ **PDF 재출력 후 시각 검증**

## Session 2 — Phase 3 (약 1시간 30분)

9. **3.2 먼저** — 옵션 D(시각만) / 옵션 C(스키마) 의사결정 받고 진행
10. 3.1 APPENDIX Report.CATEGORIES 전환

→ **PDF 재출력 후 APPENDIX·E·결로 섹션 확인**

## Session 3 — Phase 4 (약 1시간 30분)

11. 4.1 section-based split 재작성 + 전체 회귀 테스트

→ **최종 PDF 출력, 전 페이지 레이아웃 확인**

---

# 테스트 데이터

**위치**: `review-tool/reviews/경기도_성남시_분당구_미금로_23__구미동__무지개마을_대림아파트__20260410_496fnc/v005_full_export.json` (8.8 MB, 이미지 inline 포함)

**Import 방법**:
1. `index.html` → 사이드바 **불러오기 / 병합** → `v005_full_export.json` 선택 → "덮어쓰기"
2. Toast에 `불러오기 완료 (사진 53장)` 확인
3. **미리보기 / 출력** → `preview.html`

**주의**: `versions/v005.json` (review-tool 원본, `_images` 없음)을 직접 import하면 사진 안 나옴. 반드시 `v005_full_export.json` 사용.

---

# v005 기준 주요 숫자 (검증 참고)

## catStats 합산 (Phase 1.2 검증)
- good: 7
- normal: 4
- bad: 13
- danger: 2
- na: 26
- total: 52

## 카테고리별
| 카테고리 | good | normal | bad | danger | na | total |
|---|---|---|---|---|---|---|
| A. 균열·안전·방수 | 1 | 2 | 5 | 2 | 1 | 11 |
| B. 급배수·배관 | 3 | 0 | 0 | 0 | 4 | 7 |
| C. 난방 | 2 | 0 | 0 | 0 | 5 | 7 |
| D. 전기·가스 | 1 | 1 | 2 | 0 | 3 | 7 |
| E. 단열·결로 | 0 | 1 | 0 | 0 | 3 | 4 |
| F. 환기·공기질 | 0 | 0 | 1 | 0 | 5 | 6 |
| G. 창호시스템 | 0 | 0 | 5 | 0 | 1 | 6 |
| H. 생활기능·마감 | 0 | 0 | 0 | 0 | 4 | 4 |

## 관리 권장 항목 (Phase 1.3 검증) — 총 15개
- A: 7개 (기존 4 + 카드 3)
- D: 2개 (기존 1 + 카드 1)
- F: 1개 (기존 0 + 카드 1)
- G: 5개 (기존 5)
- 기타: 0개

## 내구연한 주의 (Phase 1.4 검증) — 필터 후 4개
- 난방배관 (보수/교체권장)
- 실란트·줄눈 (보수/교체권장)
- 바닥 마감재 (경미/관리필요)
- 창호 하드웨어 (보수/교체권장)

## 예상 수선 비용 "별도 산정" (Phase 2.2 검증) — 2건
- 난방배관: `0` → "별도 산정"
- 급수/배수 배관: `0` → "별도 산정"

## 카테고리 종합 배너 — H "참고" 추가 (Phase 2.3)
- A: 긴급
- B: 양호
- C: 양호
- D: 주의
- E: 관리
- F: 주의
- G: 주의
- H: **참고** (신규, 점검 생략)

---

# 관련 문서

- `WEB_FIXES_2026-04.md` — 1차 작업 지시서 (완료)
- `대림 보고서 초안2.pdf` — 현재 출력 상태 (이 계획서의 검토 기준)
- 1차 이후 반복 개선 내역: git log `afa1a13` 이후 커밋들
- 메모리: `C:\Users\nugul\.claude\projects\c--Users-nugul-OneDrive-------Vibe-Coding-REPORT\memory\project_report_system.md`

---

# 주의사항 (DO / DON'T)

## DO
- 각 Phase 완료 후 브라우저에서 v005_full_export.json import 해 시각 검증
- 숫자 변화는 "v005 기준 주요 숫자" 섹션과 대조
- 기존 동작하던 페이지에 회귀 없는지 전 페이지 훑기
- 작업 완료/결정 필요 시점마다 PowerShell 비프로 알림
  - 완료: `powershell -c "[console]::beep(880,150); Start-Sleep -Milliseconds 80; [console]::beep(1200,200)"`
  - 결정 필요: `powershell -c "[console]::beep(1200,120); Start-Sleep -Milliseconds 60; [console]::beep(900,120); Start-Sleep -Milliseconds 60; [console]::beep(1200,180)"`

## DON'T
- `STATUS_MAP`에 6번째 상태값 추가 금지 (Phase 3.2는 옵션 D 우선)
- `review-tool/`, `criteria-data.js`, `print.css`, `style.css`, `cloud-s3.js` 수정 금지
- `DEFAULT_REPORT` 기존 필드 제거·변경 금지 (새 optional 필드 추가는 사용자 동의 후 가능)
- 전문가 분석 의견의 "안전 리스크/비용 리스크" 라벨 건드리기 금지
- `pb()` / `STATUS_MAP` 라벨 변경 금지 (라벨 통일 완료 상태)
