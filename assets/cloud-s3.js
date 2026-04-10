/**
 * 더보다 AI - AWS S3 기반 클라우드 동기화
 *
 * 구조:
 *   s3://theboda-reports-storage/
 *     reports/
 *       {reportId}/
 *         report.json     ← 보고서 본문 (이미지 ID만 포함)
 *         images/
 *           {photoId}.txt ← 사진 base64 (개별 파일)
 *
 * 인증: Cognito Identity Pool (게스트/익명)
 * 권한: reports/ 하위만 읽기/쓰기 가능 (IAM 정책으로 제한)
 */

(function () {
  // ==========================================
  // 설정
  // ==========================================
  const AWS_CONFIG = {
    region: 'ap-northeast-2',
    identityPoolId: 'ap-northeast-2:0d4118ca-d298-46b0-ae69-e2bfd0800079',
    bucket: 'theboda-reports-storage',
    prefix: 'reports/',
  };

  const LAST_SAVE_KEY_PREFIX = 'theboda_last_cloud_save_';

  let s3Client = null;

  // ==========================================
  // 해시 / 메타데이터 유틸
  // ==========================================
  // 빠른 문자열 해시 (djb2 변형)
  function hashString(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return (hash >>> 0).toString(36);
  }

  // 보고서 내용 해시 (타임스탬프 제외하여 실제 내용 변경만 감지)
  function getReportHash(report) {
    if (!report) return '';
    const clone = JSON.parse(JSON.stringify(report));
    if (clone.meta) {
      delete clone.meta.updatedAt;
      delete clone.meta.createdAt;
    }
    return hashString(JSON.stringify(clone));
  }

  function getLastCloudSaveInfo(reportId) {
    if (!reportId) return null;
    try {
      const raw = localStorage.getItem(LAST_SAVE_KEY_PREFIX + reportId);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function setLastCloudSaveInfo(reportId, info) {
    if (!reportId) return;
    try {
      localStorage.setItem(LAST_SAVE_KEY_PREFIX + reportId, JSON.stringify(info));
    } catch (_) {}
  }

  function clearLastCloudSaveInfo(reportId) {
    if (!reportId) return;
    try {
      localStorage.removeItem(LAST_SAVE_KEY_PREFIX + reportId);
    } catch (_) {}
  }

  // 현재 활성 보고서가 마지막 클라우드 저장 이후 변경되었는지 확인
  function isDirty() {
    try {
      const report = Report.load();
      if (!report || !report.meta || !report.meta.id) return false;
      const last = getLastCloudSaveInfo(report.meta.id);
      if (!last) return true; // 한 번도 저장 안 됨 = dirty
      return getReportHash(report) !== last.hash;
    } catch (_) {
      return false;
    }
  }

  // ==========================================
  // S3 클라이언트 초기화
  // ==========================================
  function getS3() {
    if (s3Client) return s3Client;
    if (typeof AWS === 'undefined') {
      throw new Error('AWS SDK가 로드되지 않았습니다. 페이지를 새로고침해주세요.');
    }
    AWS.config.region = AWS_CONFIG.region;
    AWS.config.credentials = new AWS.CognitoIdentityCredentials({
      IdentityPoolId: AWS_CONFIG.identityPoolId,
    });
    s3Client = new AWS.S3({
      apiVersion: '2006-03-01',
      params: { Bucket: AWS_CONFIG.bucket },
    });
    return s3Client;
  }

  // 자격증명 유효성 확인 (최초 1회 또는 만료 시)
  async function ensureCredentials() {
    return new Promise((resolve, reject) => {
      getS3();
      AWS.config.credentials.get((err) => {
        if (err) reject(new Error('AWS 자격증명 발급 실패: ' + err.message));
        else resolve();
      });
    });
  }

  // ==========================================
  // 유틸
  // ==========================================
  function generateReportId() {
    // 기존 보고서에 id가 있으면 재사용
    const report = Report.load();
    if (report && report.meta && report.meta.id && report.meta.id.startsWith('rpt_')) {
      return report.meta.id;
    }
    return 'rpt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  function collectPhotoIds(report) {
    const ids = new Set();
    const catData = report.categoryData || {};
    Object.values(catData).forEach((cd) => {
      const allCards = [];
      if (cd.cards) allCards.push(...cd.cards);
      if (cd.cardSlots) {
        Object.values(cd.cardSlots).forEach((arr) => allCards.push(...(arr || [])));
      }
      allCards.forEach((card) => {
        (card.photos || []).forEach((p) => {
          if (p && p.id) ids.add(p.id);
        });
      });
    });
    // 평면도
    ids.add('floorplan');
    return Array.from(ids);
  }

  // ==========================================
  // 저장
  // options: { onProgress, silent, skipExistingPhotos }
  //   - skipExistingPhotos: true면 이미 S3에 있는 사진은 재업로드 스킵 (자동저장용)
  // ==========================================
  async function cloudSave(optionsOrOnProgress) {
    // 하위호환: 함수 하나만 넘어오면 onProgress로 해석
    const options =
      typeof optionsOrOnProgress === 'function'
        ? { onProgress: optionsOrOnProgress }
        : optionsOrOnProgress || {};
    const { onProgress, skipExistingPhotos = false } = options;

    await ensureCredentials();
    const s3 = getS3();

    const report = Report.load();
    const reportId = generateReportId();
    report.meta = report.meta || {};
    report.meta.id = reportId;
    report.meta.updatedAt = new Date().toISOString();
    Report.save(report);

    const photoIds = collectPhotoIds(report);

    // 현재 S3에 있는 이미지 목록 조회 (삭제된 것 정리 + 중복 업로드 회피)
    let existingImageKeys = new Set();
    try {
      const listResp = await s3
        .listObjectsV2({
          Prefix: `${AWS_CONFIG.prefix}${reportId}/images/`,
        })
        .promise();
      (listResp.Contents || []).forEach((obj) => existingImageKeys.add(obj.Key));
    } catch (_) {}

    // 1) 보고서 JSON 업로드 (이미지 제외)
    if (onProgress) onProgress('보고서 본문 업로드 중...');
    const reportCopy = JSON.parse(JSON.stringify(report));
    delete reportCopy._images;

    await s3
      .putObject({
        Key: `${AWS_CONFIG.prefix}${reportId}/report.json`,
        Body: JSON.stringify(reportCopy, null, 2),
        ContentType: 'application/json; charset=utf-8',
      })
      .promise();

    // 2) 사진 업로드 — skipExistingPhotos면 이미 S3에 있는 건 건너뜀
    const uploadedKeys = new Set();
    let uploadedCount = 0;
    let skippedCount = 0;
    for (const id of photoIds) {
      const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
      const key = `${AWS_CONFIG.prefix}${reportId}/images/${safeId}.txt`;
      uploadedKeys.add(key);

      // 사진은 ID로 식별되므로 이미 올라간 것은 동일한 내용 -> 업로드 스킵
      if (skipExistingPhotos && existingImageKeys.has(key)) {
        skippedCount++;
        continue;
      }

      const base64 = await Report.ImageStore.get(id);
      if (!base64) continue;
      uploadedCount++;
      if (onProgress) onProgress(`사진 업로드 중 (${uploadedCount}/${photoIds.length - skippedCount})...`);
      await s3
        .putObject({
          Key: key,
          Body: base64,
          ContentType: 'text/plain; charset=utf-8',
        })
        .promise();
    }

    // 3) 더 이상 사용하지 않는 이미지 삭제
    const toDelete = [];
    existingImageKeys.forEach((k) => {
      if (!uploadedKeys.has(k)) toDelete.push({ Key: k });
    });
    if (toDelete.length > 0) {
      if (onProgress) onProgress('이전 사진 정리 중...');
      try {
        await s3
          .deleteObjects({
            Delete: { Objects: toDelete, Quiet: true },
          })
          .promise();
      } catch (_) {}
    }

    // 4) 마지막 클라우드 저장 메타데이터 기록 (dirty 판정용)
    setLastCloudSaveInfo(reportId, {
      time: new Date().toISOString(),
      hash: getReportHash(report),
    });

    return {
      reportId,
      photoCount: uploadedCount,
      skippedCount,
    };
  }

  // ==========================================
  // 불러오기
  // ==========================================
  async function cloudLoad(reportId, onProgress) {
    if (!reportId) throw new Error('보고서 ID가 필요합니다');
    await ensureCredentials();
    const s3 = getS3();

    // 1) report.json
    if (onProgress) onProgress('보고서 본문 다운로드 중...');
    let reportObj;
    try {
      reportObj = await s3
        .getObject({
          Key: `${AWS_CONFIG.prefix}${reportId}/report.json`,
        })
        .promise();
    } catch (err) {
      if (err.code === 'NoSuchKey') throw new Error('존재하지 않는 보고서 ID입니다');
      throw err;
    }

    const bodyStr =
      typeof reportObj.Body === 'string'
        ? reportObj.Body
        : new TextDecoder('utf-8').decode(reportObj.Body);
    const report = JSON.parse(bodyStr);

    // 2) 이미지 목록
    if (onProgress) onProgress('사진 목록 조회 중...');
    const listResp = await s3
      .listObjectsV2({
        Prefix: `${AWS_CONFIG.prefix}${reportId}/images/`,
      })
      .promise();

    const imageKeys = (listResp.Contents || []).map((o) => o.Key);

    // 3) 이미지 다운로드 + IndexedDB 저장
    let imageCount = 0;
    for (const key of imageKeys) {
      imageCount++;
      if (onProgress) onProgress(`사진 다운로드 중 (${imageCount}/${imageKeys.length})...`);
      try {
        const imgObj = await s3.getObject({ Key: key }).promise();
        const base64 =
          typeof imgObj.Body === 'string'
            ? imgObj.Body
            : new TextDecoder('utf-8').decode(imgObj.Body);
        const filename = key.split('/').pop() || '';
        const id = filename.replace(/\.txt$/, '');
        await Report.ImageStore.save(id, base64);
      } catch (_) {}
    }

    // 4) 저장
    report.meta = report.meta || {};
    report.meta.id = reportId;
    Report.save(report);

    // 방금 클라우드에서 불러온 상태 = 클라우드와 로컬이 동기화된 상태
    setLastCloudSaveInfo(reportId, {
      time: new Date().toISOString(),
      hash: getReportHash(report),
    });

    return { reportId, imageCount };
  }

  // ==========================================
  // 목록 조회
  // ==========================================
  async function cloudList() {
    await ensureCredentials();
    const s3 = getS3();

    // reports/ 하위의 폴더(CommonPrefixes) 조회
    const listResp = await s3
      .listObjectsV2({
        Prefix: AWS_CONFIG.prefix,
        Delimiter: '/',
      })
      .promise();

    const reportIds = (listResp.CommonPrefixes || [])
      .map((p) => p.Prefix.replace(AWS_CONFIG.prefix, '').replace(/\/$/, ''))
      .filter((id) => id.startsWith('rpt_'));

    // 각 보고서 메타데이터 로드 (병렬)
    const results = await Promise.all(
      reportIds.map(async (id) => {
        try {
          const obj = await s3
            .getObject({
              Key: `${AWS_CONFIG.prefix}${id}/report.json`,
            })
            .promise();
          const body =
            typeof obj.Body === 'string'
              ? obj.Body
              : new TextDecoder('utf-8').decode(obj.Body);
          const r = JSON.parse(body);
          return {
            id,
            address: (r.basic || {}).address || '(주소 미입력)',
            unit: (r.basic || {}).unit || '',
            clientName: (r.basic || {}).clientName || '',
            reportNo: (r.basic || {}).reportNo || '',
            updatedAt: (r.meta || {}).updatedAt || obj.LastModified,
            lastModified: obj.LastModified,
          };
        } catch (e) {
          return null;
        }
      }),
    );

    // 최신순 정렬
    return results
      .filter(Boolean)
      .sort((a, b) => new Date(b.updatedAt || b.lastModified) - new Date(a.updatedAt || a.lastModified));
  }

  // ==========================================
  // 삭제
  // ==========================================
  async function cloudDelete(reportId) {
    if (!reportId) throw new Error('보고서 ID가 필요합니다');
    await ensureCredentials();
    const s3 = getS3();

    // 해당 보고서의 모든 파일 조회
    const listResp = await s3
      .listObjectsV2({
        Prefix: `${AWS_CONFIG.prefix}${reportId}/`,
      })
      .promise();

    const keys = (listResp.Contents || []).map((o) => ({ Key: o.Key }));
    if (keys.length === 0) return { deleted: 0 };

    await s3
      .deleteObjects({
        Delete: { Objects: keys, Quiet: true },
      })
      .promise();

    // 로컬의 마지막 저장 메타데이터도 정리
    clearLastCloudSaveInfo(reportId);

    return { deleted: keys.length };
  }

  // ==========================================
  // 현재 보고서의 Cloud ID 조회/설정
  // ==========================================
  function getCurrentCloudId() {
    const report = Report.load();
    return (report && report.meta && report.meta.id) || null;
  }

  // ==========================================
  // Export
  // ==========================================
  window.CloudS3 = {
    config: AWS_CONFIG,
    save: cloudSave,
    load: cloudLoad,
    list: cloudList,
    delete: cloudDelete,
    getCurrentCloudId,
    ensureCredentials,
    // 자동저장 + dirty 감지용
    isDirty,
    getReportHash,
    getLastCloudSaveInfo,
  };
})();
