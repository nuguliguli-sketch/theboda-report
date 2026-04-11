# 기존 웹 시스템 수정 작업 지시서 — 2026-04

> **이 문서의 목적**: 검토 도구(`review-tool/`) 작업과 **분리해서** 기존 웹 시스템(`REPORT/` 루트)의 남은 3가지 이슈를 처리하기 위한 자급자족 지시서입니다. 새 대화 세션에서 이 문서 하나만 보고 즉시 작업할 수 있도록 작성되었습니다.

---

## 새 대화 세션 시작 방법

새 Claude Code 세션에서 다음과 같이 시작하세요:

> "`REPORT/WEB_FIXES_2026-04.md` 파일 읽고 작업 1부터 시작해줘"

또는 특정 작업만:

> "`REPORT/WEB_FIXES_2026-04.md` 읽고 작업 2만 처리해줘"

---

## 시스템 구조 요약

```
REPORT/                              ← 기존 웹 (이번 작업 대상)
├── index.html                       ← 보고서 입력 UI
├── list.html                        ← 보고서 목록
├── preview.html                     ← 미리보기 + A4 인쇄 (이번 작업 핵심)
├── assets/
│   ├── report.js                    ← 데이터 모델 + Report API (일부 수정)
│   ├── cloud-s3.js                  ← AWS S3 동기화 (건드리지 않음)
│   ├── criteria-data.js             ← 부록 판정 기준 데이터 (작업 3에서 참조)
│   ├── style.css                    ← 다크모드 스타일 (건드리지 않음)
│   └── print.css                    ← A4 인쇄 레이아웃 (건드리지 않음)
│
└── review-tool/                     ← 독립 검토 도구 ⚠ 절대 수정 금지
    ├── review.html
    ├── assets/
    ├── CLAUDE.md
    └── reviews/                     ← 테스트 데이터 보관
```

**중요**: `review-tool/` 폴더는 이 작업과 **완전히 무관**합니다. 이 폴더 내 파일은 **절대 읽거나 수정하지 마세요**. 단, 테스트 리포트 JSON은 이 안에 있습니다 (아래 "테스트 데이터" 섹션 참조).

---

## 공통 제약사항

- ❌ `review-tool/` 하위 코드 수정 금지 (데이터만 읽기 허용)
- ❌ `cloud-s3.js`, `style.css`, `print.css`, `criteria-data.js` 수정 금지 (단, 필요 시 참조만)
- ❌ `index.html`의 데이터 모델(`DEFAULT_REPORT`) 스키마 변경 금지 — 기존 저장 데이터 호환성 유지
- ❌ `STATUS_MAP` enum 값(`good/normal/bad/danger/na`) 제거·변경 금지
- ✅ `preview.html`은 주 작업 대상 — 자유롭게 수정
- ✅ `report.js`의 `calcCategoryStats`는 수정 가능하지만 기존 호출부와 호환 유지
- ✅ A4 인쇄 미리보기(Ctrl+P)가 깨지지 않는지 반드시 확인

---

## 작업 1 — 세부진단 결과표 p.7 숫자 합산 오류 (피드백 #4)

### 문제
세부진단 결과표에서 카테고리별 판정 개수 합이 전체 값과 맞지 않음.

**예시 (실제 보고서에서 관찰된 오류)**:
```
카테고리 A:  양호 1 + 경미 2 + 보수 4 + 즉시 2 = 9    하지만 전체 = 11
```
2개의 차이는 **"해당없음(na)"** 판정이 `total`에는 포함되지만 표 컬럼에는 표시되지 않아서 발생.

### 원인

**[assets/report.js:1049-1079](assets/report.js#L1049-L1079)** `calcCategoryStats` 함수:

```js
function calcCategoryStats(report) {
  const result = {};
  const catData = report.categoryData || {};
  Object.entries(DETAIL_CATEGORIES).forEach(([cat, info]) => {
    const cd = catData[cat] || {};
    const subs = cd.subStatuses || {};
    const cnt = { good: 0, normal: 0, bad: 0, danger: 0, na: 0 };  // ← na 카운트함
    let total = 0;

    Object.values(subs).forEach(st => {
      total++;                                                      // ← na도 total++
      if (cnt[st] !== undefined) cnt[st]++;
    });

    const allCards = [];
    if (cd.cards) allCards.push(...cd.cards);
    if (cd.cardSlots) {
      Object.values(cd.cardSlots).forEach(slotCards => allCards.push(...(slotCards || [])));
    }
    allCards.forEach(card => {
      (card.subJudgments || []).forEach(sj => {
        total++;                                                    // ← 여기도 동일
        if (cnt[sj.status] !== undefined) cnt[sj.status]++;
      });
    });

    result[cat] = { ...cnt, total, label: info.label };             // na 포함해서 반환
  });
  return result;
}
```

**[preview.html:1090-1126](preview.html#L1090-L1126)** 세부진단 결과표 렌더:

```js
pages.push(pageWrap(pageNum, `
  ${pageHeader(report, '세부진단 결과표')}
  <table class="info-table">
    <thead>
      <tr>
        <th>카테고리</th>
        <th>특이사항없음</th>  <!-- good -->
        <th>경미/관리</th>     <!-- normal -->
        <th>보수/교체</th>     <!-- bad -->
        <th>즉시조치</th>       <!-- danger -->
        <th>전체</th>          <!-- total -->  ← na 포함
        <th>종합</th>
      </tr>
    </thead>
    ...
    <td style="text-align:center;color:#27ae60;font-weight:600">${s.good}</td>
    <td style="text-align:center;color:#e67e22;font-weight:600">${s.normal}</td>
    <td style="text-align:center;color:#d35400;font-weight:600">${s.bad}</td>
    <td style="text-align:center;color:#c0392b;font-weight:600">${s.danger}</td>
    <td style="text-align:center;color:#4a6a8a">${s.total}</td>    <!-- ← 문제 -->
```

→ 표에는 4개 상태 컬럼만 있고 `total`은 `na` 포함 값이라 합계가 안 맞음.

### 수정 방안

#### 옵션 A — "해당없음" 컬럼 추가 (권장)
데이터를 투명하게 보여주는 방식. 고객이 `na` 항목이 몇 개인지도 알 수 있음.

수정 파일: `preview.html` 1090~1126줄
- `<th>` 헤더에 `<th>해당없음</th>` 추가 (`즉시조치`와 `전체` 사이)
- `<td>` 로우에 `<td style="text-align:center;color:#7a8fa3">${s.na}</td>` 추가
- `total` 그대로 유지

**또한 p.5 "카테고리별 현황" 테이블**([preview.html:999-1010](preview.html#L999-L1010))도 동일한 패턴:
```js
const statusLabelsP = { good: '양호', normal: '경미', bad: '보수', danger: '즉시' };
```
- `statusLabelsP`에 `na: '해당없음'` 추가
- `statusColorsP`에 `na: '#7a8fa3'` 추가
- 이렇게 하면 `Object.entries(statusLabelsP).map(...)` 반복문에서 자동으로 컬럼 추가됨

#### 옵션 B — total에서 na 제외
단순하지만 "전체" 컬럼이 "유효 판정 수"가 되어 직관성 떨어짐.

수정 파일: `report.js:1049-1079` `calcCategoryStats`
```js
// total++ 앞에 조건 추가
if (st !== 'na') total++;
if (cnt[st] !== undefined) cnt[st]++;
```

**문제점**: `calcStats`(줄 1025-1047)도 비슷한 구조라 일관성 이슈 발생 가능. `calcCategoryStats`만 바꾸면 `calcStats`와 결과가 달라짐.

### 권장: 옵션 A

데이터 자체를 바꾸지 않고 표현만 바꿔서 회귀 가능성이 낮음.

### 테스트

1. `index.html`에서 테스트 데이터 import (아래 "테스트 데이터" 섹션 참조)
2. `preview.html`로 이동
3. p.5 카테고리별 현황 테이블과 p.7 세부진단 결과표 확인
4. 특히 카테고리 A, B, D, G에서 `good + normal + bad + danger + na === total` 검증
5. Ctrl+P로 인쇄 미리보기 — 컬럼 너비 확인

---

## 작업 2 — "none" 영문 표기 해결 (피드백 #5)

### 문제
세부진단 결과표 "종합" 컬럼에서 E(단열·결로) 또는 H(생활기능·마감) 카테고리의 종합 판정이 영문 `none`으로 표기됨.

### 원인

**[preview.html:1106](preview.html#L1106)**:
```js
${Object.entries(catStats).map(([cat, s]) => {
  let overall = 'none';                              // ← 초기값 'none'
  if (s.danger > 0) overall = 'danger';
  else if (s.bad > 0) overall = 'bad';
  else if (s.normal > 0) overall = 'normal';
  else if (s.good > 0) overall = 'good';
  return `... <td style="text-align:center">${pb(overall)}</td> ...`;
}).join('')}
```

카테고리가 **모든 항목이 na이거나 빈 값**이면 위 `if-else if` 체인을 전부 못 맞추고 `overall`은 `'none'` 그대로 남음.

**[preview.html:569-574](preview.html#L569-L574)** `pb()` 함수:
```js
function pb(status) {
  if (!status) return '<span class="pb none">미입력</span>';  // ← falsy만 잡힘
  const map = {
    good: '특이사항없음', normal: '경미/관리필요', bad: '보수/교체권장',
    danger: '즉시조치필요', na: '해당없음',
    ...
  };
  ...
}
```

`'none'`은 truthy 문자열이라 `!status` 체크 통과 못함 → `map['none']`이 undefined → 아마 `"none"` 문자열이 그대로 출력되거나 map 접근 이후 로직에서 raw 표시됨.

### 수정 방안

**[preview.html:1106](preview.html#L1106)**:

```js
// before
let overall = 'none';

// after
let overall = '';
```

이렇게 하면 모든 조건이 false일 때 `overall = ''` (빈 문자열, falsy)로 남고, `pb('')` 호출 시 `!status` 체크를 통과해서 `"미입력"` 라벨로 렌더됨.

**개선 (선택)**: 모든 항목이 `na`인 경우 "해당없음"으로 표시하는 게 더 의미 있음.

```js
let overall = '';
if (s.danger > 0) overall = 'danger';
else if (s.bad > 0) overall = 'bad';
else if (s.normal > 0) overall = 'normal';
else if (s.good > 0) overall = 'good';
else if (s.na > 0 && s.na === s.total) overall = 'na';  // ← 전부 na면
```

이 경우 `pb('na')` 호출 → STATUS_MAP/map에서 `na: '해당없음'` 매핑 → 회색 배지로 "해당없음" 렌더됨.

### 관련 파일 확인 포인트

- **[assets/report.js:14-20](assets/report.js#L14-L20)** `STATUS_MAP` — 기본 enum 정의, 변경 없음
- **[assets/report.js:1415-1425](assets/report.js#L1415-L1425)** `statusLabel` / `statusShortLabel` / `statusClass` — 변경 없음 (fallback 이미 `-` 또는 `none` 처리)

### 테스트

1. E 카테고리에서 subStatuses 전부 빈 값이거나 na인 테스트 리포트 사용
2. H 카테고리에서 subStatuses 전부 na인 상태 (현재 테스트 리포트 그대로)
3. `preview.html`로 이동 → 세부진단 결과표 p.7 종합 컬럼 확인
4. E와 H 행의 종합 셀에 "미입력" 또는 "해당없음"이 한글로 표시되는지

---

## 작업 3 — 부록 11페이지 축약 (피드백 #9)

### 문제
현재 보고서의 부록(APPENDIX) "점검 기준 안내" 섹션이 약 11페이지(p.29~39)에 걸쳐 있음. 고객용 보고서로는 분량이 과함.

### 원인

**[preview.html:775-832](preview.html#L775-L832)**: 첫 번째 "판정 기준 안내" 페이지 (1페이지)

**[preview.html:1279-1318](preview.html#L1279-L1318)**: 카테고리별 "점검 기준 안내" 페이지 생성 루프

```js
// ── 간지: 점검 기준 안내 ──
pages.push(`
  <div class="report-page divider-page">
    ...
    <div class="divider-title">점검 기준 안내</div>
  </div>
`);

// ── 기준 안내 페이지들 (카테고리별) ──
Object.entries(window.CRITERIA_PAGES || {}).forEach(([cat, cp]) => {
  pageNum++;
  let criteriaHTML = `<div>...</div>`;
  cp.items.forEach(item => {
    criteriaHTML += `
      <div>
        <div class="item-name">${item.name}</div>
        <div>점검방법: ${item.method}</div>
        <table>
          ${item.criteria.map(c => `<tr>...</tr>`).join('')}
        </table>
        <div>근거: ${item.reference}</div>
      </div>
    `;
  });
  pages.push(pageWrap(pageNum, `...`));
});
```

**[assets/criteria-data.js](assets/criteria-data.js)**: 506줄, 각 카테고리(A~H)마다 여러 항목이 정의되어 있어 카테고리별로 1~2페이지씩 생성됨 → 간지 1 + 판정 기준 1 + 카테고리별 8~10개 페이지 = **10~12페이지**.

### 수정 방안 3가지

#### 옵션 A — 요약 1페이지로 통합 (권장, 가장 간단)

카테고리별 상세 페이지를 모두 삭제하고, **핵심 판정 기준표 1페이지만 유지**. 상세는 QR/링크로 대체.

수정 위치: `preview.html:1279-1318`

```js
// 기존 "간지: 점검 기준 안내" + 카테고리별 루프를 모두 제거
// 대신 단일 요약 페이지 하나만 추가

pageNum++;
pages.push(pageWrap(pageNum, `
  ${pageHeader(report, '점검 기준 안내 (요약)')}
  <div style="font-size:10px; color:#4a6a8a; line-height:1.6; margin-bottom:14px">
    본 진단에 적용된 판정 기준의 요약입니다. 카테고리별 상세 기준은 별도 참고 자료를 통해 확인하실 수 있습니다.
  </div>
  <!-- 판정 등급 요약 표 (기존 p.6 판정 기준 안내의 첫 번째 표와 유사) -->
  <table class="criteria-table">
    <thead><tr><th>판정</th><th>기준</th><th>조치 수준</th></tr></thead>
    <tbody>
      <tr><td>특이사항없음</td><td>양호 상태</td><td>별도 조치 불필요</td></tr>
      <tr><td>경미/관리필요</td><td>경미 노후·기능 저하</td><td>정기 점검 시 관리</td></tr>
      <tr><td>보수/교체권장</td><td>기능 저하·노후 확인</td><td>입주 전후 보수 권장</td></tr>
      <tr><td>즉시조치필요</td><td>안전·위생·구조 문제</td><td>즉시 전문가 상담 필요</td></tr>
      <tr><td>해당없음</td><td>해당 설비 없음·점검 제외</td><td>-</td></tr>
    </tbody>
  </table>

  <!-- QR 또는 링크 -->
  <div style="margin-top:24px; padding:16px; background:#f4f7fb; border-radius:8px; text-align:center">
    <div style="font-size:10px; color:#4a6a8a; margin-bottom:8px">카테고리별 상세 판정 기준은 아래에서 확인하세요:</div>
    <div style="font-size:11px; color:#1a3669; font-weight:600">https://theboda.io/criteria (예시 URL)</div>
  </div>

  ${pageFooter(report, pageNum)}
`));
```

**주의**: `window.CRITERIA_PAGES` 루프 전체 제거. `criteria-data.js`는 건드리지 않음(다른 곳에서 쓸 수 있음).

#### 옵션 B — 토글 설정 추가

보고서 생성 시 "부록 포함 여부"를 사용자가 선택하도록 함.

수정 필요:
- `DEFAULT_REPORT`에 `meta.includeAppendix: false` 같은 필드 추가 (스키마 변경이라 주의)
- `index.html`의 설정 탭에 체크박스
- `preview.html:1279-1318`을 `if (report.meta?.includeAppendix) { ... }`로 감싸기

**비권장**: 스키마 변경 + UI 작업까지 필요해서 범위 큼. 대신 본 피드백 목적(고객용 간결화)이 명확하니 옵션 A로 일괄 처리가 낫다.

#### 옵션 C — 카테고리별 상세를 2페이지로 축약

모든 카테고리 상세를 2컬럼 레이아웃으로 압축해 2페이지 내에 맞춤. 
- `cp.items`를 더 간결한 형태로 렌더
- 각 항목을 짧은 한 줄씩 (이름 + 최악 판정 기준만)
- CSS grid 2컬럼

**권장도 중간**: 옵션 A보다 정보량 유지, B보다 작업량 적음. 다만 CSS 조정 필요.

### 권장: 옵션 A (요약 1페이지 + 외부 링크)

- 고객 목적(부분 리모델링 의사결정)에 맞게 단순화
- 분량 대폭 감소 (11페이지 → 1~2페이지)
- 코드 변경 최소

### 테스트

1. 기존: import 후 `preview.html` → 전체 페이지 수 약 40+ 페이지 확인
2. 수정 후: 동일 import → 전체 페이지 수 약 30 페이지 이하로 감소 확인
3. Ctrl+P 인쇄 미리보기로 첫 페이지부터 마지막 페이지까지 훑어보며 레이아웃 깨짐 없는지
4. 서명 페이지(면책조항 + 서명)가 정상 위치에 있는지 확인

---

## 테스트 데이터

### 위치

```
REPORT/review-tool/reviews/경기도_성남시_분당구_미금로_23__구미동__무지개마을_대림아파트__20260410_496fnc/
├── versions/
│   ├── v001.json  ← 원본
│   ├── v002.json ~ v005.json  ← 검토 도구에서 편집된 버전
│   └── v005.json  ← 가장 완성된 상태 (권장)
└── images/         ← 이미지 파일들
```

### 기존 웹으로 import하는 방법

**방법 A — 검토 도구에서 내보내기**:
1. 브라우저에서 `REPORT/review-tool/review.html` 열기
2. 폴더 권한 복원 → 해당 리뷰 로드
3. 타임라인에서 `v005` 활성 상태 확인
4. 상단바 **[최종본 내보내기]** 클릭 → JSON 다운로드 (이미지 inline 포함된 full export)

**방법 B — 기존 웹에서 import**:
1. `REPORT/index.html` 열기 → 사이드바 **[불러오기 / 병합]** → 다운로드한 JSON 선택
2. "덮어쓰기" 선택
3. 사이드바 **[미리보기 / 출력]** → `preview.html` 로드
4. 각 작업별 테스트 항목 검증
5. Ctrl+P로 인쇄 미리보기 → A4 레이아웃 확인

### 테스트 리포트의 특징 (이 작업에 유리한 데이터)

v005의 카테고리별 subStatuses 현황:

| 카테고리 | good | normal | bad | danger | na | 종합 |
|---|---|---|---|---|---|---|
| A. 균열·안전·방수 | 1 | 2 | 3 | 1 | 1 | bad 우세 |
| B. 급배수·배관 | 3 | 0 | 0 | 0 | 4 | good / na 혼재 ← **작업 1 테스트 좋음** |
| C. 난방 | 2 | 0 | 0 | 0 | 5 | good / na 혼재 ← **작업 1 테스트 좋음** |
| D. 전기·가스 | 1 | 1 | 1 | 0 | 3 | 혼재 |
| E. 단열·결로 | 0 | 1 | 0 | 0 | 3 | na 우세 ← **작업 2 테스트 좋음** |
| F. 환기·공기질 | 0 | 0 | 0 | 0 | 5 | 전부 na ← **작업 2 테스트 최적** |
| G. 창호시스템 | 0 | 0 | 5 | 0 | 1 | bad 우세 |
| H. 생활기능·마감 | 0 | 0 | 0 | 0 | 4 | 전부 na ← **작업 2 테스트 최적** |

※ 위 숫자는 `subStatuses`만 기준. `subJudgments` 카운트는 추가됨.

---

## 우선순위 및 작업 순서 권장

1. **작업 2 (none 표기)**: 1줄 변경 + pb 함수 확인. 30분 이내. 리스크 최소.
2. **작업 1 (숫자 합산)**: 2~3개 위치 수정. 1시간 이내. 옵션 A 기준.
3. **작업 3 (부록 축약)**: 가장 큰 구조 변경. 2~3시간. 레이아웃 회귀 가능성.

**통합 테스트**: 3건 모두 완료 후 v005 리포트로 `preview.html` 전체 훑기 + Ctrl+P 인쇄 미리보기.

---

## 참고 — 검토 도구에서 이미 처리된 항목

이 3가지 이슈는 v005 JSON 데이터 레벨에서는 부분적으로 회피됨:
- **작업 1**: 데이터는 올바름 (calcCategoryStats 결과 자체는 정상, 표 렌더 문제)
- **작업 2**: E 카테고리 subStatuses를 실제 값으로 채워서 "none" 노출을 회피 (H는 여전히 전부 na라 노출됨)
- **작업 3**: JSON 데이터와 무관, 순수 템플릿 분량 문제

따라서 이번 웹 수정 작업은 **템플릿/렌더 로직** 레벨 수정이며, 데이터 스키마나 저장 포맷 변경은 필요 없습니다.

---

## 관련 문서

- 검토 도구 사용 로그: `REPORT/review-tool/reviews/{reportId}/notes.md` — v001~v005의 모든 변경 내역 및 외부 피드백 10포인트 처리 결과
- 검토 도구 Claude 가이드: `REPORT/review-tool/CLAUDE.md` — 참고용 (이 작업과 무관)
- 디자인 가이드: `C:/Users/nugul/OneDrive/바탕 화면/Vibe Coding/THEBODA-DESIGN-RULES.md` (전역 규칙)
