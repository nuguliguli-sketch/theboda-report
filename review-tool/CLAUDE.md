# 더보다 AI 검토 도구 — Claude 편집 가이드

이 폴더(`review-tool/`)는 독립 검토·편집 도구입니다. 기존 웹(`REPORT/*`)과 분리되어 있으며,
버전 스냅샷 기반 히스토리와 파일시스템 저장소로 구성되어 있습니다.

## 당신(Claude)이 해야 할 일

사용자가 `"v005에서 A-1 판정을 위험으로 바꿔줘"` 같이 지시하면, 아래 절차로 파일을 편집·저장합니다.
웹 UI와 당신은 **같은 파일을 공유**하므로, 사용자가 브라우저에서 새로고침하면 당신의 변경이 즉시 반영됩니다.

---

## 저장소 구조

```
reviews/{reportId}/
├── source.json       ← 원본 (절대 수정 금지)
├── meta.json         ← 버전 인덱스 + activeVersion 포인터
├── versions/
│   ├── v001.json     ← 전체 스냅샷 (한 파일 = 그 버전의 전체 상태)
│   ├── v002.json
│   └── ...
├── images/
│   └── {imageId}.txt ← base64 data URL (수정 금지)
└── notes.md          ← 자유 메모 (편집 가능)
```

**핵심**: 각 `v###.json`은 그 시점의 전체 보고서 상태를 담은 완전한 JSON. 한 파일만 읽으면 전체 파악 가능.

---

## 새 버전 만들기 — 기본 절차

사용자가 편집을 요청하면 다음 순서를 반드시 따릅니다:

1. **Read `reviews/{reportId}/meta.json`** — `activeVersion` 확인 (예: `"v005"`)
2. **Read `reviews/{reportId}/versions/v005.json`** — 전체 상태 파악
3. **수정** — 지시된 필드를 목적에 맞게 변경
4. **다음 버전 ID 계산** — `meta.versions` 배열에서 최대 `v###` 추출 후 +1, 3자리 패딩 (`v006`)
5. **Write `reviews/{reportId}/versions/v006.json`** — 수정된 전체 JSON
6. **meta.json 업데이트**:
   - `versions` 배열에 새 엔트리 **append**:
     ```json
     {
       "id": "v006",
       "timestamp": "2026-04-11T15:00:00.000Z",
       "author": "claude",
       "label": "A-1 판정 강화",
       "description": "현장 재확인 요청에 따라 보수→위험으로 상향",
       "parentVersion": "v005",
       "changedPaths": ["categoryData.A.cards[0].status"]
     }
     ```
   - `activeVersion`을 `"v006"`으로 변경
7. **Write `reviews/{reportId}/meta.json`** — 갱신된 전체 meta

> ⚠ 이전 버전 파일(`v001.json` ~ `v005.json`)은 절대 수정하지 않습니다. append-only.

---

## 수정 가능한 필드

| 경로 | 설명 |
|---|---|
| `basic.address`, `basic.unit`, `basic.clientName` ... | 기본 정보 (주소/호수/의뢰인은 신중히) |
| `basic.managementIssues` | 관리 이슈 텍스트 |
| `indicators.*` | 안전·성능 지표 등급 및 코멘트 |
| `indicators.*Comment` | 지표별 상세 코멘트 |
| `durability[n].comment` | 내구연한 항목 코멘트 |
| `durability[n].status` | 내구연한 상태 (`'good'`/`'normal'`/`'bad'`/`'danger'`/`'na'`) |
| `summary.summaryText` | 종합 요약 본문 |
| `summary.priorityActions` | 우선 조치 사항 |
| `summary.overallStatus` | 전반적 상태 |
| `expertOpinion.safetyRisk` | 안전 리스크 의견 |
| `expertOpinion.costRisk` | 비용 리스크 의견 |
| `expertOpinion.livingPerformance` | 거주 성능 의견 |
| `categoryData.{A-H}.opinion` | 카테고리별 종합 의견 |
| `categoryData.{A-H}.skippedNote` | 카테고리 점검 생략 사유 — 입력 시 보고서 카테고리 페이지 상단에 "참고 — 점검 생략 항목" 박스로 표시 |
| `categoryData.{A-H}.subStatuses.{subItem}` | 세부 점검 항목 상태 |
| `categoryData.{A-H}.cards[n].title` | 카드 제목 |
| `categoryData.{A-H}.cards[n].fieldNote` | 현장 확인 내용 (관찰사항) |
| `categoryData.{A-H}.cards[n].fieldNoteEnabled` | 현장 확인 섹션 사용 여부 |
| `categoryData.{A-H}.cards[n].actionGuide` | 조치 가이드 (권고 사항) |
| `categoryData.{A-H}.cards[n].actionGuideEnabled` | 조치 가이드 섹션 사용 여부 |
| `categoryData.{A-H}.cards[n].subJudgments[m].status` | 세부 판정 상태 (enum) |
| `categoryData.{A-H}.cards[n].subJudgments[m].name` | ⚠ 구조 변경 — 사용자 확인 필요 |
| `categoryData.{A-H}.cards[n].photos[p].captionTitle` | 사진 캡션 제목 |
| `categoryData.{A-H}.cards[n].photos[p].captionDetail` | 사진 캡션 설명 |
| `categoryData.{A-H}.cards[n].photos[p].observation` | 사진 개별 관찰사항 |
| `categoryData.{A-H}.cardSlots.{slotKey}[n].*` | 슬롯별 카드 (D, E 카테고리) — cards와 동일 구조 |
| `categoryData.{A-H}.fixedTables.{tableKey}[n].value` | 고정 테이블 셀 값 |
| `categoryData.{A-H}.fixedTables.{tableKey}[n].comment` | 고정 테이블 코멘트 |

**상태 값 enum**: `'good'` (특이사항없음) · `'normal'` (경미·관리필요) · `'bad'` (보수·교체권장) · `'danger'` (즉시조치필요) · `'na'` (해당없음) · `''` (미입력)

---

## 절대 수정 금지

- **`meta.*` 전체 (보고서 본문 내)** — `report.meta.id`, `createdAt`, `updatedAt`, `version` 등. 단, **meta.json 파일**의 `versions` 배열과 `activeVersion` 업데이트는 절차의 일부로 허용
- **모든 `id` 필드** — `card.id`, `subJudgments[i].id`, `photos[i].id` 등
- **`createdAt` / `updatedAt`** — 자동 관리
- **`source.json`** — 원본 보존
- **`images/` 폴더의 모든 파일** — 이미지는 절대 수정하지 않음
- **배열 길이·구조 변경** — 카드 추가/삭제, `subItems` 추가, `fixedTables` 행 추가/삭제 등 **구조적 변경은 금지**. 사용자가 명시적으로 요청해도 먼저 확인 요청.

### JSON 경로로 금지 규칙 표현

```
meta.*
*.id
*.photos[*].id
*.createdAt
*.updatedAt
source.json (파일 자체)
images/** (폴더 전체)
```

---

## 직접 수정 vs 제안만

### 직접 수정해도 되는 것
- 오타, 맞춤법 오류, 띄어쓰기
- 조사·어미 오류 (은/는, 이/가, 을/를)
- 명백한 문장 중복이나 오사용
- 숫자 형식 일관성 (예: "100만원" → "1,000,000원" 같은 통일)

### 반드시 사용자 확인 후
- **판정 등급 변경** (`status`, `overallStatus`)
- 문장 재구성 / 문체 변경
- 기술적 판단 변경 (보수 권고 강도 등)
- 우선 조치 사항의 순서 변경
- 비용 추정치 수정

> 판단이 애매하면 `notes.md`에 `- [제안] ...` 형식으로 기록하고, 본문은 그대로 둡니다.
> 사용자가 "notes.md 제안 반영해줘"라고 하면 그때 적용.

---

## changedPaths 형식

JSON dot-path로 각 변경을 기록합니다.

예시:
```
basic.address
basic.managementIssues
indicators.gasSafety
indicators.gasSafetyComment
durability[2].comment
durability[2].status
summary.summaryText
summary.priorityActions
expertOpinion.safetyRisk
categoryData.A.opinion
categoryData.A.subStatuses.구조부 균열
categoryData.A.cards[0].title
categoryData.A.cards[0].fieldNote
categoryData.A.cards[0].actionGuide
categoryData.A.cards[0].subJudgments[1].status
categoryData.A.cards[0].photos[0].captionTitle
categoryData.A.cards[0].photos[0].captionDetail
categoryData.D.cardSlots.electric[0].fieldNote
categoryData.D.cardSlots.electric[0].actionGuide
categoryData.B.fixedTables.waterPressure[0].value
```

**주의**: 한글 키(`subStatuses.구조부 균열` 같은)도 유효한 경로입니다. 공백 포함 가능.

---

## 라벨 / 설명 작성 지침

`meta.versions[].label`은 타임라인에 표시되는 **짧은 제목** (60자 이내 권장).

좋은 예:
- `"오타·맞춤법 수정"`
- `"A-1 판정 강화"`
- `"구조부 균열 관찰사항 구체화"`
- `"전문가 의견 문체 통일"`

`description`은 좀 더 자세한 요약 (2~3줄 정도).

좋은 예:
- `"카테고리 A, C, E에서 12건의 오타와 조사 오류를 수정"`
- `"현장 재확인 요청에 따라 보수→위험으로 상향, 긴급성 반영"`

---

## 데이터 모델 전체 참조

전체 스키마는 기존 웹의 `REPORT/assets/report.js` 파일을 참고하세요:
- `createDefaultReport()` 함수 (247~344줄) — 모든 필드의 기본값
- `DETAIL_CATEGORIES` 상수 (36~215줄) — 카테고리별 subItems / fixedTables 구조
- `STATUS_MAP` (14~20줄) — 상태 enum 정의
- `DEFAULT_DURABILITY` (233~242줄) — 내구연한 기본 항목

단, 검토 도구는 기존 웹과 **독립**이므로 `report.js`를 import하거나 의존하지 않습니다.
스키마는 가져올 당시(`v001` 시점)에 고정됩니다.

---

## 파일 한 줄 요약

| 파일 | 수정 여부 |
|---|---|
| `source.json` | ❌ 절대 수정 금지 |
| `versions/v###.json` (기존) | ❌ 수정 금지, 새 파일로 Write만 |
| `meta.json` | ✅ `versions` 배열 **append** + `activeVersion` 업데이트만 |
| `images/*.txt` | ❌ 절대 수정 금지 |
| `notes.md` | ✅ 자유 편집 |

---

## 빠른 참조 — 전형적인 요청 처리

### "v005에서 summary를 다듬어줘"
1. `meta.json` Read → activeVersion='v005' 확인
2. `versions/v005.json` Read
3. `summary.summaryText`, `summary.priorityActions` 다듬기
4. `versions/v006.json` Write
5. `meta.json`에 v006 엔트리 append (author='claude', label='종합판단 문체 정리', changedPaths=['summary.summaryText', 'summary.priorityActions']), activeVersion='v006'
6. `meta.json` Write

### "카테고리 A의 오타 고쳐줘"
1. activeVersion 확인
2. 해당 버전 파일 Read
3. `categoryData.A.opinion`, `categoryData.A.cards[*].observation`, `categoryData.A.cards[*].judgment` 전체 훑어서 오타·맞춤법·조사 수정
4. 새 버전 Write + meta.json append
5. description에 수정 건수 명시 (예: "A 카테고리 8건의 오타·맞춤법 수정")

### "v003이랑 v005 비교해줘"
- 파일 기반 비교는 UI에서 처리됩니다. 당신은 필요하면 `versions/v003.json`과 `versions/v005.json`을 둘 다 Read해서 차이점을 자연어로 설명합니다. 파일 수정은 하지 않습니다.

### "notes.md에 제안만 남겨줘"
1. `notes.md` Read
2. 하단에 `## 제안 (타임스탬프)` 섹션을 추가하여 제안 항목을 bullet로 정리
3. `notes.md` Write
4. versions / meta.json은 건드리지 않음

---

## 실패 시 원칙

- meta.json의 **기존 엔트리는 절대 수정하지 않습니다** — 오직 append.
- v### 파일을 Write하기 전에 반드시 다음 번호가 맞는지 meta.json을 최신으로 확인하세요. 여러 편집이 동시에 일어나면 번호 충돌 가능.
- 수정 도중 뭔가 확실치 않으면 멈추고 사용자에게 확인을 요청합니다. "더 좋게" 만들려다 스키마를 망가뜨리면 롤백이 번거롭습니다 (파일 자체는 append-only라 이전 버전은 남지만, meta 충돌은 UI를 혼란시킵니다).
