(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const $$ = selector => Array.from(document.querySelectorAll(selector));

  if (!document.body.hasAttribute('data-speaker-view')) {
    const dialog = $('#speaker-script');
    let popup = null, returnFocus;
    let session = String(Date.now()) + Math.random().toString(36).slice(2);
    try {
      session = sessionStorage.getItem('datatalk-speaker-session') || session;
      sessionStorage.setItem('datatalk-speaker-session', session);
    } catch {}
    // The existing script in index.html remains the single source of truth.
    const slides = $$('.slide').map(slide => slide.dataset.title);
    const cards = $$('#speaker-script .script-card').map(card => ({
      role: card.dataset.role,
      start: Number(card.querySelector('[data-script-slide]').dataset.scriptSlide),
      meta: card.querySelector('small').textContent,
      title: card.querySelector('h3').textContent,
      paragraphs: Array.from(card.querySelectorAll('p:not(.cue)'), p => p.textContent),
      cue: card.querySelector('.cue')?.textContent || ''
    }));
    cards.forEach((card, i) => { card.end = (cards[i + 1]?.start ?? slides.length) - 1; });
    window.speaker = { read: () => ({ index: window.deck.getIndex(), slides, cards }) };

    function closeDialog() {
      if (dialog.open) dialog.close();
      returnFocus?.focus();
    }
    function open() {
      returnFocus = document.activeElement;
      try {
        if (!popup || popup.closed) {
          const width = Math.min(760, screen.availWidth || 760);
          const height = Math.min(900, screen.availHeight || 900);
          popup = window.open('speaker.html', 'datatalk-speaker-' + session,
            `popup=yes,width=${width},height=${height},resizable=yes,scrollbars=yes`);
        }
        if (popup && !popup.closed) {
          closeDialog();
          $('#notes').hidden = true;
          $('#notes-button').setAttribute('aria-pressed', 'false');
          popup.focus();
          return;
        }
      } catch { popup = null; }
      $('#script-window-help').textContent = '별도 창이 차단되었습니다. 주소창에서 팝업을 허용한 뒤 ‘별도 창 열기’를 눌러 주세요.';
      if (!dialog.open) dialog.showModal();
    }
    $('#script-button').addEventListener('click', open);
    $('#script-popout').addEventListener('click', open);
    $('#script-close').addEventListener('click', closeDialog);
    $$('[data-script-filter]').forEach(button => button.addEventListener('click', () => {
      const filter = button.dataset.scriptFilter;
      $$('[data-script-filter]').forEach(tab => tab.setAttribute('aria-selected', String(tab === button)));
      $$('#speaker-script .script-card').forEach(card => { card.hidden = filter !== 'all' && card.dataset.role !== filter; });
    }));
    $$('[data-script-slide]').forEach(button => button.addEventListener('click', () => {
      closeDialog();
      window.deck.go(Number(button.dataset.scriptSlide));
    }));
    document.addEventListener('keydown', event => {
      if (dialog.open) {
        if (event.key === 'Escape') { event.preventDefault(); closeDialog(); }
        event.stopImmediatePropagation();
        return;
      }
      if (!event.ctrlKey && !event.metaKey && !event.altKey &&
          !/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) &&
          !event.target.isContentEditable && event.key.toLowerCase() === 's') {
        event.preventDefault();
        open();
      }
    }, true);
    window.addEventListener('deckchange', () => {
      if (popup && !popup.closed) popup.postMessage({ type: 'datatalk-slide' }, location.origin);
    });
    return;
  }

  const content = $('#speaker-content');
  let state = null, source = null, lastCard = -1, fontSize = 22, connected = false;
  try { fontSize = Math.max(18, Math.min(36, Number(localStorage.getItem('datatalk-script-size')) || 22)); } catch {}
  function setFont(value) {
    fontSize = value;
    document.documentElement.style.setProperty('--script-size', value + 'px');
    $('#font-size').textContent = value;
    $('#font-smaller').disabled = value <= 18;
    $('#font-larger').disabled = value >= 36;
    try { localStorage.setItem('datatalk-script-size', String(value)); } catch {}
  }
  function activeCard() {
    return state.cards.findIndex(card => state.index >= card.start && state.index <= card.end);
  }
  function navigate(index) {
    if (!connected) return;
    try { window.opener.deck.go(index); sync(); } catch { sync(); }
  }
  function render() {
    if (!state) return;
    const filter = $('#script-view').value;
    const current = activeCard();
    content.replaceChildren();
    state.cards.forEach((card, i) => {
      if ((filter === 'current' && i !== current) ||
          (filter !== 'all' && filter !== 'current' && card.role !== filter)) return;
      const article = document.createElement('article');
      article.className = 'speaker-card';
      article.dataset.card = i;
      const meta = document.createElement('small');
      const range = card.start === card.end ? `${card.start + 1}장` : `${card.start + 1}–${card.end + 1}장`;
      meta.textContent = `${range} · ${card.meta}`;
      const title = document.createElement('h2');
      title.textContent = card.title;
      article.append(meta, title);
      card.paragraphs.forEach(text => {
        const p = document.createElement('p'); p.textContent = text; article.append(p);
      });
      if (card.cue) {
        const cue = document.createElement('p'); cue.className = 'cue'; cue.textContent = card.cue; article.append(cue);
      }
      if (filter !== 'current') {
        const button = document.createElement('button');
        button.type = 'button'; button.textContent = `${card.start + 1}장으로 이동`;
        button.addEventListener('click', () => navigate(card.start));
        article.append(button);
      }
      content.append(article);
    });
    content.scrollTop = 0;
    lastCard = current;
    updateNavigation();
  }
  function updateNavigation() {
    if (!state) return;
    $('#speaker-counter').textContent = `${state.index + 1} / ${state.slides.length}`;
    $('#speaker-caption').textContent = state.slides[state.index];
    $('#speaker-prev').disabled = !connected || state.index === 0;
    $('#speaker-next').disabled = !connected || state.index === state.slides.length - 1;
    $$('.speaker-card').forEach(card => {
      const current = Number(card.dataset.card) === activeCard();
      card.classList.toggle('current', current);
      if (current) card.setAttribute('aria-current', 'true'); else card.removeAttribute('aria-current');
      card.querySelector('button')?.toggleAttribute('disabled', !connected);
    });
  }
  function sync() {
    let next = null, nextSource = null;
    try {
      if (window.opener && !window.opener.closed) {
        nextSource = window.opener.speaker;
        next = nextSource?.read();
      }
    } catch {}
    connected = Boolean(next);
    $('#connection').textContent = connected ? '슬라이드 연결됨' : '발표 화면 연결 끊김';
    $('#connection').classList.toggle('disconnected', !connected);
    if (next) {
      const changedSource = source !== nextSource;
      source = nextSource;
      state = next;
      // Keep the reading position while several slides share one script section.
      if (changedSource || ($('#script-view').value === 'current' && activeCard() !== lastCard)) render();
    }
    updateNavigation();
  }
  $('#script-view').addEventListener('change', render);
  $('#font-smaller').addEventListener('click', () => setFont(Math.max(18, fontSize - 2)));
  $('#font-larger').addEventListener('click', () => setFont(Math.min(36, fontSize + 2)));
  $('#speaker-prev').addEventListener('click', () => navigate(state.index - 1));
  $('#speaker-next').addEventListener('click', () => navigate(state.index + 1));
  document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable || !connected) return;
    let index;
    if (['ArrowRight', 'PageDown'].includes(event.key) || (event.key === ' ' && event.target.tagName !== 'BUTTON')) index = state.index + 1;
    else if (['ArrowLeft', 'PageUp'].includes(event.key)) index = state.index - 1;
    else if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = state.slides.length - 1;
    if (index !== undefined) { event.preventDefault(); navigate(index); }
  });
  window.addEventListener('message', event => {
    if (event.source === window.opener && event.origin === location.origin && event.data?.type === 'datatalk-slide') sync();
  });
  window.addEventListener('focus', sync);
  setFont(fontSize);
  sync();
  // Recover after the presentation is refreshed, and detect when it is closed.
  setInterval(sync, 500);
})();
