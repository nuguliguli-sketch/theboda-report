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

  let s3Client = null;

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
  // ==========================================
  async function cloudSave(onProgress) {
    await ensureCredentials();
    const s3 = getS3();

    const report = Report.load();
    const reportId = generateReportId();
    report.meta = report.meta || {};
    report.meta.id = reportId;
    report.meta.updatedAt = new Date().toISOString();
    Report.save(report);

    const photoIds = collectPhotoIds(report);

    // 현재 S3에 있는 이미지 목록 조회 (삭제된 것 정리용)
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

    // 2) 사진들 업로드
    const uploadedKeys = new Set();
    let uploadedCount = 0;
    for (const id of photoIds) {
      const base64 = await Report.ImageStore.get(id);
      if (!base64) continue;
      const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
      const key = `${AWS_CONFIG.prefix}${reportId}/images/${safeId}.txt`;
      uploadedKeys.add(key);
      uploadedCount++;
      if (onProgress) onProgress(`사진 업로드 중 (${uploadedCount}/${photoIds.length})...`);
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

    return {
      reportId,
      photoCount: uploadedCount,
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
  };
})();
