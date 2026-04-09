/**
 * 더보다 AI - 보고서 데이터 관리 v3
 * localStorage + IndexedDB 기반 멀티 보고서 관리
 * 세부진단: 고정 테이블 + 동적 카드 구조
 */

const STORAGE_KEY = 'theboda_report_v2';
const REPORTS_LIST_KEY = 'theboda_reports_list';
const ACTIVE_REPORT_KEY = 'theboda_active_report_id';

// ==========================================
// 상태 라벨/색상 매핑 (PDF 원본 기준 4단계)
// ==========================================
const STATUS_MAP = {
  good:   { label: '특이사항없음', shortLabel: '양호', cssClass: 'good' },
  normal: { label: '경미·관리필요', shortLabel: '경미', cssClass: 'normal' },
  bad:    { label: '보수·교체권장', shortLabel: '보수', cssClass: 'bad' },
  danger: { label: '즉시조치필요', shortLabel: '즉시', cssClass: 'danger' },
  na:     { label: '해당없음',     shortLabel: 'N/A',  cssClass: 'na' },
};

// ==========================================
// UUID 생성
// ==========================================
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ==========================================
// 진단 카테고리 (새 구조: codes 제거, subItems + fixedTables 정의)
// ==========================================
const DETAIL_CATEGORIES = {
  A: {
    label: 'A. 균열·안전·방수',
    subItems: [
      '구조부 균열', '벽체·천장 처짐·변형', '외벽·발코니 누수',
      '창호·코킹 누수', '욕실 방수', '천장 누수',
      '난간·안전구조물', '기타 확인사항'
    ],
    fixedTables: {},
  },
  B: {
    label: 'B. 급배수·배관',
    subItems: [
      '급수배관 노후도', '기초수질', '수압',
      '배수기능', '생활하수관 누수', '우수관 상태', '기타 확인사항'
    ],
    fixedTables: {
      waterQuality: {
        title: '기초수질',
        columns: ['측정항목', '측정값', '기준값', '결과'],
        defaultRows: [
          { item: 'pH', value: '', standard: '5.8~8.5', result: '' },
          { item: 'EC (us/cm)', value: '', standard: '-', result: '' },
          { item: 'TDS (mg/L)', value: '', standard: '500 이하', result: '' },
          { item: '총알칼리도', value: '', standard: '-', result: '' },
          { item: '경도 (mg/L)', value: '', standard: '300 이하', result: '' },
        ],
        canAddRow: false,
      },
      heavyMetal: {
        title: '중금속 간이검사',
        columns: ['측정항목', '측정값', '기준값', '결과'],
        defaultRows: [
          { item: '납 (mg/L)', value: '', standard: '0.01 이하', result: '' },
          { item: '철 (mg/L)', value: '', standard: '0.3 이하', result: '' },
          { item: '구리 (mg/L)', value: '', standard: '1.0 이하', result: '' },
          { item: '수은 (mg/L)', value: '', standard: '0.001 이하', result: '' },
        ],
        canAddRow: false,
      },
      sanitation: {
        title: '위생·안전성 오염지표',
        columns: ['측정항목', '측정값', '기준값', '결과'],
        defaultRows: [
          { item: '잔류염소 (mg/L)', value: '', standard: '0.1~4.0', result: '' },
          { item: '질산염 (mg/L)', value: '', standard: '10 이하', result: '' },
          { item: '아질산염 (mg/L)', value: '', standard: '- (참고)', result: '' },
          { item: '황산염 (mg/L)', value: '', standard: '200 이하', result: '' },
        ],
        canAddRow: false,
      },
      waterPressure: {
        title: '수압 측정',
        columns: ['장소', '측정값 (kgf/cm²)'],
        defaultRows: [
          { location: '', value: '' },
        ],
        canAddRow: true,
      },
    },
  },
  C: {
    label: 'C. 난방',
    subItems: [
      '보일러', '난방배관·회로', '온수공급',
      '난방분배기', '배기·연통·환기', '난방회로 변경·확장', '기타 확인사항'
    ],
    fixedTables: {},
  },
  D: {
    label: 'D. 전기·가스',
    subItems: [
      '분전반·차단기', '전기사용부', '조명기구',
      '가스안전', '통신인프라', '기타 확인사항'
    ],
    fixedTables: {
      panelSpec: {
        title: '분전반 사양',
        columns: ['구분', '사양', '참고'],
        defaultRows: [
          { item: '제조/연식', value: '', note: '' },
          { item: '메인차단기', value: '', note: '' },
          { item: '분기차단기', value: '', note: '' },
          { item: '배선상태', value: '', note: '' },
        ],
        canAddRow: false,
      },
      gasCheck: {
        title: '가스 점검',
        columns: ['장소', '측정지점', '누설경보'],
        defaultRows: [
          { location: '', point: '', alarm: '' },
        ],
        canAddRow: true,
      },
    },
    sections: [
      { type: 'table', key: 'panelSpec' },
      { type: 'cards', key: 'electric', label: '전기설비 진단 카드' },
      { type: 'table', key: 'gasCheck' },
      { type: 'cards', key: 'gas', label: '가스설비 진단 카드' },
    ],
  },
  E: {
    label: 'E. 단열·결로',
    subItems: [
      '단열·열교', '결로', '현관문 기밀', '기타 확인사항'
    ],
    fixedTables: {
      thermalBridge: {
        title: '열교 측정',
        columns: ['점검장소', '기준면온도(°C)', '의심부온도(°C)', '온도차(°C)', '설명'],
        defaultRows: [
          { location: '', refTemp: '', suspectTemp: '', diff: '', description: '' },
        ],
        canAddRow: true,
      },
      condensation: {
        title: '결로(노점) 측정',
        columns: ['점검장소', '표면온도(°C)', '상대습도(%)', '노점온도(°C)', '설명'],
        defaultRows: [
          { location: '', surfaceTemp: '', humidity: '', dewPoint: '', description: '' },
        ],
        canAddRow: true,
      },
    },
    sections: [
      { type: 'table', key: 'thermalBridge' },
      { type: 'cards', key: 'thermal', label: '열교 진단 카드' },
      { type: 'table', key: 'condensation' },
      { type: 'cards', key: 'condense', label: '결로 진단 카드' },
    ],
  },
  F: {
    label: 'F. 환기·공기질',
    subItems: [
      '환기', '미세먼지', 'HCHO·TVOC', '라돈', '기타 확인사항'
    ],
    fixedTables: {
      iaq: {
        title: '공기질(IAQ) 측정',
        columns: ['점검장소', '라돈(Bq/m³)', 'HCHO(㎍/m³)', 'TVOC(㎍/m³)', 'PM2.5(㎍/m³)', 'PM10(㎍/m³)'],
        defaultRows: [
          { location: '', radon: '', hcho: '', tvoc: '', pm25: '', pm10: '' },
        ],
        canAddRow: true,
      },
    },
  },
  G: {
    label: 'G. 창호시스템',
    subItems: [
      '창호시스템 유형', '창호프레임', '유리사양',
      '개폐·하드웨어 작동', '방충망·보조부속', '기타 확인사항'
    ],
    fixedTables: {
      windowSpec: {
        title: '창호 사양',
        columns: ['항목', '세부내용', '참고'],
        defaultRows: [
          { item: '시스템구성', value: '', note: '' },
          { item: '제조/설치', value: '', note: '' },
          { item: '프레임재질(실내)', value: '', note: '' },
          { item: '프레임재질(발코니)', value: '', note: '' },
          { item: '유리사양(실내)', value: '', note: '' },
          { item: '유리사양(발코니)', value: '', note: '' },
          { item: '기타확인사항', value: '', note: '' },
        ],
        canAddRow: false,
      },
    },
  },
  H: {
    label: 'H. 생활기능·마감',
    subItems: [
      '문·수납', '실내마감', '생활설비', '기타 확인사항'
    ],
    fixedTables: {},
  },
};

// ==========================================
// 고정 테이블 기본 데이터 생성
// ==========================================
function createDefaultFixedTables(cat) {
  const catDef = DETAIL_CATEGORIES[cat];
  if (!catDef || !catDef.fixedTables) return {};
  const tables = {};
  Object.entries(catDef.fixedTables).forEach(([tableKey, tableDef]) => {
    tables[tableKey] = JSON.parse(JSON.stringify(tableDef.defaultRows));
  });
  return tables;
}

// ==========================================
// 내구연한 기본 항목 (PDF 원본 기준 + 표준연한 기본값)
// ==========================================
const DEFAULT_DURABILITY = [
  { item: '난방배관',         standard: 30, current: '', remaining: '', status: '', comment: '' },
  { item: '보일러',           standard: 12, current: '', remaining: '', status: '', comment: '' },
  { item: '욕실 배수관',      standard: 30, current: '', remaining: '', status: '', comment: '' },
  { item: '급수배관',         standard: 25, current: '', remaining: '', status: '', comment: '' },
  { item: '실란트·줄눈',      standard: 10, current: '', remaining: '', status: '', comment: '' },
  { item: '바닥 마감재',      standard: 20, current: '', remaining: '', status: '', comment: '' },
  { item: '창호 하드웨어',    standard: 25, current: '', remaining: '', status: '', comment: '' },
  { item: '조명기구',         standard: 15, current: '', remaining: '', status: '', comment: '' },
];

// ==========================================
// 기본 데이터 구조 (v3 — categoryData 기반)
// ==========================================
function createDefaultReport() {
  // 카테고리별 데이터 구조
  const categoryData = {};
  Object.entries(DETAIL_CATEGORIES).forEach(([cat, info]) => {
    const subStatuses = {};
    info.subItems.forEach(sub => {
      subStatuses[sub] = '';
    });
    categoryData[cat] = {
      subStatuses,
      opinion: '',
      fixedTables: createDefaultFixedTables(cat),
      cards: [],
    };
  });

  return {
    meta: {
      id: '',
      createdAt: null,
      updatedAt: null,
      version: '3.0',
    },

    // 세대 기본정보
    basic: {
      address: '',
      unit: '',
      area: '',
      supplyArea: '',
      buildingYear: '',
      buildingMonth: '',
      rooms: [],
      floorTotal: '',
      floorUnit: '',
      structure: '',
      usage: '',
      heatingType: '',
      extensionStatus: '',
      currentOccupancy: '',
      inspectionDate: '',
      inspectorName: '',
      reportDate: '',
      clientName: '',
      reportNo: '',
      managementIssues: '',
    },

    // 종합 지표 (PDF p.4)
    indicators: {
      gasSafety: '',
      electricalSafety: '',
      structuralSafety: '',
      gasSafetyComment: '',
      electricalSafetyComment: '',
      structuralSafetyComment: '',
      equipmentPerformance: '',
      environmentComfort: '',
      insulationPerformance: '',
      finishPerformance: '',
      sunlightGrade: '',
      opennessGrade: '',
      solarGrade: '',
      heatingPipeCost: '',
      bathroomWaterproofCost: '',
      windowExteriorCost: '',
      plumbingCost: '',
      heatingPipeComment: '',
      bathroomWaterproofComment: '',
      windowExteriorComment: '',
      plumbingComment: '',
      repairCostMin: '',
      repairCostMax: '',
    },

    // 내구연한 (PDF p.5)
    durability: JSON.parse(JSON.stringify(DEFAULT_DURABILITY)),

    // 종합판단 (PDF p.6)
    summary: {
      overallStatus: '',
      summaryText: '',
      priorityActions: '',
    },

    // 전문가 의견 (PDF p.7)
    expertOpinion: {
      safetyRisk: '',
      costRisk: '',
      livingPerformance: '',
    },

    // 카테고리별 세부진단 데이터 (v3 신규)
    categoryData,
  };
}

const DEFAULT_REPORT = createDefaultReport();

// ==========================================
// 보고서 번호 자동생성 (YYYYMMDD-NNN)
// ==========================================
function generateReportNo() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const datePrefix = `${y}${m}${d}`;

  const list = getReportsList();
  const todayReports = list.filter(r => r.reportNo && r.reportNo.startsWith(datePrefix));
  const maxSeq = todayReports.reduce((max, r) => {
    const parts = r.reportNo.split('-');
    const seq = parseInt(parts[1]) || 0;
    return Math.max(max, seq);
  }, 0);

  return `${datePrefix}-${String(maxSeq + 1).padStart(3, '0')}`;
}

// ==========================================
// 멀티 보고서 리스트 관리
// ==========================================
function getReportsList() {
  try {
    const raw = localStorage.getItem(REPORTS_LIST_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveReportsList(list) {
  localStorage.setItem(REPORTS_LIST_KEY, JSON.stringify(list));
}

function getActiveReportId() {
  return localStorage.getItem(ACTIVE_REPORT_KEY) || '';
}

function setActiveReportId(id) {
  localStorage.setItem(ACTIVE_REPORT_KEY, id);
}

function getReportStorageKey(id) {
  return `${STORAGE_KEY}_${id}`;
}

// ==========================================
// 저장 / 불러오기
// ==========================================

function saveReport(data) {
  try {
    data.meta.updatedAt = new Date().toISOString();
    if (!data.meta.createdAt) data.meta.createdAt = data.meta.updatedAt;

    if (!data.meta.id) {
      data.meta.id = 'rpt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    }

    if (!data.basic.reportNo) {
      data.basic.reportNo = generateReportNo();
    }

    const key = getReportStorageKey(data.meta.id);
    localStorage.setItem(key, JSON.stringify(data));
    setActiveReportId(data.meta.id);

    updateReportsListEntry(data);

    return true;
  } catch (e) {
    console.error('저장 실패:', e);
    return false;
  }
}

function updateReportsListEntry(data) {
  const list = getReportsList();
  const idx = list.findIndex(r => r.id === data.meta.id);
  const entry = {
    id: data.meta.id,
    reportNo: data.basic.reportNo || '',
    address: data.basic.address || '',
    inspectionDate: data.basic.inspectionDate || '',
    updatedAt: data.meta.updatedAt,
    createdAt: data.meta.createdAt,
    progress: calcStats(data).progress,
  };
  if (idx >= 0) {
    list[idx] = entry;
  } else {
    list.push(entry);
  }
  saveReportsList(list);
}

function loadReport(id) {
  try {
    const reportId = id || getActiveReportId();
    if (!reportId) return JSON.parse(JSON.stringify(DEFAULT_REPORT));

    const key = getReportStorageKey(reportId);
    const raw = localStorage.getItem(key);
    if (!raw) return JSON.parse(JSON.stringify(DEFAULT_REPORT));

    const saved = JSON.parse(raw);

    // v2 -> v3 마이그레이션: details/categorySubStatuses 기반을 categoryData 기반으로
    if (saved.details && !saved.categoryData) {
      saved.categoryData = {};
      Object.entries(DETAIL_CATEGORIES).forEach(([cat, info]) => {
        const subStatuses = {};
        info.subItems.forEach(sub => {
          subStatuses[sub] = (saved.categorySubStatuses && saved.categorySubStatuses[cat] && saved.categorySubStatuses[cat][sub]) || '';
        });
        saved.categoryData[cat] = {
          subStatuses,
          opinion: '',
          fixedTables: createDefaultFixedTables(cat),
          cards: [],
        };
      });
      delete saved.details;
      delete saved.categorySubStatuses;
    }

    return deepMerge(JSON.parse(JSON.stringify(DEFAULT_REPORT)), saved);
  } catch (e) {
    console.error('불러오기 실패:', e);
    return JSON.parse(JSON.stringify(DEFAULT_REPORT));
  }
}

function deleteReport(id) {
  const key = getReportStorageKey(id);
  localStorage.removeItem(key);
  const list = getReportsList().filter(r => r.id !== id);
  saveReportsList(list);
  if (getActiveReportId() === id) {
    localStorage.removeItem(ACTIVE_REPORT_KEY);
  }
}

function clearReport() {
  const id = getActiveReportId();
  if (id) {
    localStorage.removeItem(getReportStorageKey(id));
  }
  localStorage.removeItem(ACTIVE_REPORT_KEY);
}

function createNewReport() {
  const data = JSON.parse(JSON.stringify(DEFAULT_REPORT));
  data.meta.id = 'rpt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  data.meta.createdAt = new Date().toISOString();
  data.basic.reportNo = generateReportNo();
  saveReport(data);
  return data;
}

function exportReportJSON() {
  const data = loadReport();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `report_${data.basic.reportNo || formatDate(new Date(), 'yyyyMMdd')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importReportJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.meta.id) {
          data.meta.id = 'rpt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        }
        saveReport(data);
        resolve(data);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

// ==========================================
// v1 -> v2 마이그레이션
// ==========================================
function migrateV1() {
  try {
    const raw = localStorage.getItem('theboda_report_v1');
    if (!raw) return;
    const v1 = JSON.parse(raw);
    if (v1 && v1.basic) {
      v1.meta = v1.meta || {};
      v1.meta.version = '3.0';
      v1.meta.id = 'rpt_migrated_' + Date.now();
      if (v1.basic.inspectorLicense !== undefined) {
        delete v1.basic.inspectorLicense;
      }
      saveReport(deepMerge(JSON.parse(JSON.stringify(DEFAULT_REPORT)), v1));
      localStorage.removeItem('theboda_report_v1');
    }
  } catch (e) {
    console.warn('v1 마이그레이션 실패:', e);
  }
}

// ==========================================
// 이미지 저장 (IndexedDB)
// ==========================================

const ImageStore = (() => {
  let db = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      if (db) return resolve(db);
      const req = indexedDB.open('theboda_images', 1);
      req.onupgradeneeded = (e) => {
        e.target.result.createObjectStore('images', { keyPath: 'id' });
      };
      req.onsuccess = (e) => { db = e.target.result; resolve(db); };
      req.onerror = reject;
    });
  }

  async function save(id, base64) {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('images', 'readwrite');
      tx.objectStore('images').put({ id, data: base64 });
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
  }

  async function get(id) {
    const database = await openDB();
    return new Promise((resolve) => {
      const tx = database.transaction('images', 'readonly');
      const req = tx.objectStore('images').get(id);
      req.onsuccess = () => resolve(req.result?.data || null);
      req.onerror = () => resolve(null);
    });
  }

  async function remove(id) {
    const database = await openDB();
    return new Promise((resolve) => {
      const tx = database.transaction('images', 'readwrite');
      tx.objectStore('images').delete(id);
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
  }

  return { save, get, remove };
})();

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function saveImage(imageId, file) {
  const base64 = await fileToBase64(file);
  await ImageStore.save(imageId, base64);
  return { id: imageId, name: file.name };
}

async function loadImage(id) {
  return await ImageStore.get(id);
}

async function removeImage(id) {
  await ImageStore.remove(id);
}

// ==========================================
// 통계 계산 (v3 — categoryData.cards 기반)
// ==========================================

function calcStats(report) {
  const catData = report.categoryData || {};
  const counts = { good: 0, normal: 0, bad: 0, danger: 0, na: 0, empty: 0, total: 0 };

  // subStatuses에서 통계 수집
  Object.values(catData).forEach(cd => {
    const subs = cd.subStatuses || {};
    Object.values(subs).forEach(st => {
      counts.total++;
      switch (st) {
        case 'good':   counts.good++;   break;
        case 'normal': counts.normal++; break;
        case 'bad':    counts.bad++;    break;
        case 'danger': counts.danger++; break;
        default:       counts.empty++;  break;
      }
    });
  });

  const filled = counts.total - counts.empty;
  counts.progress = counts.total > 0 ? Math.round((filled / counts.total) * 100) : 0;
  return counts;
}

function calcCategoryStats(report) {
  const result = {};
  const catData = report.categoryData || {};
  Object.entries(DETAIL_CATEGORIES).forEach(([cat, info]) => {
    const cd = catData[cat] || {};
    const subs = cd.subStatuses || {};
    const cnt = { good: 0, normal: 0, bad: 0, danger: 0, na: 0 };
    let total = 0;

    Object.values(subs).forEach(st => {
      total++;
      if (cnt[st] !== undefined) cnt[st]++;
    });

    // 카드의 세부 판정도 포함
    const allCards = [];
    if (cd.cards) allCards.push(...cd.cards);
    if (cd.cardSlots) {
      Object.values(cd.cardSlots).forEach(slotCards => allCards.push(...(slotCards || [])));
    }
    allCards.forEach(card => {
      (card.subJudgments || []).forEach(sj => {
        total++;
        if (cnt[sj.status] !== undefined) cnt[sj.status]++;
      });
    });

    result[cat] = { ...cnt, total, label: info.label };
  });
  return result;
}

// ==========================================
// 폼 수집 (v3)
// ==========================================

function collectFormData() {
  const report = loadReport();

  // basic
  ['address', 'unit', 'area', 'supplyArea', 'buildingYear', 'floorTotal', 'floorUnit',
   'structure', 'usage', 'heatingType', 'extensionStatus', 'currentOccupancy',
   'inspectionDate', 'inspectorName', 'reportDate', 'clientName', 'reportNo',
   'managementIssues'].forEach(k => {
    const el = document.getElementById(`basic_${k}`);
    if (el) report.basic[k] = el.value;
  });
  // 내구연한 탭의 준공연도/월 → basic에도 저장
  const durYear = document.getElementById('dur_buildYear');
  const durMonth = document.getElementById('dur_buildMonth');
  if (durYear && durYear.value) report.basic.buildingYear = durYear.value;
  if (durMonth) report.basic.buildingMonth = durMonth.value;

  // rooms
  if (typeof collectRooms === 'function') {
    report.basic.rooms = collectRooms();
  }

  // indicators - radios
  ['gasSafety', 'electricalSafety', 'structuralSafety',
   'equipmentPerformance', 'environmentComfort', 'insulationPerformance', 'finishPerformance'
  ].forEach(k => {
    const el = document.querySelector(`[name="indicators_${k}"]:checked`);
    if (el) report.indicators[k] = el.value;
  });

  // indicators - text/number
  ['gasSafetyComment', 'electricalSafetyComment', 'structuralSafetyComment',
   'sunlightGrade', 'opennessGrade', 'solarGrade',
   'heatingPipeCost', 'bathroomWaterproofCost', 'windowExteriorCost', 'plumbingCost',
   'heatingPipeComment', 'bathroomWaterproofComment', 'windowExteriorComment', 'plumbingComment',
   'repairCostMin', 'repairCostMax'
  ].forEach(k => {
    const el = document.getElementById(`indicators_${k}`);
    if (el) report.indicators[k] = el.tagName === 'SELECT' ? el.value : el.value;
  });

  // durability
  report.durability.forEach((row, i) => {
    ['standard', 'current', 'remaining', 'comment'].forEach(k => {
      const el = document.getElementById(`dur_${i}_${k}`);
      if (el) row[k] = el.value;
    });
    const st = document.querySelector(`[name="dur_${i}_status"]:checked`);
    if (st) row.status = st.value;
  });

  // summary
  ['summaryText'].forEach(k => {
    const el = document.getElementById(`summary_${k}`);
    if (el) report.summary[k] = el.value;
  });
  const overallSt = document.querySelector('[name="summary_overallStatus"]:checked');
  if (overallSt) report.summary.overallStatus = overallSt.value;

  // expertOpinion
  ['safetyRisk', 'costRisk', 'livingPerformance'].forEach(k => {
    const el = document.getElementById(`expert_${k}`);
    if (el) report.expertOpinion[k] = el.value;
  });

  function collectCardsFromContainer(container, catKey, existingCards) {
    const cardEls = container.querySelectorAll('.field-card');
    const cards = [];
    cardEls.forEach(cardEl => {
      const cardId = cardEl.dataset.cardId;
      const existingCard = existingCards.find(c => c.id === cardId);
      const titleInput = cardEl.querySelector('.card-title-input');
      const layoutBtns = cardEl.querySelectorAll('.layout-btn.active');
      const noteEl = cardEl.querySelector('.card-fieldnote');

      const subJudgments = [];
      cardEl.querySelectorAll('.sub-judgment-row').forEach(sjRow => {
        const nameInput = sjRow.querySelector('.sj-name');
        const statusRadio = sjRow.querySelector('input[type="radio"]:checked');
        subJudgments.push({
          name: nameInput ? nameInput.value : '',
          status: statusRadio ? statusRadio.value : '',
        });
      });

      const photos = existingCard ? JSON.parse(JSON.stringify(existingCard.photos || [])) : [];
      cardEl.querySelectorAll('.photo-slot').forEach((slot, idx) => {
        const obsTextarea = slot.querySelector('.photo-observation');
        if (obsTextarea && photos[idx]) {
          photos[idx].observation = obsTextarea.value;
        }
        const titleInput = slot.querySelector('.photo-caption-title');
        if (titleInput && photos[idx]) {
          photos[idx].captionTitle = titleInput.value;
        }
        const detailInput = slot.querySelector('.photo-caption-detail');
        if (detailInput && photos[idx]) {
          photos[idx].captionDetail = detailInput.value;
        }
      });

      const hideTextCheckbox = cardEl.querySelector('.photo-text-toggle input[type="checkbox"]');
      cards.push({
        id: cardId || generateUUID(),
        title: titleInput ? titleInput.value : '',
        photoLayout: layoutBtns.length > 0 ? layoutBtns[0].dataset.layout : '3',
        hidePhotoText: hideTextCheckbox ? hideTextCheckbox.checked : false,
        photos,
        subJudgments,
        fieldNote: noteEl ? noteEl.value : '',
      });
    });
    return cards;
  }

  // categoryData
  if (!report.categoryData) report.categoryData = {};
  Object.entries(DETAIL_CATEGORIES).forEach(([cat, info]) => {
    if (!report.categoryData[cat]) {
      report.categoryData[cat] = { subStatuses: {}, opinion: '', fixedTables: createDefaultFixedTables(cat), cards: [] };
    }
    const cd = report.categoryData[cat];

    // subStatuses
    info.subItems.forEach((sub, si) => {
      const st = document.querySelector(`[name="catsub_${cat}_${si}"]:checked`);
      if (st) cd.subStatuses[sub] = st.value;
    });

    // opinion
    const opEl = document.getElementById(`cat_opinion_${cat}`);
    if (opEl) cd.opinion = opEl.value;

    // fixedTables
    if (info.fixedTables) {
      Object.entries(info.fixedTables).forEach(([tableKey, tableDef]) => {
        if (!cd.fixedTables[tableKey]) cd.fixedTables[tableKey] = [];
        const rows = [];
        const tbody = document.getElementById(`ftable_${cat}_${tableKey}_body`);
        if (tbody) {
          tbody.querySelectorAll('tr').forEach(tr => {
            const inputs = tr.querySelectorAll('input, select');
            const rowData = {};
            inputs.forEach(inp => {
              const field = inp.dataset.field;
              if (field) rowData[field] = inp.value;
            });
            if (Object.keys(rowData).length > 0) rows.push(rowData);
          });
          cd.fixedTables[tableKey] = rows;
        }
      });
    }

    // cards — collect from DOM
    if (info.sections) {
      // 섹션 기반: cardSlots별로 수집
      cd.cardSlots = cd.cardSlots || {};
      info.sections.forEach(sec => {
        if (sec.type !== 'cards') return;
        const slotKey = sec.key;
        const catKey = cat + '_' + slotKey;
        const container = document.getElementById(`cards_${catKey}`);
        if (!container) return;
        const existingSlotCards = (cd.cardSlots[slotKey] || []);
        cd.cardSlots[slotKey] = collectCardsFromContainer(container, catKey, existingSlotCards);
      });
    } else {
      const cardsContainer = document.getElementById(`cards_${cat}`);
      if (cardsContainer) {
        cd.cards = collectCardsFromContainer(cardsContainer, cat, cd.cards || []);
      }
    }
  });

  return report;
}

// ==========================================
// 폼 채우기 (v3)
// ==========================================

function fillForm(report) {
  // basic
  Object.entries(report.basic || {}).forEach(([k, v]) => {
    const el = document.getElementById(`basic_${k}`);
    if (el) el.value = v || '';
  });

  // indicators - radios
  ['gasSafety', 'electricalSafety', 'structuralSafety',
   'equipmentPerformance', 'environmentComfort', 'insulationPerformance', 'finishPerformance'
  ].forEach(k => {
    const val = (report.indicators || {})[k];
    if (val) {
      const radio = document.querySelector(`[name="indicators_${k}"][value="${val}"]`);
      if (radio) radio.checked = true;
    }
  });

  // indicators - text/number
  ['gasSafetyComment', 'electricalSafetyComment', 'structuralSafetyComment',
   'sunlightGrade', 'opennessGrade', 'solarGrade',
   'heatingPipeCost', 'bathroomWaterproofCost', 'windowExteriorCost', 'plumbingCost',
   'heatingPipeComment', 'bathroomWaterproofComment', 'windowExteriorComment', 'plumbingComment',
   'repairCostMin', 'repairCostMax'
  ].forEach(k => {
    const el = document.getElementById(`indicators_${k}`);
    if (el) el.value = (report.indicators || {})[k] || '';
  });

  // durability
  (report.durability || []).forEach((row, i) => {
    Object.entries(row).forEach(([k, v]) => {
      if (k === 'item') return;
      if (k === 'status') {
        const radio = document.querySelector(`[name="dur_${i}_${k}"][value="${v}"]`);
        if (radio) radio.checked = true;
      } else {
        const input = document.getElementById(`dur_${i}_${k}`);
        if (input) input.value = v || '';
      }
    });
  });

  // summary
  ['summaryText'].forEach(k => {
    const el = document.getElementById(`summary_${k}`);
    if (el) el.value = (report.summary || {})[k] || '';
  });
  const ov = (report.summary || {}).overallStatus;
  if (ov) {
    const radio = document.querySelector(`[name="summary_overallStatus"][value="${ov}"]`);
    if (radio) radio.checked = true;
  }

  // expertOpinion
  ['safetyRisk', 'costRisk', 'livingPerformance'].forEach(k => {
    const el = document.getElementById(`expert_${k}`);
    if (el) el.value = (report.expertOpinion || {})[k] || '';
  });

  // categoryData는 renderDetailItems에서 처리
}

// ==========================================
// UI 유틸리티
// ==========================================

function showToast(message, type = 'success', duration = 2500) {
  const container = document.getElementById('toast-container') ||
    (() => {
      const el = document.createElement('div');
      el.id = 'toast-container';
      el.className = 'toast-container';
      document.body.appendChild(el);
      return el;
    })();

  const toast = document.createElement('div');
  const icon = type === 'success' ? '\u2713' : type === 'error' ? '\u2715' : '\u2139';
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function formatDate(date, fmt = 'yyyy.MM.dd') {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return fmt
    .replace('yyyyMMdd', `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`)
    .replace('yyyy', d.getFullYear())
    .replace('MM', pad(d.getMonth() + 1))
    .replace('dd', pad(d.getDate()))
    .replace('HH', pad(d.getHours()))
    .replace('mm', pad(d.getMinutes()));
}

function deepMerge(target, source) {
  if (typeof source !== 'object' || source === null) return source;
  const result = { ...target };
  Object.keys(source).forEach(key => {
    if (Array.isArray(source[key])) {
      result[key] = source[key];
    } else if (typeof source[key] === 'object' && source[key] !== null) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  });
  return result;
}

function statusLabel(status) {
  return (STATUS_MAP[status] || {}).label || '-';
}

function statusShortLabel(status) {
  return (STATUS_MAP[status] || {}).shortLabel || '-';
}

function statusClass(status) {
  return (STATUS_MAP[status] || {}).cssClass || 'none';
}

// ==========================================
// 자동저장 (30초마다)
// ==========================================

let autoSaveTimer = null;

function startAutoSave() {
  if (autoSaveTimer) clearInterval(autoSaveTimer);
  autoSaveTimer = setInterval(() => {
    if (typeof collectFormData === 'function') {
      try {
        const data = collectFormData();
        if (saveReport(data)) {
          const el = document.getElementById('autosave-indicator');
          if (el) {
            el.textContent = `자동저장 ${formatDate(new Date(), 'HH:mm')}`;
            el.style.opacity = '1';
            setTimeout(() => el.style.opacity = '0.5', 2000);
          }
        }
      } catch (e) { /* silent */ }
    }
  }, 30000);
}

// ==========================================
// 준공연도 -> 경과연수 자동계산
// ==========================================
function calcElapsedYears(buildingYear) {
  if (!buildingYear) return null;
  const year = parseInt(String(buildingYear).replace(/[^0-9]/g, ''));
  if (!year || year < 1900 || year > 2100) return null;
  const currentYear = new Date().getFullYear();
  return currentYear - year;
}

// ==========================================
// Export
// ==========================================

window.Report = {
  save: saveReport,
  load: loadReport,
  clear: clearReport,
  delete: deleteReport,
  createNew: createNewReport,
  exportJSON: exportReportJSON,
  importJSON: importReportJSON,
  collectForm: collectFormData,
  fillForm,
  calcStats,
  calcCategoryStats,
  saveImage,
  loadImage,
  removeImage,
  showToast,
  formatDate,
  statusLabel,
  statusShortLabel,
  statusClass,
  startAutoSave,
  generateReportNo,
  generateUUID,
  getReportsList,
  getActiveReportId,
  setActiveReportId,
  calcElapsedYears,
  migrateV1,
  createDefaultFixedTables,
  DEFAULT: DEFAULT_REPORT,
  CATEGORIES: DETAIL_CATEGORIES,
  STATUS_MAP,
  DEFAULT_DURABILITY,
  ImageStore,
};
