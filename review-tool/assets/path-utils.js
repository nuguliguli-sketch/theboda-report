/**
 * 더보다 AI 검토 도구 — JSON 경로 유틸
 *
 * 경로 포맷: 'categoryData.A.cards[0].observation'
 * - dot 구분자 + 대괄호 배열 인덱스
 * - 토큰화: /[^.\[\]]+/g
 * - 숫자 토큰은 배열 인덱스로 해석
 */

(function () {
  // 경로 → 토큰 배열
  function parse(path) {
    if (!path || typeof path !== 'string') return [];
    const tokens = [];
    const regex = /[^.\[\]]+/g;
    let m;
    while ((m = regex.exec(path)) !== null) {
      const t = m[0];
      tokens.push(/^\d+$/.test(t) ? parseInt(t, 10) : t);
    }
    return tokens;
  }

  // 값 조회 — 경로가 없으면 undefined
  function get(obj, path) {
    const tokens = parse(path);
    let cur = obj;
    for (const t of tokens) {
      if (cur == null) return undefined;
      cur = cur[t];
    }
    return cur;
  }

  // 값 설정 — 존재하는 경로만 허용, 중간 생성 금지
  // 반환: true (성공) / false (경로 없음 또는 금지)
  function set(obj, path, value) {
    if (forbid(path)) return false;
    const tokens = parse(path);
    if (tokens.length === 0) return false;
    let cur = obj;
    for (let i = 0; i < tokens.length - 1; i++) {
      const t = tokens[i];
      if (cur == null || cur[t] === undefined) return false;
      cur = cur[t];
    }
    const last = tokens[tokens.length - 1];
    if (cur == null) return false;
    // 배열 인덱스는 범위 체크
    if (Array.isArray(cur) && typeof last === 'number') {
      if (last < 0 || last >= cur.length) return false;
    } else if (typeof cur === 'object' && !(last in cur)) {
      // 존재하지 않는 키는 거부
      return false;
    }
    cur[last] = value;
    return true;
  }

  // 금지 경로 체크
  function forbid(path) {
    if (!path) return true;
    // report.meta.* 필드 전체 차단 (단, meta.json 자체 수정은 별도 경로)
    if (/^meta(\.|$)/.test(path)) return true;
    // 모든 id 필드 (xxx.id, xxx[i].id 등)
    if (/(^|\.)id$/.test(path)) return true;
    // photos[].id
    if (/\.photos\[\d+\]\.id$/.test(path)) return true;
    // createdAt / updatedAt
    if (/(^|\.)createdAt$/.test(path)) return true;
    if (/(^|\.)updatedAt$/.test(path)) return true;
    return false;
  }

  // 깊은 비교 → 변경된 경로 목록
  // 반환: [{ path, type: 'added'|'removed'|'changed', before, after }]
  function diff(oldObj, newObj, basePath = '') {
    const results = [];

    function walk(a, b, path) {
      // 동일 참조/값
      if (a === b) return;

      // 한 쪽이 null/undefined
      if (a == null && b == null) return;
      if (a == null) {
        results.push({ path, type: 'added', before: a, after: b });
        return;
      }
      if (b == null) {
        results.push({ path, type: 'removed', before: a, after: b });
        return;
      }

      // 타입 다름
      if (typeof a !== typeof b) {
        results.push({ path, type: 'changed', before: a, after: b });
        return;
      }

      // 배열
      if (Array.isArray(a) && Array.isArray(b)) {
        const maxLen = Math.max(a.length, b.length);
        for (let i = 0; i < maxLen; i++) {
          walk(a[i], b[i], `${path}[${i}]`);
        }
        return;
      }

      // 배열이 한쪽만인 경우
      if (Array.isArray(a) !== Array.isArray(b)) {
        results.push({ path, type: 'changed', before: a, after: b });
        return;
      }

      // 객체
      if (typeof a === 'object' && typeof b === 'object') {
        const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
        for (const k of keys) {
          const nextPath = path ? `${path}.${k}` : k;
          walk(a[k], b[k], nextPath);
        }
        return;
      }

      // 원시 값 (문자열, 숫자, 불린)
      if (a !== b) {
        results.push({ path, type: 'changed', before: a, after: b });
      }
    }

    walk(oldObj, newObj, basePath);
    return results;
  }

  window.PathUtils = { parse, get, set, forbid, diff };
})();
