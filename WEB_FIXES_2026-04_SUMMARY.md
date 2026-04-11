# WEB_FIXES 2026-04 — 수정 요약 + 검토 도구 동기화 지시서

> 작성일: 2026-04-11
> 대상: 새 세션에서 `review-tool/` 검토 도구를 본 웹 시스템의 스키마 변화에 맞춰 동기화할 때 참고
> 선행 문서: `WEB_FIXES_2026-04_v2.md` (본 작업의 원본 지시서)

---

## 1. 이번 세션에서 수행한 수정 전체 목록

### Phase 1 — 데이터 정확성 (P0)

| # | 항목 | 파일 | 요약 |
|---|---|---|---|
| 1.1 | TOC off-by-one | `preview.html` buildAndInjectTOC 부근 | cover는 `finalNum` 재정렬에서 '표지'로 라벨되고 번호를 차지하지 않음 → TOC 카운트에서 제외 |
| 1.2 | totalStats catStats 합산 통일 | `preview.html` ~line 666 | Executive Summary와 세부진단 결과표가 동일 숫자를 쓰도록 `Report.calcCategoryStats` 합산으로 totalStats 재계산 |
| 1.3 | issueItemsP에 카드 subJudgments 포함 | `preview.html` ~line 1131 | 체크리스트뿐 아니라 카드 `subJudgments`의 bad/danger도 이슈 목록에 수집 (cards + cardSlots 모두) |
| 1.4 | durability 경고 집계 상태 필터 | `preview.html` ~line 677, 1143 | 잔여 5년 이하이면서 status가 `normal/bad/danger`인 항목만 카운트 (good/na 제외) |

### Phase 2 — 표기 명확성 (P1)

| # | 항목 | 파일 | 요약 |
|---|---|---|---|
| 2.1 | 진단 통계 캡션 | `preview.html` ~line 837, 1194 | "전체 N개 점검 항목 기준 · 해당없음 M개 별도" 캡션 추가 |
| 2.2 | 비용 "별도 산정" 뱃지 | `preview.html` `renderCost` helper (~line 589) | 0/0원을 pill 뱃지로 렌더. 적용 대상: heatingPipeCost, bathroomWaterproofCost, windowExteriorCost, plumbingCost |
| 2.3 | H 카테고리 전원 na 배너 분기 | `preview.html` ~line 1520 | 전원 na일 때 "점검 생략 — 리모델링 시 전면 재시공 전제" 참고 배너 표시 (긴급/주의/양호와 별도 분기) |
| 2.4 | 내구연한 시각 정리 | `preview.html` `getDurRemainingStyle` / `getDurNote` (~line 599) | status가 good/na이면 중립색 회색으로 표시. 잔여 5년 이하 경고 시 자동 코멘트 생성 |

### Phase 3 — 구조 일관성 (P1)

| # | 항목 | 파일 | 요약 |
|---|---|---|---|
| 3.1 | APPENDIX Report.CATEGORIES 전환 | `preview.html` ~line 1603 | APPENDIX 카드 리스트를 `criteria-data.js` 기준 → `Report.CATEGORIES` 기준으로 재작성. 세부진단 결과표와 subItem 리스트 동일화 |
| 3.2 | **`skippedNote` 스키마 필드 추가** | `preview.html` + `index.html` + `assets/report.js` | 옵션 C (schema field addition) 채택 — 카테고리별 "점검 생략 사유" 입력란 신설 |

### Phase 4 — 레이아웃 견고성 (P2)

| # | 항목 | 파일 | 요약 |
|---|---|---|---|
| 4.1 | splitOverflowPages orphan 수정 | `preview.html` ~line 2006 | `KEEP_WITH_NEXT_CLASSES`에 `meas-table-title` 추가. 계획서의 section-based 재작성 대신 실제 버그 원인을 직접 고침 |

### 기타 — UI/Asset

| 항목 | 파일 | 요약 |
|---|---|---|
| 사이드바 로고 추가 | `index.html`, `list.html` `.sidebar-logo` | `assets/ci-logo-light.png`를 두 줄 텍스트 왼쪽에 배치. 클릭 이동 기능은 **없음** (요청에 따라 제거) |
| 관련 asset | `assets/qr-consult.svg`, `assets/ci-logo-light.png` | 이미 커밋됨 (f001d2f) |

### Git 상태

- **커밋 `f001d2f`**: "1차 PDF 검수 피드백 14건 반영 — Phase 1~4 전체 적용"에 Phase 1~4 전체 + qr-consult.svg + WEB_FIXES_2026-04_v2.md 포함
- **push 완료**: `6521b71..f001d2f master -> master` (GitHub Pages 자동 배포)
- **로고 추가 작업**은 아직 미커밋 (index.html, list.html modified)

---

## 2. 검토 도구(review-tool)에 영향을 주는 변경

### 2.1 결정: Phase 1/2/4는 검토 도구와 **무관**

이유:
- Phase 1: 집계 로직 변경 (preview.html 렌더만)
- Phase 2: 표시 스타일 변경 (preview.html 렌더만)
- Phase 4: 페이지 분할 로직 변경 (preview.html 렌더만)

**→ 검토 도구는 스냅샷 JSON을 편집할 뿐 PDF를 렌더하지 않으므로 영향 없음.**

### 2.2 결정: Phase 3.1은 검토 도구와 **무관**

APPENDIX 렌더 소스만 바꿨을 뿐 `Report.CATEGORIES` 정의 자체는 손대지 않았습니다. 검토 도구의 `CATEGORY_META` (editor.js:67-94) 역시 동일 구조를 "축약 복사"한 것이라 라벨/섹션이 여전히 일치합니다.

> 단, 장래에 `Report.CATEGORIES`의 subItems/fixedTables가 변경되면 검토 도구도 수동 동기화가 필요합니다. 이건 이번 세션의 변경과 무관한 일반 원칙입니다.

### 2.3 **결정: Phase 3.2만 검토 도구에 작업이 필요함**

#### 추가된 스키마

```js
// assets/report.js (이번 세션에서 추가됨)
// DEFAULT_REPORT의 categoryData[cat]는 기존과 동일하게 유지 (backward compat)
// 단, collectFormData/merge/import 경로에서 아래 필드가 선택적으로 포함될 수 있음
categoryData.{A-H}.skippedNote: string  // 신규 필드
```

- `index.html`의 카테고리 카드 폼에 `<textarea id="cat_skip_{cat}">` 입력란 추가
- `assets/report.js` `collectFormData`에서 `cd.skippedNote = skipEl.value` 수집
- `assets/report.js` merge 경로에서 `mCd.skippedNote ||= inCd.skippedNote` 보존
- `preview.html`에서 `cd.skippedNote`가 truthy일 때 카테고리 페이지 상단(배너 아래)에 "참고 — 점검 생략 항목" 박스 렌더

#### 검토 도구의 현재 상태

1. **데이터 보존 여부**: [review-tool/assets/store.js:83-84](review-tool/assets/store.js#L83-L84)가 `JSON.parse(JSON.stringify(data))`로 전체 복사 후 mutate → skippedNote 값이 파일에 있으면 **편집해도 자동 보존**됨 (데이터 손실 없음)

2. **편집 UI 존재 여부**: [review-tool/assets/editor.js:481-488](review-tool/assets/editor.js#L481-L488) `renderDetailOpinion`에 `categoryData.{cat}.opinion` textarea만 있음. **skippedNote 입력/표시 UI 없음** → 검토자가 값을 확인하거나 수정할 수 없음

3. **PathUtils.forbid 영향 여부**: [review-tool/assets/store.js:103-106](review-tool/assets/store.js#L103-L106) `updateField`가 `PathUtils.forbid`로 금지 경로 체크. `categoryData.{X}.skippedNote`는 금지 목록에 없으므로 허용됨 (path-utils.js 확인 권장)

### 2.4 검토 도구 수정 체크리스트

다음은 새 세션에서 작업할 때의 권장 순서입니다. 실제 코드는 새 세션에서 파일을 직접 읽고 판단하세요.

#### (1) editor.js — skippedNote 편집 UI 추가

**위치**: [review-tool/assets/editor.js:481-488](review-tool/assets/editor.js#L481-L488) `renderDetailOpinion` 근처

**작업**:
- `renderDetailSkippedNote(cat, catData)` 헬퍼 신설
- `renderDetail()`에서 `renderDetailOpinion` 다음(또는 바로 위)에 호출
- UI는 1~2줄 textarea면 충분 (본 웹의 `<textarea id="cat_skip_{cat}" rows="2">`와 동일 톤)
- placeholder: `"예: 현장 일정 제약으로 결로 측정 미실시 — 별도 일정에 재점검 예정"` (본 웹과 동일 문구 권장 → UX 일관성)
- data-path: `categoryData.${cat}.skippedNote`
- 기존 값: `catData.skippedNote || ''`

**참고**: 현재 `.sub-block` / `.full-textarea` 클래스를 그대로 재사용 가능

#### (2) editor.css — 필요 시 라벨 톤 구분

**검토 포인트**: 종합 의견과 시각적으로 구분되도록 섹션 타이틀을 다르게 할지 여부

- 간단하게는 기존 `.sub-block-title` 그대로 두고 제목 텍스트만 "점검 생략 사유 (선택)"으로 구분
- 더 명확히는 본 웹처럼 `background: #f4f7fb` + `border-left: 3px solid #7a8fa3` 박스 스타일 적용 (본 웹 `.cat-skip-wrap` 참조)

#### (3) CLAUDE.md — 수정 가능한 필드 표에 추가

**위치**: [review-tool/CLAUDE.md:77-91](review-tool/CLAUDE.md#L77-L91) "수정 가능한 필드" 테이블

**추가할 행**:
```
| `categoryData.{A-H}.skippedNote` | 카테고리 점검 생략 사유 — 입력 시 보고서에 참고 박스로 표시 |
```

**추가 위치**: `categoryData.{A-H}.opinion` 행 바로 아래

#### (4) path-utils.js forbid 정책 확인 (선택)

**체크**: `categoryData.*.skippedNote`가 `PathUtils.forbid()`에 걸리지 않는지 확인

일반적으로 `*.id`, `*.createdAt`, `meta.*` 등이 금지 대상이라 skippedNote는 자유롭게 편집 가능할 것으로 예상되지만, 실제 코드는 확인 필요.

#### (5) 회귀 테스트

1. skippedNote 값이 있는 JSON으로 로드 → 기존 값이 UI에 표시되는지
2. 값을 수정 → 새 버전 저장 → v###.json에 반영됐는지
3. 값이 없는 기존 v001 데이터도 여전히 로드되는지 (backward compat)
4. opinion 편집만 했을 때 skippedNote가 그대로 유지되는지 (기존 동작 보장)

---

## 3. 새 세션에서 작업을 시작할 때의 프롬프트 예시

> `REPORT/WEB_FIXES_2026-04_SUMMARY.md`를 읽고, 거기 명시된 "검토 도구 수정 체크리스트" 섹션의 (1)~(5)를 순서대로 진행해줘. 본 웹에서 이미 추가된 `categoryData.{A-H}.skippedNote` 필드를 review-tool의 editor.js에서도 편집할 수 있도록 하는 작업이야. 본 웹의 `index.html` `cat_skip_{cat}` 부분과 `preview.html` `skipNoteHTML` 부분을 참고 구현으로 삼고, 검토 도구 고유의 규약(CLAUDE.md의 append-only meta, 직접 수정 vs 제안 등)은 그대로 지켜줘.

---

## 4. 손대지 말아야 할 것 (명시적 범위 밖)

- **`categoryData.{X}.opinion` 등 기존 필드 구조** — skippedNote와 무관, 건드리지 말 것
- **`CATEGORY_META` 라벨/섹션 변경** — 이번 변경(3.1)은 APPENDIX 렌더 소스만 바꿨을 뿐 Report.CATEGORIES 자체는 동일
- **버전 파일 구조** (v###.json, meta.json, source.json) — append-only 규약 유지
- **`meta.*` 필드 / `*.id` / `createdAt`, `updatedAt`** — 금지 규칙 그대로

---

## 5. 참고 파일 경로

| 목적 | 파일 |
|---|---|
| 본 작업 원본 지시서 | `WEB_FIXES_2026-04_v2.md` |
| 본 웹 데이터 모델 | `assets/report.js` (DETAIL_CATEGORIES, createDefaultReport) |
| 본 웹 입력 UI (skippedNote) | `index.html` — `cat_skip_` 검색 |
| 본 웹 렌더 (skippedNote) | `preview.html` — `skipNoteHTML` 검색 |
| 검토 도구 폼 에디터 | `review-tool/assets/editor.js` (renderDetailOpinion 부근) |
| 검토 도구 저장 로직 | `review-tool/assets/store.js` (updateField, saveNewVersion) |
| 검토 도구 경로 유틸 | `review-tool/assets/path-utils.js` |
| 검토 도구 편집 가이드 | `review-tool/CLAUDE.md` |
