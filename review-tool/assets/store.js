/**
 * 더보다 AI 검토 도구 — 상태 저장소
 *
 * 메모리 상태 + sessionStorage 드래프트 + 이벤트 버스
 */

(function () {
  const DRAFT_PREFIX = 'theboda_rt_draft_';

  const listeners = new Set();

  const state = {
    rootPicked: false,
    currentReport: null,    // { reportId, meta }
    currentVersion: null,   // 로드된 버전 본문 (편집 대상, 타이핑 시 mutate)
    viewingSnapshot: null,  // 디스크에서 방금 로드한 불변 스냅샷 — dirty diff 계산용 (동기)
    currentVersionId: null,
    viewingVersion: null,   // 현재 보고 있는 버전 id (!= activeVersion일 수 있음)
    dirty: false,
    compareMode: null,      // { a: versionId, b: versionId }
  };

  function emit() {
    listeners.forEach((fn) => {
      try { fn(state); } catch (_) {}
    });
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  // ─── 드래프트 ───────────────────────────────────────────
  function draftKey(reportId, versionId) {
    return `${DRAFT_PREFIX}${reportId}__${versionId}`;
  }

  function saveDraft() {
    if (!state.currentReport || !state.currentVersionId) return;
    try {
      sessionStorage.setItem(
        draftKey(state.currentReport.reportId, state.currentVersionId),
        JSON.stringify(state.currentVersion),
      );
    } catch (_) {}
  }

  function loadDraft(reportId, versionId) {
    try {
      const raw = sessionStorage.getItem(draftKey(reportId, versionId));
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function clearDraft(reportId, versionId) {
    try {
      sessionStorage.removeItem(draftKey(reportId, versionId));
    } catch (_) {}
  }

  function hasDraft(reportId, versionId) {
    return !!loadDraft(reportId, versionId);
  }

  // ─── 스키마 정규화 ─────────────────────────────────────
  // 본 웹 스키마 확장(후속 Phase 3.2 등)에 따라 신규 필드가 추가될 수 있음.
  // PathUtils.set()은 "존재하지 않는 키"를 거부하므로, 편집 UI가 쓰기 전에
  // 빈 값으로 키를 심어둬야 한다. 동시에 viewingSnapshot / parentData 쪽에도
  // 동일 정규화를 적용해야 diff가 오탐되지 않는다.
  const NORMALIZE_CATEGORIES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  function normalizeReportShape(data) {
    if (!data || typeof data !== 'object') return;
    const cd = data.categoryData;
    if (!cd || typeof cd !== 'object') return;
    for (const cat of NORMALIZE_CATEGORIES) {
      const entry = cd[cat];
      if (entry && typeof entry === 'object' && !('skippedNote' in entry)) {
        entry.skippedNote = '';
      }
    }
  }

  // ─── 리뷰/버전 로드 ─────────────────────────────────────
  async function loadReport(reportId) {
    const meta = await Sync.loadMeta(reportId);
    state.currentReport = { reportId, meta };
    await loadVersion(meta.activeVersion);
    emit();
  }

  async function loadVersion(versionId) {
    if (!state.currentReport) throw new Error('리뷰가 로드되지 않았습니다');
    const data = await Sync.loadVersion(state.currentReport.reportId, versionId);
    state.currentVersionId = versionId;
    state.viewingVersion = versionId;
    // viewingSnapshot: 디스크에서 방금 로드한 불변 사본 — dirty diff 기준
    // currentVersion: 편집 가능한 작업 사본 (input 이벤트로 mutate)
    state.viewingSnapshot = data;
    state.currentVersion = JSON.parse(JSON.stringify(data));
    normalizeReportShape(state.viewingSnapshot);
    normalizeReportShape(state.currentVersion);
    state.dirty = false;

    // 드래프트 체크
    const draft = loadDraft(state.currentReport.reportId, versionId);
    if (draft) {
      state.currentVersion = draft;
      normalizeReportShape(state.currentVersion);
      state.dirty = true;
    }
    emit();
  }

  function isActiveVersion() {
    return state.currentReport && state.currentVersionId === state.currentReport.meta.activeVersion;
  }

  // ─── 편집 ───────────────────────────────────────────────
  function updateField(path, value) {
    if (!state.currentVersion) return false;
    if (PathUtils.forbid(path)) {
      console.warn('금지된 경로 수정 시도:', path);
      return false;
    }
    const ok = PathUtils.set(state.currentVersion, path, value);
    if (ok) {
      state.dirty = true;
      saveDraft();
      emit();
    }
    return ok;
  }

  function revertDraft() {
    if (!state.currentReport || !state.currentVersionId) return;
    clearDraft(state.currentReport.reportId, state.currentVersionId);
    // 원본 버전 다시 로드
    loadVersion(state.currentVersionId);
  }

  // ─── 버전 저장 ─────────────────────────────────────────
  async function saveNewVersion(label, description, author = 'user') {
    if (!state.currentReport || !state.currentVersion) throw new Error('로드된 버전이 없습니다');

    // 이전 버전과 diff 계산 (부모는 viewingVersion)
    let parentVersion = state.viewingVersion;
    const parentData = await Sync.loadVersion(state.currentReport.reportId, parentVersion);
    // 정규화 — currentVersion과 동일한 기본 필드셋으로 맞춰 오탐 방지
    normalizeReportShape(parentData);
    const changedPaths = PathUtils.diff(parentData, state.currentVersion).map((c) => c.path);

    if (changedPaths.length === 0) {
      throw new Error('변경 사항이 없습니다');
    }

    const { meta, versionId } = await Sync.saveNewVersion(
      state.currentReport.reportId,
      state.currentVersion,
      { label, description, author, changedPaths, parentVersion },
    );

    // 드래프트 삭제
    clearDraft(state.currentReport.reportId, state.currentVersionId);

    // 새 버전으로 이동
    state.currentReport.meta = meta;
    state.currentVersionId = versionId;
    state.viewingVersion = versionId;
    state.dirty = false;
    // 새 버전 내용 재로드 (메타만 업데이트한 상태라 currentVersion은 그대로여도 되지만 일관성)
    await loadVersion(versionId);
    return { meta, versionId };
  }

  async function setActiveVersion(versionId) {
    if (!state.currentReport) return;
    const meta = await Sync.setActiveVersion(state.currentReport.reportId, versionId);
    state.currentReport.meta = meta;
    emit();
  }

  // 특정 버전 삭제 — 드래프트 있으면 사용자 경고는 UI가 처리
  async function deleteVersion(versionId) {
    if (!state.currentReport) throw new Error('리뷰가 로드되지 않았습니다');

    const wasViewing = state.viewingVersion === versionId;
    // 보던 버전이면 드래프트 삭제
    if (wasViewing) {
      clearDraft(state.currentReport.reportId, versionId);
    }

    const meta = await Sync.deleteVersion(state.currentReport.reportId, versionId);
    state.currentReport.meta = meta;

    // 보던 버전이 삭제됐으면 새 active로 이동
    if (wasViewing) {
      await loadVersion(meta.activeVersion);
    } else {
      emit();
    }
    return meta;
  }

  // ─── 비교 모드 ─────────────────────────────────────────
  function setCompareMode(a, b) {
    state.compareMode = { a, b };
    emit();
  }

  function clearCompareMode() {
    state.compareMode = null;
    emit();
  }

  // ─── 새로고침 (Claude가 외부에서 파일 수정한 뒤) ────────
  async function reloadFromDisk() {
    if (!state.currentReport) return;
    const meta = await Sync.loadMeta(state.currentReport.reportId);
    state.currentReport.meta = meta;
    // 활성 버전이 바뀌었으면 그걸로 이동
    if (meta.activeVersion !== state.viewingVersion) {
      await loadVersion(meta.activeVersion);
    } else {
      // 같은 버전이라도 파일 내용이 바뀌었을 수 있으니 재로드
      await loadVersion(state.viewingVersion);
    }
  }

  window.Store = {
    state,
    subscribe,
    loadReport,
    loadVersion,
    isActiveVersion,
    updateField,
    revertDraft,
    saveNewVersion,
    setActiveVersion,
    deleteVersion,
    setCompareMode,
    clearCompareMode,
    reloadFromDisk,
    hasDraft,
    clearDraft,
  };
})();
