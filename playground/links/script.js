(() => {
  'use strict';
  const root = document.querySelector('.links-page');
  const form = root?.querySelector('.filters');
  if (!form) return;
  const search = root.querySelector('#search');
  const category = root.querySelector('#category');
  const results = root.querySelector('#results');
  const emptyState = root.querySelector('#empty-state');
  const entries = [...root.querySelectorAll('li[data-category]')];
  const sections = [...root.querySelectorAll('section')];
  const normalize = text => text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const topicButtons = [...root.querySelectorAll('[data-topic]')];
  const index = new Map(entries.map(entry => [entry, normalize(`${entry.textContent} ${entry.dataset.category} ${entry.querySelector('a').href}`)]));

  function readURL() {
    const params = new URLSearchParams(location.search);
    search.value = params.get('q') || '';
    category.value = params.get('topic') || '';
    if (category.selectedIndex < 0) category.value = '';
  }

  function render(updateURL = true) {
    const words = normalize(search.value.trim()).split(/\s+/).filter(Boolean);
    for (const entry of entries) {
      entry.hidden = Boolean((category.value && category.value !== entry.dataset.category) ||
        !words.every(word => index.get(entry).includes(word)));
    }
    sections.forEach(section => {
      section.hidden = !section.querySelector('li:not([hidden])');
    });
    topicButtons.forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.topic === category.value));
    });
    emptyState.hidden = entries.some(entry => !entry.hidden);
    if (updateURL) {
      const url = new URL(location.href);
      ['q', 'topic'].forEach(key => url.searchParams.delete(key));
      if (search.value.trim()) url.searchParams.set('q', search.value.trim());
      if (category.value) url.searchParams.set('topic', category.value);
      history.replaceState(null, '', url);
    }
  }

  search.addEventListener('input', () => render());
  category.addEventListener('change', () => render());
  topicButtons.forEach(button => button.addEventListener('click', () => {
    category.value = button.dataset.topic; render();
    const offset = parseFloat(getComputedStyle(root).getPropertyValue('--links-sticky-top')) || 0;
    const top = results.getBoundingClientRect().top + window.scrollY - offset;
    if (window.scrollY > top) window.scrollTo({ top, behavior: 'instant' });
  }));
  form.addEventListener('submit', event => { event.preventDefault(); render(); });
  document.addEventListener('keydown', event => {
    if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.target.closest('input,textarea,select,[contenteditable]')) {
      event.preventDefault(); search.focus();
    }
    if (event.key === 'Escape' && event.target === search) { search.value = ''; render(); }
  });
  window.addEventListener('popstate', () => { readURL(); render(false); });
  readURL(); render();
  document.documentElement.classList.add('enhanced-links');
  root.querySelectorAll('.enhanced').forEach(element => { element.hidden = false; });
})();
