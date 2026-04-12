/**
 * 더보다 AI 검토 도구 — 폼 에디터 (M2)
 *
 * M1 탭: 기본정보, 종합지표, 종합판단, 전문가 의견
 * M2 추가: 내구연한, 세부진단 (A~H 카테고리 + subStatuses + fixedTables + cards)
 *
 * 원칙:
 * - 입력 시 Store.updateField(path, value) 만 호출, 재렌더 X (포커스 유지)
 * - 버전/탭 전환 시 전체 재렌더
 * - data-path 속성으로 JSON 경로 직접 매핑
 * - pill 라디오는 data-pill-path(그룹) + data-pill-value(버튼)로 위임
 */

(function () {
  // ═══════════════════════════════════════════════════════
  // 상수
  // ═══════════════════════════════════════════════════════

  const TABS = [
    { id: 'basic',      label: '기본정보',   render: renderBasic },
    { id: 'indicators', label: '종합지표',   render: renderIndicators },
    { id: 'durability', label: '내구연한',   render: renderDurability },
    { id: 'summary',    label: '종합판단',   render: renderSummary },
    { id: 'expert',     label: '전문가 의견', render: renderExpert },
    { id: 'detail',     label: '세부진단',   render: renderDetail },
  ];

  const STATUS_OPTIONS = [
    { value: '',       label: '미입력' },
    { value: 'good',   label: '특이사항없음 (양호)' },
    { value: 'normal', label: '경미·관리필요 (경미)' },
    { value: 'bad',    label: '보수·교체권장 (보수)' },
    { value: 'danger', label: '즉시조치필요 (즉시)' },
    { value: 'na',     label: '해당없음 (N/A)' },
  ];

  const STATUS_PILLS = [
    { value: '',       label: '미입력', cls: 'empty' },
    { value: 'good',   label: '양호',  cls: 'good' },
    { value: 'normal', label: '경미',  cls: 'normal' },
    { value: 'bad',    label: '보수',  cls: 'bad' },
    { value: 'danger', label: '즉시',  cls: 'danger' },
    { value: 'na',     label: 'N/A',   cls: 'na' },
  ];

  const GRADE_OPTIONS = [
    { value: '',  label: '미입력' },
    { value: 'A', label: 'A (우수)' },
    { value: 'B', label: 'B (양호)' },
    { value: 'C', label: 'C (보통)' },
    { value: 'D', label: '미흡' },
    { value: 'E', label: '불량' },
  ];

  const DURABILITY_COLUMNS = [
    { header: '항목',         key: 'item',      editable: false },
    { header: '표준연한(년)', key: 'standard',  editable: true,  type: 'number' },
    { header: '경과연수(년)', key: 'current',   editable: true,  type: 'number' },
    { header: '잔여연한(년)', key: 'remaining', editable: true,  type: 'number' },
    { header: '상태',         key: 'status',    editable: true,  type: 'pill' },
    { header: '코멘트',       key: 'comment',   editable: true,  type: 'text' },
  ];

  // ─── 세부진단 카테고리 메타 ──────────────────────────
  //   (기존 웹 assets/report.js:36-215의 DETAIL_CATEGORIES를 축약 복사)
  //   라벨과 sections 순서만 가지고 있음 — subItems는 실제 데이터에서 추출
  const CATEGORY_META = {
    A: { label: 'A. 균열·안전·방수', sections: null, tables: [] },
    B: { label: 'B. 급배수·배관',    sections: null, tables: ['waterQuality', 'heavyMetal', 'sanitation', 'waterPressure'] },
    C: { label: 'C. 난방',           sections: null, tables: [] },
    D: {
      label: 'D. 전기·가스',
      tables: ['panelSpec', 'gasCheck'],
      sections: [
        { type: 'table', key: 'panelSpec' },
        { type: 'cards', key: 'electric', label: '전기설비 진단 카드' },
        { type: 'table', key: 'gasCheck' },
        { type: 'cards', key: 'gas',      label: '가스설비 진단 카드' },
      ],
    },
    E: {
      label: 'E. 단열·결로',
      tables: ['thermalBridge', 'condensation'],
      sections: [
        { type: 'table', key: 'thermalBridge' },
        { type: 'cards', key: 'thermal',  label: '열교 진단 카드' },
        { type: 'table', key: 'condensation' },
        { type: 'cards', key: 'condense', label: '결로 진단 카드' },
      ],
    },
    F: { label: 'F. 환기·공기질',    sections: null, tables: ['iaq'] },
    G: { label: 'G. 창호시스템',     sections: null, tables: ['windowSpec'] },
    H: { label: 'H. 생활기능·마감',  sections: null, tables: [] },
  };
  const CATEGORY_ORDER = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  // ─── fixedTable 컬럼 매핑 ────────────────────────────
  //   각 테이블의 컬럼 순서 + key + 편집 가능 여부 + 제목
  const TABLE_DEFS = {
    waterQuality: {
      title: '기초수질',
      columns: [
        { header: '측정항목', key: 'item',     editable: false },
        { header: '측정값',   key: 'value',    editable: true  },
        { header: '기준값',   key: 'standard', editable: false },
        { header: '결과',     key: 'result',   editable: true  },
      ],
    },
    heavyMetal: {
      title: '중금속 간이검사',
      columns: [
        { header: '측정항목', key: 'item',     editable: false },
        { header: '측정값',   key: 'value',    editable: true  },
        { header: '기준값',   key: 'standard', editable: false },
        { header: '결과',     key: 'result',   editable: true  },
      ],
    },
    sanitation: {
      title: '위생·안전성 오염지표',
      columns: [
        { header: '측정항목', key: 'item',     editable: false },
        { header: '측정값',   key: 'value',    editable: true  },
        { header: '기준값',   key: 'standard', editable: false },
        { header: '결과',     key: 'result',   editable: true  },
      ],
    },
    waterPressure: {
      title: '수압 측정',
      columns: [
        { header: '장소',             key: 'location', editable: true },
        { header: '측정값 (kgf/cm²)', key: 'value',    editable: true },
      ],
    },
    panelSpec: {
      title: '분전반 사양',
      columns: [
        { header: '구분', key: 'item',  editable: false },
        { header: '사양', key: 'value', editable: true  },
        { header: '참고', key: 'note',  editable: true  },
      ],
    },
    gasCheck: {
      title: '가스 점검',
      columns: [
        { header: '장소',     key: 'location', editable: true },
        { header: '측정지점', key: 'point',    editable: true },
        { header: '누설경보', key: 'alarm',    editable: true },
      ],
    },
    thermalBridge: {
      title: '열교 측정',
      columns: [
        { header: '점검장소',       key: 'location',    editable: true },
        { header: '기준면온도(°C)', key: 'refTemp',     editable: true },
        { header: '의심부온도(°C)', key: 'suspectTemp', editable: true },
        { header: '온도차(°C)',     key: 'diff',        editable: true },
        { header: '설명',           key: 'description', editable: true },
      ],
    },
    condensation: {
      title: '결로(노점) 측정',
      columns: [
        { header: '점검장소',      key: 'location',     editable: true },
        { header: '표면온도(°C)',  key: 'surfaceTemp',  editable: true },
        { header: '상대습도(%)',   key: 'humidity',     editable: true },
        { header: '노점온도(°C)',  key: 'dewPoint',     editable: true },
        { header: '설명',          key: 'description',  editable: true },
      ],
    },
    iaq: {
      title: '공기질(IAQ) 측정',
      columns: [
        { header: '점검장소',     key: 'location', editable: true },
        { header: '라돈(Bq/m³)',  key: 'radon',    editable: true },
        { header: 'HCHO(㎍/m³)',  key: 'hcho',     editable: true },
        { header: 'TVOC(㎍/m³)',  key: 'tvoc',     editable: true },
        { header: 'PM2.5(㎍/m³)', key: 'pm25',     editable: true },
        { header: 'PM10(㎍/m³)',  key: 'pm10',     editable: true },
      ],
    },
    windowSpec: {
      title: '창호 사양',
      columns: [
        { header: '항목',     key: 'item',  editable: false },
        { header: '세부내용', key: 'value', editable: true  },
        { header: '참고',     key: 'note',  editable: true  },
      ],
    },
  };

  // ═══════════════════════════════════════════════════════
  // 상태
  // ═══════════════════════════════════════════════════════
  let currentTab = 'basic';
  let currentDetailCategory = 'A';
  let mountEl = null;

  // ═══════════════════════════════════════════════════════
  // HTML 유틸
  // ═══════════════════════════════════════════════════════
  function escapeHTML(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(s) {
    return escapeHTML(s);
  }

  function fieldInput(label, path, value, opts = {}) {
    const type = opts.type || 'text';
    const placeholder = opts.placeholder || '';
    const readonly = opts.readonly ? 'readonly' : '';
    return `
      <div class="field">
        <label>${escapeHTML(label)}</label>
        <input type="${type}" data-path="${escapeAttr(path)}" value="${escapeHTML(value || '')}" placeholder="${escapeHTML(placeholder)}" ${readonly}>
      </div>
    `;
  }

  function fieldTextarea(label, path, value, opts = {}) {
    const rows = opts.rows || 3;
    const placeholder = opts.placeholder || '';
    return `
      <div class="field field-textarea">
        <label>${escapeHTML(label)}</label>
        <textarea data-path="${escapeAttr(path)}" rows="${rows}" placeholder="${escapeHTML(placeholder)}">${escapeHTML(value || '')}</textarea>
      </div>
    `;
  }

  function fieldSelect(label, path, value, options) {
    const opts = options.map((o) =>
      `<option value="${escapeAttr(o.value)}" ${o.value === (value || '') ? 'selected' : ''}>${escapeHTML(o.label)}</option>`
    ).join('');
    return `
      <div class="field">
        <label>${escapeHTML(label)}</label>
        <select data-path="${escapeAttr(path)}">${opts}</select>
      </div>
    `;
  }

  function fieldCheckbox(label, path, value) {
    return `
      <div class="field field-checkbox">
        <label>
          <input type="checkbox" data-path="${escapeAttr(path)}" ${value ? 'checked' : ''}>
          ${escapeHTML(label)}
        </label>
      </div>
    `;
  }

  function sectionHeader(title, desc) {
    return `
      <div class="section-header">
        <h3>${escapeHTML(title)}</h3>
        ${desc ? `<p class="section-desc">${escapeHTML(desc)}</p>` : ''}
      </div>
    `;
  }

  // pill 라디오 그룹
  function renderPill(path, value, options) {
    const cur = value || '';
    return `
      <div class="pill-group" data-pill-path="${escapeAttr(path)}">
        ${options.map((o) =>
          `<button type="button" class="pill-option ${o.cls} ${o.value === cur ? 'active' : ''}" data-pill-value="${escapeAttr(o.value)}">${escapeHTML(o.label)}</button>`
        ).join('')}
      </div>
    `;
  }

  // 편집 가능 셀 테이블 (공통 렌더러)
  function renderEditableTable(rows, colDefs, basePath) {
    return `
      <div class="data-table-wrap">
        <table class="data-table">
          <thead>
            <tr>${colDefs.map((c) => `<th>${escapeHTML(c.header)}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${rows.map((row, i) => `
              <tr>
                ${colDefs.map((c) => {
                  const path = `${basePath}[${i}].${c.key}`;
                  const val = row[c.key] == null ? '' : row[c.key];
                  if (!c.editable) return `<td class="readonly">${escapeHTML(val)}</td>`;
                  if (c.type === 'pill') {
                    return `<td class="pill-cell">${renderPill(path, val, STATUS_PILLS)}</td>`;
                  }
                  const type = c.type === 'number' ? 'number' : 'text';
                  return `<td><input type="${type}" data-path="${escapeAttr(path)}" value="${escapeHTML(val)}"></td>`;
                }).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // ═══════════════════════════════════════════════════════
  // 탭별 렌더
  // ═══════════════════════════════════════════════════════
  function renderBasic(data) {
    const b = data.basic || {};
    return `
      ${sectionHeader('기본 정보', '보고서 상단에 표시되는 기본 메타데이터')}
      <div class="field-grid">
        ${fieldInput('주소', 'basic.address', b.address)}
        ${fieldInput('호수', 'basic.unit', b.unit)}
        ${fieldInput('전용면적 (㎡)', 'basic.area', b.area)}
        ${fieldInput('공급면적 (㎡)', 'basic.supplyArea', b.supplyArea)}
        ${fieldInput('준공년도', 'basic.buildingYear', b.buildingYear, { type: 'number' })}
        ${fieldInput('준공월', 'basic.buildingMonth', b.buildingMonth, { type: 'number' })}
        ${fieldInput('층 수 (전체)', 'basic.floorTotal', b.floorTotal)}
        ${fieldInput('해당 층', 'basic.floorUnit', b.floorUnit)}
        ${fieldInput('구조', 'basic.structure', b.structure)}
        ${fieldInput('용도', 'basic.usage', b.usage)}
        ${fieldInput('난방 방식', 'basic.heatingType', b.heatingType)}
        ${fieldInput('증·개축 현황', 'basic.extensionStatus', b.extensionStatus)}
        ${fieldInput('현재 거주 상태', 'basic.currentOccupancy', b.currentOccupancy)}
        ${fieldInput('진단일', 'basic.inspectionDate', b.inspectionDate, { type: 'date' })}
        ${fieldInput('진단자', 'basic.inspectorName', b.inspectorName)}
        ${fieldInput('보고서 발행일', 'basic.reportDate', b.reportDate, { type: 'date' })}
        ${fieldInput('의뢰인', 'basic.clientName', b.clientName)}
        ${fieldInput('보고서 번호', 'basic.reportNo', b.reportNo, { readonly: true })}
      </div>
      ${fieldTextarea('관리 이슈 / 공용부 특이사항', 'basic.managementIssues', b.managementIssues, { rows: 4 })}
    `;
  }

  function renderIndicators(data) {
    const i = data.indicators || {};
    return `
      ${sectionHeader('안전 지표', '가스·전기·구조 안전성 등급 및 코멘트')}
      <div class="field-grid">
        ${fieldSelect('가스 안전성', 'indicators.gasSafety', i.gasSafety, STATUS_OPTIONS)}
        ${fieldSelect('전기 안전성', 'indicators.electricalSafety', i.electricalSafety, STATUS_OPTIONS)}
        ${fieldSelect('구조 안전성', 'indicators.structuralSafety', i.structuralSafety, STATUS_OPTIONS)}
      </div>
      ${fieldTextarea('가스 안전성 코멘트', 'indicators.gasSafetyComment', i.gasSafetyComment)}
      ${fieldTextarea('전기 안전성 코멘트', 'indicators.electricalSafetyComment', i.electricalSafetyComment)}
      ${fieldTextarea('구조 안전성 코멘트', 'indicators.structuralSafetyComment', i.structuralSafetyComment)}

      ${sectionHeader('성능 지표', '설비·환경·단열·마감 성능')}
      <div class="field-grid">
        ${fieldSelect('설비 성능', 'indicators.equipmentPerformance', i.equipmentPerformance, STATUS_OPTIONS)}
        ${fieldSelect('환경 쾌적성', 'indicators.environmentComfort', i.environmentComfort, STATUS_OPTIONS)}
        ${fieldSelect('단열 성능', 'indicators.insulationPerformance', i.insulationPerformance, STATUS_OPTIONS)}
        ${fieldSelect('마감 성능', 'indicators.finishPerformance', i.finishPerformance, STATUS_OPTIONS)}
      </div>

      ${sectionHeader('환경 등급', '일조·개방성·태양광 노출')}
      <div class="field-grid">
        ${fieldSelect('일조 등급', 'indicators.sunlightGrade', i.sunlightGrade, GRADE_OPTIONS)}
        ${fieldSelect('개방 등급', 'indicators.opennessGrade', i.opennessGrade, GRADE_OPTIONS)}
        ${fieldSelect('태양광 등급', 'indicators.solarGrade', i.solarGrade, GRADE_OPTIONS)}
      </div>

      ${sectionHeader('주요 보수 비용 (만원)', '예상 보수 범위')}
      <div class="field-grid">
        ${fieldInput('난방배관', 'indicators.heatingPipeCost', i.heatingPipeCost)}
        ${fieldInput('욕실방수', 'indicators.bathroomWaterproofCost', i.bathroomWaterproofCost)}
        ${fieldInput('창호외부', 'indicators.windowExteriorCost', i.windowExteriorCost)}
        ${fieldInput('전기공사', 'indicators.electricalCost', i.electricalCost)}
        ${fieldInput('급배수', 'indicators.plumbingCost', i.plumbingCost)}
      </div>
      ${fieldTextarea('난방배관 코멘트', 'indicators.heatingPipeComment', i.heatingPipeComment)}
      ${fieldTextarea('욕실방수 코멘트', 'indicators.bathroomWaterproofComment', i.bathroomWaterproofComment)}
      ${fieldTextarea('창호외부 코멘트', 'indicators.windowExteriorComment', i.windowExteriorComment)}
      ${fieldTextarea('전기공사 코멘트', 'indicators.electricalCostComment', i.electricalCostComment)}
      ${fieldTextarea('급배수 코멘트', 'indicators.plumbingComment', i.plumbingComment)}

      ${sectionHeader('총 예상 보수 비용 (만원)', '')}
      <div class="field-grid">
        ${fieldInput('최소', 'indicators.repairCostMin', i.repairCostMin)}
        ${fieldInput('최대', 'indicators.repairCostMax', i.repairCostMax)}
      </div>
    `;
  }

  function renderDurability(data) {
    const rows = Array.isArray(data.durability) ? data.durability : [];
    return `
      ${sectionHeader('내구연한', '건물 설비의 표준연한 대비 경과 및 잔여 연한')}
      ${rows.length === 0
        ? '<div class="change-empty">내구연한 데이터 없음</div>'
        : renderEditableTable(rows, DURABILITY_COLUMNS, 'durability')}
      <div class="field-hint">💡 행 추가·삭제는 지원하지 않습니다. 항목 구조 변경은 기존 웹에서 해주세요.</div>
    `;
  }

  function renderSummary(data) {
    const s = data.summary || {};
    return `
      ${sectionHeader('종합 판단', '보고서 종합 결과 및 우선 조치 사항')}
      ${fieldCheckbox('종합판단요약 섹션 사용', 'summary.enabled', s.enabled !== false)}
      ${fieldSelect('전반적 상태', 'summary.overallStatus', s.overallStatus, STATUS_OPTIONS)}
      ${fieldTextarea('종합 요약 (summaryText)', 'summary.summaryText', s.summaryText, { rows: 6 })}
      ${fieldTextarea('우선 조치 사항 (priorityActions)', 'summary.priorityActions', s.priorityActions, { rows: 6 })}
    `;
  }

  function renderExpert(data) {
    const e = data.expertOpinion || {};
    return `
      ${sectionHeader('전문가 분석 의견', '전문가 관점의 정성적 평가')}
      ${fieldCheckbox('전문가 분석의견 페이지 사용', 'expertOpinion.enabled', e.enabled !== false)}
      ${fieldTextarea('안전 리스크 (safetyRisk)', 'expertOpinion.safetyRisk', e.safetyRisk, { rows: 6 })}
      ${fieldTextarea('비용 리스크 (costRisk)', 'expertOpinion.costRisk', e.costRisk, { rows: 6 })}
      ${fieldTextarea('거주 성능 (livingPerformance)', 'expertOpinion.livingPerformance', e.livingPerformance, { rows: 6 })}
    `;
  }

  // ═══════════════════════════════════════════════════════
  // 세부진단 탭 (복잡 — 카테고리별 동적 렌더)
  // ═══════════════════════════════════════════════════════
  function renderDetail(data) {
    const cat = currentDetailCategory;
    const catData = data.categoryData && data.categoryData[cat];
    const catMeta = CATEGORY_META[cat] || { label: cat };

    const subNav = `
      <div class="detail-cat-tabs">
        ${CATEGORY_ORDER.map((c) => {
          const m = CATEGORY_META[c] || { label: c };
          return `<button type="button" class="detail-cat-tab ${c === cat ? 'active' : ''}" data-detail-cat="${c}" title="${escapeAttr(m.label)}">${escapeHTML(c)}</button>`;
        }).join('')}
      </div>
    `;

    if (!catData) {
      return `
        ${subNav}
        ${sectionHeader(catMeta.label, '')}
        <div class="change-empty">이 카테고리의 데이터가 없습니다</div>
      `;
    }

    return `
      ${subNav}
      ${sectionHeader(catMeta.label, '')}
      ${renderDetailSubStatuses(cat, catData)}
      ${renderDetailOpinion(cat, catData)}
      ${renderDetailSkippedNote(cat, catData)}
      ${renderDetailSections(cat, catData)}
    `;
  }

  function renderDetailSubStatuses(cat, catData) {
    const subStatuses = catData.subStatuses || {};
    const subItems = Object.keys(subStatuses);
    if (subItems.length === 0) return '';

    return `
      <div class="sub-block">
        <div class="sub-block-title">세부 항목 상태</div>
        <div class="substatus-list">
          ${subItems.map((sub) => {
            const val = subStatuses[sub] || '';
            const path = `categoryData.${cat}.subStatuses.${sub}`;
            return `
              <div class="substatus-row">
                <label class="substatus-label">${escapeHTML(sub)}</label>
                ${renderPill(path, val, STATUS_PILLS)}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  function renderDetailOpinion(cat, catData) {
    return `
      <div class="sub-block">
        <div class="sub-block-title">카테고리 종합 의견</div>
        <textarea class="full-textarea" data-path="categoryData.${cat}.opinion" rows="4" placeholder="이 카테고리 전반에 대한 의견">${escapeHTML(catData.opinion || '')}</textarea>
      </div>
    `;
  }

  // 점검 생략 사유 — 본 웹의 cat_skip_{cat} textarea와 대응 (Phase 3.2)
  // 입력 시 preview.html의 카테고리 페이지 상단 "참고 — 점검 생략 항목" 박스로 렌더됨
  function renderDetailSkippedNote(cat, catData) {
    return `
      <div class="sub-block">
        <div class="sub-block-title">점검 생략 사유 <span class="sub-block-count">(선택, 입력 시 보고서에 안내 박스 표시)</span></div>
        <textarea class="full-textarea" data-path="categoryData.${cat}.skippedNote" rows="2" placeholder="예: 현장 일정 제약으로 결로 측정 미실시 — 별도 일정에 재점검 예정">${escapeHTML(catData.skippedNote || '')}</textarea>
      </div>
    `;
  }

  // 카테고리별 섹션 (D, E는 sections 순서대로, 나머지는 tables → cards)
  function renderDetailSections(cat, catData) {
    const meta = CATEGORY_META[cat] || {};

    if (meta.sections) {
      return meta.sections.map((sec) => {
        if (sec.type === 'table') {
          const rows = (catData.fixedTables && catData.fixedTables[sec.key]) || [];
          return renderFixedTable(cat, sec.key, rows);
        } else if (sec.type === 'cards') {
          const slotCards = (catData.cardSlots && catData.cardSlots[sec.key]) || [];
          return renderCardsSection(slotCards, sec.label, `categoryData.${cat}.cardSlots.${sec.key}`);
        }
        return '';
      }).join('');
    }

    let html = '';
    // 일반: tables 먼저
    (meta.tables || []).forEach((tableKey) => {
      const rows = (catData.fixedTables && catData.fixedTables[tableKey]) || [];
      html += renderFixedTable(cat, tableKey, rows);
    });
    // 그 다음 cards
    const cards = Array.isArray(catData.cards) ? catData.cards : [];
    html += renderCardsSection(cards, '진단 카드', `categoryData.${cat}.cards`);
    return html;
  }

  function renderFixedTable(cat, tableKey, rows) {
    const def = TABLE_DEFS[tableKey];
    if (!def) return '';
    return `
      <div class="sub-block">
        <div class="sub-block-title">${escapeHTML(def.title)}</div>
        ${rows.length === 0
          ? '<div class="change-empty">데이터 없음</div>'
          : renderEditableTable(rows, def.columns, `categoryData.${cat}.fixedTables.${tableKey}`)}
      </div>
    `;
  }

  function renderCardsSection(cards, label, basePath) {
    return `
      <div class="sub-block">
        <div class="sub-block-title">${escapeHTML(label)} <span class="sub-block-count">(${cards.length}개)</span></div>
        ${cards.length === 0
          ? '<div class="change-empty">카드 없음</div>'
          : `<div class="card-list">${cards.map((card, i) => renderCard(card, `${basePath}[${i}]`, i)).join('')}</div>`}
      </div>
    `;
  }

  function renderCard(card, basePath, index) {
    const cardIdShort = (card.id || '').slice(0, 8);

    // subJudgments
    let subJudgmentsHtml = '';
    if (Array.isArray(card.subJudgments) && card.subJudgments.length > 0) {
      subJudgmentsHtml = `
        <div class="card-field">
          <label>세부 판정</label>
          <div class="sub-judgment-list">
            ${card.subJudgments.map((sj, si) => `
              <div class="sub-judgment-row">
                <div class="sub-judgment-name">${escapeHTML(sj.name || '(이름 없음)')}</div>
                ${renderPill(`${basePath}.subJudgments[${si}].status`, sj.status, STATUS_PILLS)}
              </div>
            `).join('')}
          </div>
          <div class="field-hint">💡 세부 판정 이름은 구조 변경이라 편집 불가. 상태만 조정 가능.</div>
        </div>
      `;
    }

    // photos
    let photosHtml = '';
    if (Array.isArray(card.photos) && card.photos.length > 0) {
      photosHtml = `
        <div class="card-field">
          <label>사진 (${card.photos.length}장)</label>
          <div class="photos-grid">
            ${card.photos.map((photo, pi) => {
              const pPath = `${basePath}.photos[${pi}]`;
              const pid = photo.id || '';
              return `
                <div class="photo-item">
                  <div class="photo-thumb">
                    <img alt="${escapeAttr(photo.name || '')}" data-photo-img="${escapeAttr(pid)}" loading="lazy">
                    <div class="photo-placeholder">⏳</div>
                  </div>
                  <div class="photo-name">${escapeHTML(photo.name || '')}</div>
                  <input type="text" data-path="${escapeAttr(pPath + '.captionTitle')}" value="${escapeHTML(photo.captionTitle || '')}" placeholder="캡션 제목">
                  <input type="text" data-path="${escapeAttr(pPath + '.captionDetail')}" value="${escapeHTML(photo.captionDetail || '')}" placeholder="캡션 설명">
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    return `
      <div class="detail-card">
        <div class="detail-card-header">
          <span class="card-index">#${index + 1}</span>
          <input type="text" class="card-title-input" data-path="${escapeAttr(basePath + '.title')}" value="${escapeHTML(card.title || '')}" placeholder="카드 제목">
          <span class="card-id-badge" title="${escapeAttr(card.id || '')}">${escapeHTML(cardIdShort)}</span>
        </div>
        <div class="detail-card-body">
          <div class="card-field">
            <label class="field-checkbox-inline">
              <input type="checkbox" data-path="${escapeAttr(basePath + '.fieldNoteEnabled')}" ${card.fieldNoteEnabled !== false ? 'checked' : ''}>
              현장 확인 내용 사용
            </label>
            <textarea class="full-textarea" data-path="${escapeAttr(basePath + '.fieldNote')}" rows="4" placeholder="관찰 사항 / 현장 확인 내용">${escapeHTML(card.fieldNote || '')}</textarea>
          </div>
          <div class="card-field">
            <label class="field-checkbox-inline">
              <input type="checkbox" data-path="${escapeAttr(basePath + '.actionGuideEnabled')}" ${card.actionGuideEnabled !== false ? 'checked' : ''}>
              조치 가이드 사용
            </label>
            <textarea class="full-textarea" data-path="${escapeAttr(basePath + '.actionGuide')}" rows="4" placeholder="조치 권고 / 리모델링 가이드">${escapeHTML(card.actionGuide || '')}</textarea>
          </div>
          ${subJudgmentsHtml}
          ${photosHtml}
        </div>
      </div>
    `;
  }

  // ═══════════════════════════════════════════════════════
  // 사진 비동기 로드
  // ═══════════════════════════════════════════════════════
  async function loadVisiblePhotos() {
    if (!mountEl) return;
    const imgs = mountEl.querySelectorAll('img[data-photo-img]');
    if (imgs.length === 0) return;
    const report = Store.state.currentReport;
    if (!report) return;

    // 순차 로드 (file://에서 병렬 접근이 간혹 실패)
    for (const img of imgs) {
      const id = img.dataset.photoImg;
      if (!id) continue;
      // 이미 로드됨?
      if (img.src && img.src.startsWith('data:')) continue;
      try {
        const dataUrl = await Sync.loadImage(report.reportId, id);
        if (dataUrl) {
          img.src = dataUrl;
          const placeholder = img.parentElement.querySelector('.photo-placeholder');
          if (placeholder) placeholder.style.display = 'none';
        } else {
          const placeholder = img.parentElement.querySelector('.photo-placeholder');
          if (placeholder) placeholder.textContent = '❌';
        }
      } catch (e) {
        console.warn('image load failed:', id, e.message);
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  // 탭 네비 & 전체 렌더
  // ═══════════════════════════════════════════════════════
  function renderTabNav() {
    return `
      <div class="editor-tabs">
        ${TABS.map((t) =>
          `<button type="button" class="editor-tab ${t.id === currentTab ? 'active' : ''}" data-tab="${t.id}">${escapeHTML(t.label)}</button>`
        ).join('')}
      </div>
    `;
  }

  function render() {
    if (!mountEl) return;
    const data = Store.state.currentVersion;
    const report = Store.state.currentReport;

    if (!data || !report) {
      mountEl.innerHTML = `
        <div class="editor-empty">
          <p>로드된 버전이 없습니다.</p>
        </div>
      `;
      return;
    }

    const isActive = Store.isActiveVersion();
    const banner = isActive ? '' : `
      <div class="version-banner readonly">
        <span>⚠ <strong>${escapeHTML(Store.state.viewingVersion)}</strong> 는 활성 버전이 아닙니다. 편집은 가능하며, 저장 시 이 버전에서 파생된 새 버전이 생성됩니다.</span>
        <button class="btn-mini" id="btn-set-active">이 버전을 활성으로</button>
      </div>
    `;

    const tabDef = TABS.find((t) => t.id === currentTab) || TABS[0];
    const content = tabDef.render(data);

    mountEl.innerHTML = `
      ${banner}
      ${renderTabNav()}
      <div class="editor-content" id="editor-content">
        ${content}
      </div>
    `;

    attachListeners();

    // 세부진단 탭이면 사진 비동기 로드
    if (currentTab === 'detail') {
      loadVisiblePhotos();
    }
  }

  // ═══════════════════════════════════════════════════════
  // 이벤트 위임
  // ═══════════════════════════════════════════════════════
  function attachListeners() {
    // 상위 탭 전환
    mountEl.querySelectorAll('.editor-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        currentTab = btn.dataset.tab;
        render();
      });
    });

    // 세부진단 카테고리 서브탭 전환
    mountEl.querySelectorAll('.detail-cat-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        currentDetailCategory = btn.dataset.detailCat;
        render();
      });
    });

    // 활성으로 설정
    const setActiveBtn = mountEl.querySelector('#btn-set-active');
    if (setActiveBtn) {
      setActiveBtn.addEventListener('click', async () => {
        try {
          await Store.setActiveVersion(Store.state.viewingVersion);
          render();
        } catch (err) {
          alert('활성 설정 실패: ' + err.message);
        }
      });
    }

    // 필드 입력 위임 (input / change)
    const content = mountEl.querySelector('#editor-content');
    if (!content) return;

    content.addEventListener('input', (e) => {
      const el = e.target;
      const path = el.dataset.path;
      if (!path) return;
      let value;
      if (el.type === 'checkbox') value = el.checked;
      else if (el.type === 'number') value = el.value === '' ? '' : (isNaN(+el.value) ? el.value : +el.value);
      else value = el.value;
      Store.updateField(path, value);
    });

    content.addEventListener('change', (e) => {
      const el = e.target;
      const path = el.dataset.path;
      if (!path) return;
      if (el.tagName === 'SELECT' || el.type === 'checkbox') {
        const value = el.type === 'checkbox' ? el.checked : el.value;
        Store.updateField(path, value);
      }
    });

    // pill 클릭 위임
    content.addEventListener('click', (e) => {
      const pill = e.target.closest('.pill-option');
      if (!pill) return;
      const group = pill.parentElement;
      if (!group || !group.classList.contains('pill-group')) return;
      const path = group.dataset.pillPath;
      const value = pill.dataset.pillValue;
      if (!path) return;
      // 시각 업데이트
      group.querySelectorAll('.pill-option').forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      // Store 반영
      Store.updateField(path, value);
    });
  }

  // ═══════════════════════════════════════════════════════
  // 외부 API
  // ═══════════════════════════════════════════════════════
  //
  // 구독은 "버전/리포트 전환" 또는 "활성 버전 변경" 시에만 재렌더.
  // 필드 입력 때마다 재렌더하면 innerHTML 치환 → input 포커스 손실 → 한 글자씩만 타이핑됨.
  function mount(container) {
    mountEl = container;
    let lastKey = null;
    Store.subscribe(() => {
      const rid = Store.state.currentReport && Store.state.currentReport.reportId;
      const vid = Store.state.viewingVersion;
      const activeId = Store.state.currentReport && Store.state.currentReport.meta && Store.state.currentReport.meta.activeVersion;
      const key = `${rid || ''}__${vid || ''}__${activeId || ''}`;
      if (key !== lastKey) {
        lastKey = key;
        render();
      }
    });
    render();
  }

  function setTab(tabId) {
    if (TABS.some((t) => t.id === tabId)) {
      currentTab = tabId;
      render();
    }
  }

  window.Editor = { mount, render, setTab };
})();
