/**
 * 더보다 AI 검토 도구 — 버전 타임라인
 *
 * 좌측 패널: 버전 리스트 (최신이 위)
 * 기능: 클릭 이동, 비교 모드 체크박스, Ctrl+S 저장 모달
 */

(function () {
  let mountEl = null;
  let compareCheckMode = false;

  function escapeHTML(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear().toString().slice(2)}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function authorBadge(author) {
    if (author === 'claude') return '<span class="author-badge claude">Claude</span>';
    if (author === 'system') return '<span class="author-badge system">시스템</span>';
    return '<span class="author-badge user">사용자</span>';
  }

  function render() {
    if (!mountEl) return;
    const report = Store.state.currentReport;

    if (!report) {
      mountEl.innerHTML = `
        <div class="timeline-empty">
          <p>리뷰가 로드되지 않았습니다</p>
        </div>
      `;
      return;
    }

    const versions = [...report.meta.versions].reverse(); // 최신이 위
    const activeId = report.meta.activeVersion;
    const viewingId = Store.state.viewingVersion;
    const compareMode = Store.state.compareMode;

    mountEl.innerHTML = `
      <div class="timeline-header">
        <div class="timeline-title">타임라인</div>
        <div class="timeline-subtitle">${escapeHTML(report.meta.address)}</div>
      </div>

      ${compareCheckMode ? `
        <div class="timeline-compare-hint">비교할 버전 2개를 체크하세요</div>
      ` : ''}

      <div class="timeline-list">
        ${versions.map((v) => {
          const isActive = v.id === activeId;
          const isViewing = v.id === viewingId;
          const isCompareA = compareMode && compareMode.a === v.id;
          const isCompareB = compareMode && compareMode.b === v.id;
          const classes = [
            'timeline-item',
            isActive ? 'active' : '',
            isViewing ? 'viewing' : '',
            isCompareA ? 'compare-a' : '',
            isCompareB ? 'compare-b' : '',
          ].filter(Boolean).join(' ');
          return `
            <div class="${classes}" data-version="${escapeHTML(v.id)}">
              ${compareCheckMode ? `<input type="checkbox" class="compare-check" data-version="${escapeHTML(v.id)}">` : ''}
              <div class="timeline-item-body">
                <div class="timeline-item-head">
                  <span class="version-id">${escapeHTML(v.id)}</span>
                  ${isActive ? '<span class="active-star" title="활성 버전">★</span>' : ''}
                  ${authorBadge(v.author)}
                </div>
                <div class="timeline-item-label">${escapeHTML(v.label || '(라벨 없음)')}</div>
                ${v.description ? `<div class="timeline-item-desc">${escapeHTML(v.description)}</div>` : ''}
                <div class="timeline-item-meta">
                  ${formatTime(v.timestamp)}
                  ${v.changedPaths && v.changedPaths.length > 0 ? ` · ${v.changedPaths.length}건 변경` : ''}
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <div class="timeline-footer">
        <button class="btn btn-ghost btn-sm" id="btn-save-version" title="Ctrl+S">
          💾 새 버전 저장
        </button>
        <button class="btn btn-ghost btn-sm ${compareCheckMode ? 'active' : ''}" id="btn-compare-toggle">
          ${compareCheckMode ? '✕ 비교 취소' : '⇄ 비교'}
        </button>
        ${Store.state.dirty ? `
          <div class="dirty-indicator">● 저장되지 않은 변경</div>
        ` : ''}
      </div>
    `;

    attachListeners();
  }

  function attachListeners() {
    // 버전 클릭
    mountEl.querySelectorAll('.timeline-item').forEach((el) => {
      el.addEventListener('click', async (e) => {
        if (e.target.classList.contains('compare-check')) return;
        const vid = el.dataset.version;
        if (!vid) return;
        try {
          if (Store.state.dirty) {
            if (!confirm('저장되지 않은 변경이 있습니다. 버전을 전환하면 변경이 드래프트로 유지됩니다. 전환하시겠습니까?')) {
              return;
            }
          }
          await Store.loadVersion(vid);
        } catch (err) {
          alert('버전 로드 실패: ' + err.message);
        }
      });
    });

    // 비교 체크박스
    mountEl.querySelectorAll('.compare-check').forEach((el) => {
      el.addEventListener('change', () => {
        const checked = Array.from(mountEl.querySelectorAll('.compare-check:checked')).map((e) => e.dataset.version);
        if (checked.length === 2) {
          Store.setCompareMode(checked[0], checked[1]);
          compareCheckMode = false;
          render();
        } else if (checked.length > 2) {
          el.checked = false;
          alert('2개만 선택 가능합니다');
        }
      });
    });

    // 저장 버튼
    const saveBtn = mountEl.querySelector('#btn-save-version');
    if (saveBtn) {
      saveBtn.addEventListener('click', openSaveModal);
    }

    // 비교 토글
    const cmpBtn = mountEl.querySelector('#btn-compare-toggle');
    if (cmpBtn) {
      cmpBtn.addEventListener('click', () => {
        if (compareCheckMode) {
          compareCheckMode = false;
          Store.clearCompareMode();
        } else {
          compareCheckMode = true;
          Store.clearCompareMode();
        }
        render();
      });
    }
  }

  // ─── 저장 모달 ─────────────────────────────────────────
  function openSaveModal() {
    if (!Store.state.dirty) {
      alert('변경 사항이 없습니다');
      return;
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">새 버전 저장</div>
          <button class="modal-close" id="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <label>라벨 (필수)</label>
          <input type="text" id="version-label" placeholder="예: 오타 수정, A-1 판정 강화" maxlength="60" autofocus>
          <label>설명 (선택)</label>
          <textarea id="version-desc" rows="3" placeholder="변경한 내용을 자유롭게 설명"></textarea>
          <div class="modal-hint">부모 버전: ${escapeHTML(Store.state.viewingVersion)} → 새 버전이 그 위에 추가됩니다</div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="modal-cancel">취소</button>
          <button class="btn btn-primary" id="modal-save">저장</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    const labelInput = backdrop.querySelector('#version-label');
    const descInput = backdrop.querySelector('#version-desc');
    labelInput.focus();

    const close = () => backdrop.remove();

    backdrop.querySelector('#modal-close').addEventListener('click', close);
    backdrop.querySelector('#modal-cancel').addEventListener('click', close);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close();
    });

    const doSave = async () => {
      const label = labelInput.value.trim();
      if (!label) {
        alert('라벨을 입력해주세요');
        labelInput.focus();
        return;
      }
      const desc = descInput.value.trim();
      try {
        await Store.saveNewVersion(label, desc, 'user');
        close();
      } catch (err) {
        alert('저장 실패: ' + err.message);
      }
    };

    backdrop.querySelector('#modal-save').addEventListener('click', doSave);
    labelInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        doSave();
      }
    });
  }

  // ─── 전역 단축키 ───────────────────────────────────────
  function attachGlobalShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Ctrl+S → 저장 모달
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (Store.state.currentReport && Store.state.dirty) {
          openSaveModal();
        }
      }
    });
  }

  function mount(container) {
    mountEl = container;
    Store.subscribe(() => render());
    attachGlobalShortcuts();
    render();
  }

  window.Timeline = { mount, render, openSaveModal };
})();
