/**
 * 더보다 AI 검토 도구 — File System Access API I/O
 *
 * 역할: reviews/ 폴더 읽기/쓰기
 * 저장소: IndexedDB에 폴더 핸들 캐시 (theboda_review_tool.handles.root)
 */

(function () {
  const IDB_NAME = 'theboda_review_tool';
  const IDB_STORE = 'handles';
  const ROOT_KEY = 'root';

  let _rootHandle = null;
  let _dbPromise = null;

  // ─── IndexedDB 헬퍼 ─────────────────────────────────────
  function openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = (e) => {
        e.target.result.createObjectStore(IDB_STORE);
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = () => reject(req.error);
    });
    return _dbPromise;
  }

  async function idbGet(key) {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  }

  async function idbSet(key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async function idbDel(key) {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(key);
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
  }

  // ─── 지원 여부 ──────────────────────────────────────────
  function isSupported() {
    return typeof window.showDirectoryPicker === 'function';
  }

  // ─── 초기화 (로드 시 핸들 복원) ──────────────────────────
  async function init() {
    if (!isSupported()) return false;
    try {
      const handle = await idbGet(ROOT_KEY);
      if (handle) {
        _rootHandle = handle;
        return true;
      }
    } catch (_) {}
    return false;
  }

  function hasRoot() {
    return _rootHandle != null;
  }

  // 권한 확인/요청 — readwrite 필요, user gesture 하에서만 호출
  async function ensurePermission() {
    if (!_rootHandle) throw new Error('폴더가 선택되지 않았습니다');
    const opts = { mode: 'readwrite' };
    if ((await _rootHandle.queryPermission(opts)) === 'granted') return true;
    if ((await _rootHandle.requestPermission(opts)) === 'granted') return true;
    throw new Error('폴더 읽기/쓰기 권한이 거부되었습니다');
  }

  async function pickRoot() {
    if (!isSupported()) throw new Error('이 브라우저는 File System Access API를 지원하지 않습니다 (Chrome/Edge 필요)');
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    _rootHandle = handle;
    await idbSet(ROOT_KEY, handle);
    // reviews 서브 폴더 보장
    await handle.getDirectoryHandle('reviews', { create: true });
    return handle;
  }

  async function clearRoot() {
    _rootHandle = null;
    await idbDel(ROOT_KEY);
  }

  // ─── 경로 유틸 ──────────────────────────────────────────
  async function getReviewsDir(create = false) {
    if (!_rootHandle) throw new Error('폴더가 선택되지 않았습니다');
    return _rootHandle.getDirectoryHandle('reviews', { create });
  }

  async function getReviewDir(reportId, create = false) {
    const reviews = await getReviewsDir(create);
    return reviews.getDirectoryHandle(reportId, { create });
  }

  async function getSubDir(parent, name, create = false) {
    return parent.getDirectoryHandle(name, { create });
  }

  // 파일 쓰기 (원자적) — 재시도 + Blob 래핑
  // InvalidStateError는 file:// + 대용량에서 종종 발생 → 재시도로 대부분 해소됨
  async function writeFile(dirHandle, filename, content) {
    const MAX_RETRIES = 2;
    let lastErr;
    // 문자열은 Blob으로 래핑 (대용량 쓰기가 더 안정적)
    const payload = typeof content === 'string'
      ? new Blob([content], { type: 'text/plain;charset=utf-8' })
      : content;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        // 매번 파일 핸들을 새로 가져와서 stale state 회피
        const fh = await dirHandle.getFileHandle(filename, { create: true });
        const writable = await fh.createWritable();
        await writable.write(payload);
        await writable.close();
        return;
      } catch (err) {
        lastErr = err;
        const msg = `[writeFile:${filename}] 시도 ${attempt + 1}/${MAX_RETRIES + 1} 실패 — ${err.name}: ${err.message}`;
        console.warn(msg);
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
        }
      }
    }
    throw new Error(`파일 쓰기 실패 (${filename}): ${lastErr && lastErr.message ? lastErr.message : lastErr}`);
  }

  async function readFile(dirHandle, filename) {
    const fh = await dirHandle.getFileHandle(filename, { create: false });
    const file = await fh.getFile();
    return await file.text();
  }

  // ─── reportId 생성 ──────────────────────────────────────
  function sanitizeForPath(s) {
    // 한글 유지, 공백/특수문자만 _
    return String(s || '').replace(/[^\w가-힣-]/g, '_').slice(0, 40);
  }

  function generateReportId(sourceReport) {
    const addr = sanitizeForPath((sourceReport.basic && sourceReport.basic.address) || '무제');
    const date = sanitizeForPath((sourceReport.basic && sourceReport.basic.inspectionDate) || new Date().toISOString().slice(0, 10)).replace(/[^0-9]/g, '').slice(0, 8);
    const rand = Math.random().toString(36).slice(2, 8);
    return `${addr}_${date}_${rand}`;
  }

  // ─── 리뷰 수준 API ─────────────────────────────────────
  async function listReviews() {
    await ensurePermission();
    const reviews = await getReviewsDir(true);
    const out = [];
    for await (const [, handle] of reviews.entries()) {
      if (handle.kind !== 'directory') continue;
      try {
        const metaText = await readFile(handle, 'meta.json');
        const meta = JSON.parse(metaText);
        out.push(meta);
      } catch (_) {
        // 메타 없는 폴더 건너뜀
      }
    }
    // 최신 import 순
    out.sort((a, b) => new Date(b.importedAt || 0) - new Date(a.importedAt || 0));
    return out;
  }

  // 리뷰 폴더 전체 리스트 (불완전한 — meta.json 없는 — 폴더 포함)
  // 정상 리뷰는 valid=true + meta, 불완전한 건 valid=false로 표시
  async function listAllReviewFolders() {
    await ensurePermission();
    const reviews = await getReviewsDir(true);
    const out = [];
    for await (const [name, handle] of reviews.entries()) {
      if (handle.kind !== 'directory') continue;
      try {
        const metaText = await readFile(handle, 'meta.json');
        const meta = JSON.parse(metaText);
        out.push({ valid: true, reportId: name, meta });
      } catch (_) {
        out.push({ valid: false, reportId: name, meta: null });
      }
    }
    out.sort((a, b) => {
      if (a.valid !== b.valid) return a.valid ? -1 : 1;
      const aT = a.meta && a.meta.importedAt ? new Date(a.meta.importedAt) : 0;
      const bT = b.meta && b.meta.importedAt ? new Date(b.meta.importedAt) : 0;
      return bT - aT;
    });
    return out;
  }

  /**
   * 새 리뷰 프로젝트 생성
   * @param {Object} sourceData — 파싱된 원본 JSON (기존 웹 exportJSON 포맷, _images 포함 가능)
   * @param {Function} onProgress — (step, detail) 진행 상황 콜백 (옵션)
   * @returns {Object} meta
   *
   * 메모리 효율 전략 (큰 파일 대응):
   * - sourceData._images 참조를 떼어낸 뒤 sourceData에서 delete → JSON.stringify는 슬림 버전에만 호출
   * - 이미지는 하나씩 write하고 imagesMap에서 delete → GC 가능
   * - source.json도 슬림 버전(이미지 없음)으로 저장. 이미지는 이미 images/ 에 있으므로 재구성 가능
   */
  async function createReview(sourceData, onProgress) {
    const step = (msg, detail) => {
      console.log(`[createReview] ${msg}`, detail || '');
      if (onProgress) onProgress(msg, detail);
    };

    step('권한 확인 중');
    await ensurePermission();
    if (!sourceData || !sourceData.basic) throw new Error('올바른 보고서 JSON이 아닙니다 (basic 필드 없음)');

    // ─── 이미지 맵 분리 (메모리 절약) ──────────────────
    // sourceData._images를 imagesMap으로 떼어낸 뒤 sourceData에서 제거
    // → 이후 JSON.stringify(sourceData)는 작은 구조만 직렬화
    const imagesMap = sourceData._images || {};
    delete sourceData._images;
    delete sourceData._exportedAt;
    const imageIds = Object.keys(imagesMap);
    step('이미지 분리 완료', `${imageIds.length}장`);

    // ─── reportId 생성 + 폴더 ─────────────────────────
    const reportId = generateReportId(sourceData);
    step('폴더 생성 중', reportId);
    const reviewDir = await getReviewDir(reportId, true);

    // 여기부터 폴더가 생성됨 → 실패 시 정리가 필요
    try {
      const versionsDir = await getSubDir(reviewDir, 'versions', true);
      const imagesDir = await getSubDir(reviewDir, 'images', true);

      // ─── 슬림 JSON 직렬화 (이미지 없음) ──────────────
      step('보고서 본문 직렬화 중');
      const slimJson = JSON.stringify(sourceData, null, 2);
      step('본문 직렬화 완료', `${(slimJson.length / 1024).toFixed(1)}KB`);

      // ─── 1) source.json (슬림) ───────────────────────
      step('source.json 저장 중');
      await writeFile(reviewDir, 'source.json', slimJson);

      // ─── 2) v001.json (동일 내용) ────────────────────
      step('v001.json 저장 중');
      await writeFile(versionsDir, 'v001.json', slimJson);

      // ─── 3) 이미지 파일들 하나씩 쓰기 ─────────────────
      //   각 이미지 쓰기 후 imagesMap에서 delete → 메모리 반환
      for (let i = 0; i < imageIds.length; i++) {
        const id = imageIds[i];
        step('이미지 저장 중', `${i + 1}/${imageIds.length}`);
        const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
        const data = imagesMap[id];
        if (data) {
          await writeFile(imagesDir, `${safeId}.txt`, data);
        }
        delete imagesMap[id]; // 처리 완료 → 참조 제거
      }

      // ─── 4) meta.json ────────────────────────────────
      step('meta.json 저장 중');
    const meta = {
      reportId,
      reportNo: (sourceData.basic && sourceData.basic.reportNo) || '',
      address: (sourceData.basic && sourceData.basic.address) || '(주소 미입력)',
      clientName: (sourceData.basic && sourceData.basic.clientName) || '',
      importedAt: new Date().toISOString(),
      sourceFile: 'source.json',
      activeVersion: 'v001',
      versions: [
        {
          id: 'v001',
          timestamp: new Date().toISOString(),
          author: 'system',
          label: '원본 임포트',
          description: `기존 웹에서 내보낸 파일 (이미지 ${imageIds.length}장)`,
          parentVersion: null,
          changedPaths: [],
        },
      ],
    };
      await writeFile(reviewDir, 'meta.json', JSON.stringify(meta, null, 2));

      // 5) notes.md 빈 파일
      await writeFile(reviewDir, 'notes.md', `# 검토 메모 — ${meta.address}\n\n`);

      step('완료', reportId);
      return meta;
    } catch (err) {
      // 실패 시 부분 폴더 정리 시도
      console.error('[createReview] 실패, 부분 폴더 정리 시도:', reportId, err);
      try {
        const reviews = await getReviewsDir();
        await reviews.removeEntry(reportId, { recursive: true });
        console.log('[createReview] 부분 폴더 정리 완료:', reportId);
      } catch (cleanupErr) {
        console.warn('[createReview] 부분 폴더 정리 실패 (수동 삭제 필요):', reportId, cleanupErr);
      }
      throw err;
    }
  }

  async function deleteReview(reportId) {
    await ensurePermission();
    const reviews = await getReviewsDir();
    await reviews.removeEntry(reportId, { recursive: true });
  }

  // ─── 버전 수준 ──────────────────────────────────────────
  async function loadMeta(reportId) {
    await ensurePermission();
    const dir = await getReviewDir(reportId);
    const text = await readFile(dir, 'meta.json');
    return JSON.parse(text);
  }

  async function saveMeta(reportId, meta) {
    await ensurePermission();
    const dir = await getReviewDir(reportId);
    await writeFile(dir, 'meta.json', JSON.stringify(meta, null, 2));
  }

  async function loadVersion(reportId, versionId) {
    await ensurePermission();
    const dir = await getReviewDir(reportId);
    const versions = await getSubDir(dir, 'versions');
    const text = await readFile(versions, `${versionId}.json`);
    return JSON.parse(text);
  }

  /**
   * 새 버전 저장
   * @param {string} reportId
   * @param {Object} data — 전체 보고서 JSON (images 없음)
   * @param {Object} info — { label, description, author, changedPaths, parentVersion }
   * @returns {Object} 갱신된 meta
   */
  async function saveNewVersion(reportId, data, info) {
    await ensurePermission();
    const dir = await getReviewDir(reportId);
    const versions = await getSubDir(dir, 'versions', true);

    const meta = JSON.parse(await readFile(dir, 'meta.json'));

    // 다음 버전 번호 계산
    const maxN = meta.versions.reduce((max, v) => {
      const n = parseInt(String(v.id).replace(/^v0*/, ''), 10);
      return isNaN(n) ? max : Math.max(max, n);
    }, 0);
    const newId = 'v' + String(maxN + 1).padStart(3, '0');

    // 이미지는 제거해서 저장 (versions에는 이미지 없음)
    const dataCopy = JSON.parse(JSON.stringify(data));
    delete dataCopy._images;
    delete dataCopy._exportedAt;

    await writeFile(versions, `${newId}.json`, JSON.stringify(dataCopy, null, 2));

    const entry = {
      id: newId,
      timestamp: new Date().toISOString(),
      author: info.author || 'user',
      label: info.label || '(라벨 없음)',
      description: info.description || '',
      parentVersion: info.parentVersion || meta.activeVersion,
      changedPaths: info.changedPaths || [],
    };
    meta.versions.push(entry);
    meta.activeVersion = newId;
    await writeFile(dir, 'meta.json', JSON.stringify(meta, null, 2));

    return { meta, versionId: newId };
  }

  async function setActiveVersion(reportId, versionId) {
    await ensurePermission();
    const dir = await getReviewDir(reportId);
    const meta = JSON.parse(await readFile(dir, 'meta.json'));
    if (!meta.versions.some((v) => v.id === versionId)) {
      throw new Error(`존재하지 않는 버전: ${versionId}`);
    }
    meta.activeVersion = versionId;
    await writeFile(dir, 'meta.json', JSON.stringify(meta, null, 2));
    return meta;
  }

  // ─── 이미지 ─────────────────────────────────────────────
  async function loadImage(reportId, imageId) {
    if (!imageId) return null;
    await ensurePermission();
    try {
      const dir = await getReviewDir(reportId);
      const images = await getSubDir(dir, 'images');
      const safeId = imageId.replace(/[^a-zA-Z0-9_-]/g, '_');
      return await readFile(images, `${safeId}.txt`);
    } catch (_) {
      return null;
    }
  }

  async function saveImage(reportId, imageId, dataUrl) {
    await ensurePermission();
    const dir = await getReviewDir(reportId);
    const images = await getSubDir(dir, 'images', true);
    const safeId = imageId.replace(/[^a-zA-Z0-9_-]/g, '_');
    await writeFile(images, `${safeId}.txt`, dataUrl);
  }

  // ─── 노트 ───────────────────────────────────────────────
  async function loadNotes(reportId) {
    await ensurePermission();
    try {
      const dir = await getReviewDir(reportId);
      return await readFile(dir, 'notes.md');
    } catch (_) {
      return '';
    }
  }

  async function saveNotes(reportId, text) {
    await ensurePermission();
    const dir = await getReviewDir(reportId);
    await writeFile(dir, 'notes.md', text);
  }

  // ─── 내보내기 ──────────────────────────────────────────
  // 버전 JSON에 images 폴더의 이미지를 inline해서 원본 포맷 blob 생성
  async function exportVersion(reportId, versionId) {
    await ensurePermission();
    const version = await loadVersion(reportId, versionId);

    // photoIds 수집
    const photoIds = new Set();
    const catData = version.categoryData || {};
    Object.values(catData).forEach((cd) => {
      const allCards = [];
      if (cd.cards) allCards.push(...cd.cards);
      if (cd.cardSlots) Object.values(cd.cardSlots).forEach((arr) => allCards.push(...(arr || [])));
      allCards.forEach((card) => {
        (card.photos || []).forEach((p) => p && p.id && photoIds.add(p.id));
      });
    });
    photoIds.add('floorplan');

    const images = {};
    for (const id of photoIds) {
      const data = await loadImage(reportId, id);
      if (data) images[id] = data;
    }

    const result = JSON.parse(JSON.stringify(version));
    result._images = images;
    result._exportedAt = new Date().toISOString();
    result._exportedFrom = `review-tool ${reportId} ${versionId}`;

    const json = JSON.stringify(result, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    return { blob, filename: `${reportId}_${versionId}.json` };
  }

  // ─── Export ─────────────────────────────────────────────
  window.Sync = {
    isSupported,
    init,
    pickRoot,
    hasRoot,
    ensurePermission,
    clearRoot,
    listReviews,
    listAllReviewFolders,
    createReview,
    deleteReview,
    loadMeta,
    saveMeta,
    loadVersion,
    saveNewVersion,
    setActiveVersion,
    loadImage,
    saveImage,
    loadNotes,
    saveNotes,
    exportVersion,
  };
})();
