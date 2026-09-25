const STORAGE_KEY = 'sargeant-gita-reader-v1';
const SITE_FONTS = {
  lexend: '"Lexend", sans-serif',
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  opendyslexic: '"OpenDyslexic", sans-serif'
};
const SITE_THEMES = ['light', 'dark', 'cream'];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII'];

// Concise reading aids. Sargeant's fuller, verse-specific vocabulary remains visible on each original page.
const READING_WORDS = {
  dharma: 'Duty, law, righteousness, virtue, or honor.',
  yoga: 'A discipline or path of practice; the book uses the word in several related ways.',
  Krishna: 'Arjuna’s charioteer and teacher in the dialogue.',
  Arjuna: 'The Pāṇḍava warrior who turns to Krishna for counsel.',
  Dhritarashtra: 'The blind Kuru king to whom Saṃjaya recounts the events.',
  Sanjaya: 'The narrator who reports the battlefield dialogue to Dhritarashtra.',
  Kurukshetra: 'The battlefield where the two armies meet.',
  Duryodhana: 'Leader of the Kaurava side in the war.',
  Drona: 'The teacher of both the Pandava and Kaurava princes.',
  Bhishma: 'An elder warrior fighting for the Kaurava side.',
  Brahman: 'The imperishable reality discussed throughout the Gītā.',
  Pandu: 'Father of the Pāṇḍava brothers, including Arjuna.',
  Pandavas: 'The five sons of Pāṇḍu and their allies.',
  Kauravas: 'The sons of Dhritarashtra and their allies.',
  guna: 'A quality or constituent of nature; Book XIV discusses three guṇas.',
  gunas: 'The three qualities or constituents of nature discussed in Book XIV.',
  sattva: 'The quality of clarity, balance, and harmony.',
  rajas: 'The quality of restless activity and desire.',
  tamas: 'The quality of inertia and obscurity.'
};
const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  book: '<path d="M12 7c-2.4-1.5-5.3-1.8-9-1v13c3.7-.8 6.6-.5 9 1 2.4-1.5 5.3-1.8 9-1V6c-3.7-.8-6.6-.5-9 1Z"/><path d="M12 7v13"/>',
  bookmark: '<path d="M6 4.5h12v16l-6-4-6 4v-16Z"/>',
  bookmarkFilled: '<path d="M6 4.5h12v16l-6-4-6 4v-16Z" fill="currentColor"/>',
  arrowLeft: '<path d="m12 5-7 7 7 7M5 12h14"/>',
  arrowRight: '<path d="m12 5 7 7-7 7M19 12H5"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  x: '<path d="M5 5 19 19M19 5 5 19"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M22 12h-2M4 12H2M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4M19.1 19.1l-1.4-1.4M6.3 6.3 4.9 4.9"/>',
  moon: '<path d="M20 15.2A8.5 8.5 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.4 1a8 8 0 0 0-1.7-1L14.4 3h-4.8l-.4 3a8 8 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a8 8 0 0 0 1.7 1l.4 3h4.8l.4-3a8 8 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6a7 7 0 0 0 .1-1Z"/>',
  external: '<path d="M13 4h7v7M20 4l-9 9"/><path d="M20 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h6"/>',
  expand: '<path d="M8 4H4v4M4 4l6 6M16 4h4v4M20 4l-6 6M4 16v4h4M4 20l6-6M20 16v4h-4M20 20l-6-6"/>',
  note: '<path d="M5 4h14v16H5zM8 9h8M8 13h8M8 17h5"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 17v3h16v-3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  panel: '<path d="M4 4h16v16H4zM14 4v16"/>',
  check: '<path d="m4 12 5 5L20 6"/>'
};

const icon = (name, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
const quickActions = () => [
  ['search', 'Search', 'Search the book', 'search'],
  ['bookmarks', 'Saved', 'Saved passages', 'bookmark'],
  ['introductions', 'Intro', 'Introduction', 'info'],
  ['settings', 'Display', 'Display settings', 'settings']
].map(([action, label, accessible, symbol]) => {
  const current = (action === 'bookmarks' && state.view === 'bookmarks') || (action === 'introductions' && ['introductions', 'essay'].includes(state.view));
  return `<button class="icon-button nav-action${current ? ' is-current' : ''}" data-action="${action}" aria-label="${accessible}" ${current ? 'aria-current="page"' : ''} title="${accessible}">${icon(symbol, 18)}<span class="nav-action-label">${label}</span></button>`;
}).join('');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const imagePageLink = page => `./public/pages/page-${String(page).padStart(3, '0')}.webp`;
const chapterVerseKey = (chapter, verse) => `${chapter}:${verse}`;
const verseKey = verse => chapterVerseKey(verse.chapter, verse.verse);
const verseLabel = verse => verse.verse === 0 ? `${verse.chapter} · opening` : `${verse.chapter}.${verse.verse}`;

function readStored() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
}
function readSitePreference(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
const stored = readStored();
const preferredFont = readSitePreference('font');
const preferredSize = Number(readSitePreference('fontSize'));
const state = {
  book: null,
  frontmatter: null,
  concepts: [],
  verses: [],
  selected: null,
  view: 'reader',
  essay: null,
  bookmarks: new Set(stored.bookmarks || []),
  notes: stored.notes || {},
  fontSize: Number.isFinite(preferredSize) && preferredSize > 0 ? preferredSize : 1,
  readingFont: SITE_FONTS[preferredFont] ? preferredFont : 'lexend',
  theme: window.getPreferredTheme(),
  lastRead: stored.lastRead || '1:1',
  studyOpen: false,
  modal: null,
  searchQuery: ''
};

const glossaryEntries = new Map();
const glossaryAliases = new Map();
const wordCharacter = /[\p{L}\p{N}\p{M}]/u;
let glossaryMatcher = null;
let activeWordButton = null;
let wordPopoverPinned = false;

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    bookmarks: [...state.bookmarks], notes: state.notes, lastRead: state.lastRead
  }));
}

function setAppearance() {
  window.applyTheme(state.theme);
  const root = document.documentElement;
  root.style.setProperty('--blog-font-family', SITE_FONTS[state.readingFont]);
  root.style.setProperty('--blog-font-size', `${state.fontSize}rem`);
  root.style.setProperty('--reader-scale', state.fontSize);
  localStorage.setItem('font', state.readingFont);
  localStorage.setItem('fontSize', state.fontSize);
  const background = getComputedStyle(root).getPropertyValue('--background-color').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background);
}

function parseRoute() {
  const raw = decodeURIComponent(location.hash.slice(1));
  let match = raw.match(/^\/read\/(\d+)\/(\d+)$/);
  if (match) return { view: 'reader', ref: `${Number(match[1])}:${Number(match[2])}` };
  match = raw.match(/^\/essay\/([a-z0-9-]+)$/);
  if (match) return { view: 'essay', id: match[1] };
  if (raw === '/introductions') return { view: 'introductions' };
  if (raw === '/bookmarks') return { view: 'bookmarks' };
  return { view: 'reader', ref: state.lastRead };
}

function setRoute(route, push = true) {
  const next = `#${route}`;
  if (location.hash !== next) history[push ? 'pushState' : 'replaceState'](null, '', next);
}

function currentVerse() {
  return state.verses.find(v => verseKey(v) === state.selected) || state.verses[0];
}

function chapterFor(number) { return state.book.chapters.find(ch => ch.number === number); }
function sourcePage(verse) { return Array.isArray(verse.sourcePages) ? verse.sourcePages[0] : verse.sourcePages; }
function printedPage(pdfPage) { return pdfPage - 34; }

function buildInlineGlossary() {
  glossaryEntries.clear();
  glossaryAliases.clear();
  let nextId = 0;
  const add = (term, meaning, aliases = [], priority = 1) => {
    const entry = { id: String(++nextId), term, meaning, priority };
    glossaryEntries.set(entry.id, entry);
    for (const alias of [term, ...aliases]) {
      const key = alias.toLocaleLowerCase();
      if (!glossaryAliases.has(key)) glossaryAliases.set(key, entry);
    }
  };
  state.concepts.forEach(entry => add(entry.term, entry.meaning, entry.aliases || [], 0));
  Object.entries(READING_WORDS).forEach(([term, meaning]) => add(term, meaning));
  const escapePattern = value => [...value].map(char => '\\^$.*+?()[]{}|'.includes(char) ? '\\' + char : char).join('');
  glossaryMatcher = new RegExp([...glossaryAliases.keys()].sort((a, b) => b.length - a.length).map(escapePattern).join('|'), 'giu');
}

function renderGlossaryText(text) {
  if (!glossaryMatcher) return esc(text);
  const candidates = [];
  const seen = new Set();
  for (const match of text.matchAll(glossaryMatcher)) {
    const start = match.index;
    const end = start + match[0].length;
    if ((start > 0 && wordCharacter.test(text[start - 1])) || (end < text.length && wordCharacter.test(text[end]))) continue;
    const entry = glossaryAliases.get(match[0].toLocaleLowerCase());
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    candidates.push({ start, end, entry });
  }
  const selected = candidates.sort((a, b) => a.entry.priority - b.entry.priority || a.start - b.start).slice(0, 3).sort((a, b) => a.start - b.start);
  let html = '';
  let cursor = 0;
  for (const { start, end, entry } of selected) {
    const trailing = text.slice(end).match(/^(?:['’]s)?[),.;:!?\"'’”]*/)?.[0] || '';
    html += esc(text.slice(cursor, start));
    html += '<span class="glossary-unit"><button type="button" class="glossary-term" data-action="word" data-term-id="' + esc(entry.id) + '" aria-controls="word-popover" aria-expanded="false">' + esc(text.slice(start, end)) + '</button>' + esc(trailing) + '</span>';
    cursor = end + trailing.length;
  }
  return html + esc(text.slice(cursor));
}

function closeWordPopover() {
  activeWordButton?.setAttribute('aria-expanded', 'false');
  activeWordButton?.removeAttribute('aria-describedby');
  activeWordButton = null;
  wordPopoverPinned = false;
  const popover = document.getElementById('word-popover');
  if (popover) popover.hidden = true;
}

function positionWordPopover(button, popover) {
  const width = Math.min(306, window.innerWidth - 32);
  popover.style.width = width + 'px';
  if (window.innerWidth <= 600) {
    popover.style.left = Math.round((window.innerWidth - width) / 2) + 'px';
    const navTop = document.querySelector('.reader-nav')?.getBoundingClientRect().top ?? window.innerHeight - 80;
    popover.style.top = Math.max(12, navTop - popover.offsetHeight - 12) + 'px';
  } else {
    const anchor = button.getBoundingClientRect();
    const left = Math.max(16, Math.min(anchor.left + anchor.width / 2 - width / 2, window.innerWidth - width - 16));
    let top = anchor.top - popover.offsetHeight - 10;
    if (top < 12) top = anchor.bottom + 10;
    top = Math.max(12, Math.min(top, window.innerHeight - popover.offsetHeight - 12));
    popover.style.left = Math.round(left) + 'px';
    popover.style.top = Math.round(top) + 'px';
  }
}

function showWordPopover(button, pinned = false) {
  const entry = glossaryEntries.get(button.dataset.termId);
  const popover = document.getElementById('word-popover');
  if (!entry || !popover) return;
  closeWordPopover();
  activeWordButton = button;
  wordPopoverPinned = pinned;
  button.setAttribute('aria-expanded', 'true');
  button.setAttribute('aria-describedby', 'word-popover');
  popover.innerHTML = '<strong>' + esc(entry.term) + '</strong><p>' + esc(entry.meaning) + '</p>';
  popover.hidden = false;
  positionWordPopover(button, popover);
}

function handleWordScroll() {
  if (!activeWordButton) return;
  const rect = activeWordButton.getBoundingClientRect();
  if (!activeWordButton.isConnected || rect.bottom < 0 || rect.top > window.innerHeight) closeWordPopover();
  else positionWordPopover(activeWordButton, document.getElementById('word-popover'));
}

function handleWordPointerOver(event) {
  if (event.pointerType !== 'mouse' || wordPopoverPinned) return;
  const button = event.target.closest?.('.glossary-term');
  if (button && button !== activeWordButton) showWordPopover(button);
}

function handleWordPointerOut(event) {
  if (event.pointerType !== 'mouse' || wordPopoverPinned) return;
  if (event.target.closest?.('.glossary-term') === activeWordButton) closeWordPopover();
}

function handleWordFocusIn(event) {
  const button = event.target.closest?.('.glossary-term');
  if (button) showWordPopover(button);
}

function handleWordFocusOut(event) {
  if (event.target === activeWordButton) closeWordPopover();
}

function renderShell() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="layout">
      <a class="site-return" href="../">← Playground</a>
      <main class="reader-main" id="reader-main" tabindex="-1"></main>
      <div class="study-scrim" data-action="toggle-study"></div>
      <aside class="study-rail" id="study-rail" aria-label="Original page"></aside>
    </div>
    <div class="word-popover" id="word-popover" role="tooltip" hidden></div>
    <div class="sr-only" id="verse-announcer" aria-live="polite" aria-atomic="true"></div>
    <div id="modal-root"></div>
    <div id="toast" role="status" aria-live="polite"></div>
  `;
  app.addEventListener('click', handleClick);
  app.addEventListener('input', handleInput);
  app.addEventListener('change', handleChange);
  app.addEventListener('pointerover', handleWordPointerOver);
  app.addEventListener('pointerout', handleWordPointerOut);
  app.addEventListener('focusin', handleWordFocusIn);
  app.addEventListener('focusout', handleWordFocusOut);
  document.addEventListener('keydown', handleKeys);
  document.addEventListener('pointerdown', event => { if (!event.target.closest?.('.glossary-term')) closeWordPopover(); });
  window.addEventListener('popstate', () => applyRoute(parseRoute(), false));
  window.addEventListener('scroll', handleReaderScroll, { passive: true });
  window.addEventListener('scroll', handleWordScroll, { passive: true });
  window.addEventListener('wheel', closeWordPopover, { passive: true });
  window.addEventListener('touchmove', closeWordPopover, { passive: true });
  window.addEventListener('resize', () => { closeWordPopover(); if (state.view === 'reader') collectVersePositions(); });
  setAppearance();
}

function pageToolbar() {
  return `<nav class="page-toolbar" aria-label="Page navigation">
    <button class="page-back" data-action="resume">${icon('arrowLeft', 17)}<span>Reading</span></button>
    <div class="page-toolbar-actions">${quickActions()}</div>
  </nav>`;
}

function syncStudyA11y() {
  const study = document.getElementById('study-rail');
  if (study) {
    const closed = !state.studyOpen;
    study.inert = closed;
    study.setAttribute('aria-hidden', String(closed));
  }
  const main = document.getElementById('reader-main');
  if (main) main.inert = state.studyOpen;
  const siteReturn = document.querySelector('.site-return');
  if (siteReturn) siteReturn.inert = state.studyOpen;
}

function renderReader() {
  closeWordPopover();
  const verse = currentVerse();
  const main = document.getElementById('reader-main');
  document.body.classList.add('reader-mode');
  main.innerHTML = `<div class="continuous-reader">
    ${state.book.chapters.map(ch => `<section class="chapter-section" id="book-${ch.number}" aria-label="Book ${ch.number}">
      <header class="chapter-heading"><h2>Book ${ch.number}</h2><div class="column-titles"><span>Winthrop Sargeant's translation</span><span>Plain english</span></div></header>
      ${ch.verses.map(item => {
        const ref = `${ch.number}:${item.verse}`;
        return `<article class="verse-row ${ref === state.selected ? 'active' : ''}" id="v-${ch.number}-${item.verse}" data-ref="${ref}" tabindex="-1" aria-label="Book ${ch.number}, ${item.verse === 0 ? 'opening stanza' : `verse ${item.verse}`}">
          <div class="verse-meta">
            <span class="verse-number" aria-hidden="true">${item.verse === 0 ? '·' : item.verse}</span>
            <div class="verse-tools">
              <button class="verse-source" data-action="study" data-ref="${ref}" aria-label="Open original page for verse ${ch.number}.${item.verse}" title="Original page">${icon('book', 17)}</button>
              <button class="verse-save ${state.bookmarks.has(ref) ? 'saved' : ''}" data-action="bookmark" data-ref="${ref}" aria-label="${state.bookmarks.has(ref) ? 'Remove bookmark' : 'Bookmark verse'} ${ch.number}.${item.verse}" title="${state.bookmarks.has(ref) ? 'Remove bookmark' : 'Save passage'}">${icon(state.bookmarks.has(ref) ? 'bookmarkFilled' : 'bookmark', 16)}</button>
            </div>
          </div>
          <div class="verse-pair">
            <section class="reading-block primary-reading" aria-label="Winthrop Sargeant translation"><div class="verse-translation">${esc(item.translation)}</div></section>
            <section class="reading-block plain-reading" aria-label="Plain english reading"><span class="mobile-reading-label">Plain english</span><div class="plain-text">${renderGlossaryText(item.accessible || item.translation)}</div></section>
          </div>
        </article>`;
      }).join('')}
    </section>`).join('')}
  </div>
  <nav class="reader-nav" aria-label="Reading navigation">
    <div class="location-controls">
      <label class="location-select book-select-wrap"><span class="sr-only">Book</span><select id="book-select" aria-label="Book">${state.book.chapters.map(ch => `<option value="${ch.number}" ${ch.number === verse.chapter ? 'selected' : ''}>Book ${ch.number}</option>`).join('')}</select>${icon('chevronDown', 15)}</label>
      <label class="location-select verse-select-wrap"><span class="sr-only">Verse</span><select id="verse-select" data-chapter="${verse.chapter}" aria-label="Verse">${chapterFor(verse.chapter).verses.map(item => `<option value="${chapterVerseKey(verse.chapter, item.verse)}" ${chapterVerseKey(verse.chapter, item.verse) === state.selected ? 'selected' : ''}>${item.verse === 0 ? 'Opening' : `Verse ${item.verse}`}</option>`).join('')}</select>${icon('chevronDown', 15)}</label>
    </div>
    <div class="toolbar-actions">${quickActions()}</div>
  </nav>`;
}

function renderStudy() {
  const rail = document.getElementById('study-rail');
  if (state.view !== 'reader') {
    rail.innerHTML = '';
    document.body.classList.remove('study-open');
    syncStudyA11y();
    return;
  }
  const verse = currentVerse();
  const page = sourcePage(verse);
  const printedNotes = Array.isArray(verse.notes) ? verse.notes : [];
  rail.innerHTML = `<div class="study-inner">
    <div class="study-head"><span>${verse.verse === 0 ? `Book ${ROMAN[verse.chapter - 1]} · Opening` : `${verse.chapter}.${verse.verse}`}</span><button class="icon-button study-close" data-action="toggle-study" aria-label="Close original page">${icon('x', 18)}</button></div>
    <section class="study-section source-section"><button class="page-thumb" data-action="facsimile" data-ref="${verseKey(verse)}" aria-label="Enlarge original printed page ${printedPage(page)}"><img src="${imagePageLink(page)}" loading="lazy" alt="Original printed page ${printedPage(page)}" /></button><div class="source-links"><span>p. ${printedPage(page)}</span><a href="${imagePageLink(page)}" target="_blank" rel="noopener">Open image ${icon('external', 14)}</a></div></section>
    ${printedNotes.length ? `<section class="printed-note" aria-label="Note"><h3>Note</h3>${printedNotes.map(note => `<p>${esc(note)}</p>`).join('')}</section>` : ''}
  </div>`;
  document.body.classList.toggle('study-open', state.studyOpen);
  syncStudyA11y();
}

function updateLocation(announce = true) {
  if (state.view === 'reader') {
    const verse = currentVerse();
    document.title = `${verseLabel(verse)} · The Bhagavad Gītā`;
    if (announce) document.getElementById('verse-announcer').textContent = `Book ${ROMAN[verse.chapter - 1]}, ${verse.verse === 0 ? 'opening' : `verse ${verse.verse}`}`;
  } else {
    document.title = 'The Bhagavad Gītā · Winthrop Sargeant';
    document.getElementById('verse-announcer').textContent = '';
  }
}

let versePositions = [];
let scrollFrame = 0;
let ignoreScrollUntil = 0;

function collectVersePositions() {
  versePositions = [...document.querySelectorAll('.verse-row')].map(row => ({ ref: row.dataset.ref, top: row.getBoundingClientRect().top + window.scrollY }));
}

function syncReaderToolbar() {
  const verse = currentVerse();
  const bookSelect = document.getElementById('book-select');
  const verseSelect = document.getElementById('verse-select');
  if (!bookSelect || !verseSelect) return;
  bookSelect.value = String(verse.chapter);
  if (verseSelect.dataset.chapter !== String(verse.chapter)) {
    verseSelect.innerHTML = chapterFor(verse.chapter).verses.map(item => `<option value="${chapterVerseKey(verse.chapter, item.verse)}">${item.verse === 0 ? 'Opening' : `Verse ${item.verse}`}</option>`).join('');
    verseSelect.dataset.chapter = String(verse.chapter);
  }
  verseSelect.value = state.selected;
  document.querySelector('.verse-row.active')?.classList.remove('active');
  document.getElementById(`v-${verse.chapter}-${verse.verse}`)?.classList.add('active');
}

function handleReaderScroll() {
  if (state.view !== 'reader' || state.modal || state.studyOpen || performance.now() < ignoreScrollUntil || scrollFrame) return;
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0;
    if (state.view !== 'reader' || !versePositions.length) return;
    const probe = window.scrollY + Math.min(window.innerHeight * .22, 180);
    let low = 0, high = versePositions.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (versePositions[mid].top <= probe) low = mid;
      else high = mid - 1;
    }
    const ref = versePositions[low].ref;
    if (ref === state.selected) return;
    const verse = state.verses.find(item => verseKey(item) === ref);
    state.selected = ref;
    state.lastRead = ref;
    save();
    syncReaderToolbar();
    updateLocation(false);
    setRoute(`/read/${verse.chapter}/${verse.verse}`, false);
  });
}

function selectVerse(ref, options = {}) {
  const verse = state.verses.find(v => verseKey(v) === ref);
  if (!verse) return;
  const entering = state.view !== 'reader' || !document.querySelector('.continuous-reader');
  state.view = 'reader';
  state.selected = ref;
  state.lastRead = ref;
  state.studyOpen = false;
  save();
  if (entering) renderReader();
  else syncReaderToolbar();
  renderStudy();
  updateLocation();
  setRoute(`/read/${verse.chapter}/${verse.verse}`, options.push !== false);
  ignoreScrollUntil = performance.now() + 220;
  const first = chapterFor(verse.chapter).verses[0];
  const target = chapterVerseKey(verse.chapter, first.verse) === ref ? document.getElementById(`book-${verse.chapter}`) : document.getElementById(`v-${verse.chapter}-${verse.verse}`);
  if (options.scroll !== false) target?.scrollIntoView({ block: 'start', behavior: 'instant' });
  if (options.focus) document.getElementById(`v-${verse.chapter}-${verse.verse}`)?.focus({ preventScroll: true });
  if (entering) {
    collectVersePositions();
    if (options.scroll !== false) document.fonts?.ready.then(() => {
      if (state.view === 'reader' && state.selected === ref) {
        target?.scrollIntoView({ block: 'start', behavior: 'instant' });
        collectVersePositions();
      }
    });
  }
  syncStudyA11y();
}

function moveVerse(delta, options = {}) {
  const index = state.verses.findIndex(v => verseKey(v) === state.selected);
  const next = state.verses[index + delta];
  if (next) selectVerse(verseKey(next), { push: options.push ?? true, focus: options.focus ?? false });
}

function renderIntroductions(push = true) {
  state.studyOpen = false;
  state.view = 'introductions';
  document.body.classList.remove('reader-mode');
  const sections = (state.frontmatter?.sections || []).filter(section => (section.paragraphs?.length || section.entries?.length || section.groups?.length));
  const sectionGroup = (title, edition) => {
    const items = sections.filter(section => section.edition === edition);
    return items.length ? `<section class="intro-group"><h2>${title}</h2>${items.map(section => `<button class="intro-card" data-essay="${esc(section.id)}"><strong>${esc(section.title)}</strong>${section.author ? `<span>${esc(section.author)}</span>` : ''}${icon('arrowRight', 18)}</button>`).join('')}</section>` : '';
  };
  document.getElementById('reader-main').innerHTML = `${pageToolbar()}
    <div class="prose-header"><h1>Introduction</h1></div>
    <div class="intro-list">${sectionGroup('Anniversary edition', 'anniversary')}${sectionGroup('Original edition', 'original')}</div>`;
  renderStudy(); updateLocation();
  setRoute('/introductions', push); window.scrollTo({ top: 0, behavior: 'instant' });
}

function frontmatterBody(section) {
  const headings = new Map((section.headings || []).map(heading => [heading.beforeParagraph, heading.title]));
  const quotes = new Set((section.quotations || []).map(quote => quote.paragraphIndex));
  const alphabet = section.alphabet || [];
  const paragraphs = (section.paragraphs || []).map((paragraph, index) => {
    const heading = headings.has(index) ? `<h2>${esc(headings.get(index))}</h2>` : '';
    const tag = quotes.has(index) ? 'blockquote' : 'p';
    const letterTable = index === section.alphabetAfterParagraph && alphabet.length ? `<div class="reference-table-wrap"><table class="reference-table alphabet-table"><thead><tr><th>Script</th><th>Sound</th><th>Pronunciation</th></tr></thead><tbody>${alphabet.map(entry => `<tr><td class="devanagari">${esc(entry.script)}</td><td>${esc(entry.roman)}</td><td>${esc(entry.pronunciation)}</td></tr>`).join('')}</tbody></table></div>` : '';
    return `${heading}<${tag}>${esc(paragraph)}</${tag}>${letterTable}`;
  }).join('');
  const trailingAlphabet = alphabet.length && section.alphabetAfterParagraph >= (section.paragraphs || []).length ? `<div class="reference-table-wrap"><table class="reference-table alphabet-table"><thead><tr><th>Script</th><th>Sound</th><th>Pronunciation</th></tr></thead><tbody>${alphabet.map(entry => `<tr><td class="devanagari">${esc(entry.script)}</td><td>${esc(entry.roman)}</td><td>${esc(entry.pronunciation)}</td></tr>`).join('')}</tbody></table></div>` : '';
  const entries = section.entries?.length ? `<div class="reference-grid">${section.entries.map(entry => `<div><strong>${esc(entry.term)}</strong><span>${esc(entry.definition)}</span></div>`).join('')}</div>` : '';
  const groups = (section.groups || []).map(group => `<h2>${esc(group.title)}</h2><div class="reference-grid">${group.entries.map(entry => `<div><strong>${esc(entry.term)}</strong><span>${esc(entry.definition)}</span></div>`).join('')}</div>`).join('');
  const footnotes = (section.footnotes || []).map(note => `<p class="essay-footnote">${esc(note)}</p>`).join('');
  return paragraphs + trailingAlphabet + entries + groups + footnotes;
}

function renderEssay(id, push = true) {
  const section = state.frontmatter?.sections?.find(item => item.id === id);
  if (!section) return renderIntroductions(push);
  state.studyOpen = false;
  state.view = 'essay'; state.essay = id;
  document.body.classList.remove('reader-mode');
  document.getElementById('reader-main').innerHTML = `${pageToolbar()}<div class="essay-content">
    <button class="back-link" data-action="introductions">${icon('arrowLeft', 16)} All introductions</button>
    <div class="eyebrow">${section.edition === 'anniversary' ? 'Anniversary edition' : 'Original edition'}</div>
    <h1>${esc(section.title)}</h1>
    ${section.author ? `<div class="essay-byline">${esc(section.author)}</div>` : ''}
    <div class="essay-body">${frontmatterBody(section)}</div>
    <div class="essay-footer"><button data-action="introductions">All introductions ${icon('arrowRight', 16)}</button></div>
  </div>`;
  renderStudy(); updateLocation();
  setRoute(`/essay/${id}`, push); window.scrollTo({ top: 0, behavior: 'instant' });
}

function renderBookmarks(push = true) {
  state.studyOpen = false;
  state.view = 'bookmarks';
  document.body.classList.remove('reader-mode');
  const gathered = state.verses.filter(verse => state.bookmarks.has(verseKey(verse)) || state.notes[verseKey(verse)]?.trim());
  document.getElementById('reader-main').innerHTML = `${pageToolbar()}<div class="prose-header"><h1>Saved passages</h1>${gathered.length ? '' : '<p>Bookmark a passage to find it here.</p>'}</div>
    <div class="saved-list">${gathered.map(verse => {
      const text = verse.translation;
      return `<button class="saved-card" data-ref="${verseKey(verse)}" data-action="go-verse"><small>${verse.verse === 0 ? `Book ${ROMAN[verse.chapter - 1]} · Opening` : `${verse.chapter}.${verse.verse}`}</small><span>${esc(text).slice(0, 240)}${text.length > 240 ? '…' : ''}</span>${state.notes[verseKey(verse)]?.trim() ? `<em>${esc(state.notes[verseKey(verse)].trim()).slice(0, 180)}</em>` : ''}${icon('arrowRight', 18)}</button>`;
    }).join('')}</div>
    ${gathered.length ? `<button class="export-notes" data-action="export-notes">${icon('download', 18)} Export saved passages</button>` : ''}`;
  renderStudy(); updateLocation();
  setRoute('/bookmarks', push); window.scrollTo({ top: 0, behavior: 'instant' });
}

function applyRoute(route, push = false) {
  if (route.view === 'reader') {
    const ref = state.verses.some(v => verseKey(v) === route.ref) ? route.ref : '1:1';
    selectVerse(ref, { push });
  } else if (route.view === 'essay') renderEssay(route.id, push);
  else if (route.view === 'bookmarks') renderBookmarks(push);
  else renderIntroductions(push);
}

function openModal(html, className = '', label = 'Dialog') {
  closeWordPopover();
  if (!state.modal) state.modalReturnFocus = document.activeElement;
  state.modal = className || 'modal';
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-backdrop" data-action="close-modal"><div class="modal ${className}" role="dialog" aria-modal="true" aria-label="${esc(label)}">${html}</div></div>`;
  document.body.classList.add('modal-open');
  document.querySelector('.layout').inert = true;
  root.querySelector('input,button')?.focus();
}

function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
  document.body.classList.remove('modal-open');
  state.modal = null;
  document.querySelector('.layout').inert = false;
  syncStudyA11y();
  if (state.modalReturnFocus?.isConnected && !state.modalReturnFocus.closest('[inert]')) state.modalReturnFocus.focus();
  else [...document.querySelectorAll('[data-action="search"]')].find(control => control.getClientRects().length)?.focus();
  state.modalReturnFocus = null;
}

function openSearch() {
  openModal(`<div class="search-box-head">${icon('search', 22)}<input id="search-input" type="search" placeholder="Search the book…" autocomplete="off" aria-label="Search all verses" value="${esc(state.searchQuery)}"/><button class="icon-button" data-action="close-modal" aria-label="Close search">${icon('x', 19)}</button></div><div id="search-results" class="search-results"></div>`, 'search-modal', 'Search the book');
  const input = document.getElementById('search-input');
  input.focus(); input.select(); renderSearchResults();
}

function searchSnippet(text, query) {
  const normalized = normalize(text);
  const index = normalized.indexOf(normalize(query));
  const start = Math.max(0, index - 72);
  const end = Math.min(text.length, Math.max(index + query.length + 105, 190));
  const slice = text.slice(start, end).replace(/\s+/g, ' ');
  return `${start ? '…' : ''}${esc(slice)}${end < text.length ? '…' : ''}`;
}

function renderSearchResults() {
  const box = document.getElementById('search-results');
  if (!box) return;
  const query = state.searchQuery.trim();
  if (!query) { box.innerHTML = ''; return; }
  const results = state.verses.filter(v => normalize(`${v.translation} ${v.accessible || ''}`).includes(normalize(query)));
  box.innerHTML = `<div class="result-count">${results.length} ${results.length === 1 ? 'result' : 'results'}</div>${results.slice(0, 80).map(v => {
    const readings = [v.translation, v.accessible || v.translation];
    const match = readings.find(reading => normalize(reading).includes(normalize(query))) || readings[0];
    return `<button class="search-result" data-action="go-verse" data-ref="${verseKey(v)}"><span>${v.verse === 0 ? `Book ${ROMAN[v.chapter - 1]} · Opening` : `${v.chapter}.${v.verse}`}</span><p>${searchSnippet(match, query)}</p>${icon('arrowRight', 17)}</button>`;
  }).join('')}${results.length > 80 ? `<div class="result-count result-more">First 80 shown. Refine the search to see more.</div>` : ''}`;
}

function openSettings() {
  openModal(`<div class="settings-head"><h2>Display</h2><button class="icon-button" data-action="close-modal" aria-label="Close settings">${icon('x', 18)}</button></div>
    <div class="setting-row"><strong>Text size</strong><div class="size-control"><button data-action="font-down" aria-label="Decrease text size">${icon('minus', 17)}</button><span>${Math.round(state.fontSize * 100)}%</span><button data-action="font-up" aria-label="Increase text size">${icon('plus', 17)}</button></div></div>
    <div class="setting-row"><label for="font-family-select">Reading font</label><select id="font-family-select" aria-label="Reading font"><option value="lexend" ${state.readingFont === 'lexend' ? 'selected' : ''}>Lexend</option><option value="system" ${state.readingFont === 'system' ? 'selected' : ''}>System</option><option value="opendyslexic" ${state.readingFont === 'opendyslexic' ? 'selected' : ''}>Dyslexic</option></select></div>
    <div class="setting-row"><label for="theme-select">Theme</label><select id="theme-select" aria-label="Theme">${SITE_THEMES.map(theme => `<option value="${theme}" ${state.theme === theme ? 'selected' : ''}>${theme[0].toUpperCase() + theme.slice(1)}</option>`).join('')}</select></div>`, 'settings-modal', 'Display settings');
}

function openFacsimile(ref) {
  const verse = state.verses.find(v => verseKey(v) === ref);
  if (!verse) return;
  const page = sourcePage(verse);
  openModal(`<div class="facsimile-bar"><div><small>Printed p. ${printedPage(page)}</small><strong>${verse.verse === 0 ? `Book ${ROMAN[verse.chapter - 1]} · Opening` : `${verse.chapter}.${verse.verse}`}</strong></div><div class="facsimile-actions"><button data-action="zoom-out" aria-label="Zoom out">${icon('minus', 18)}</button><span id="zoom-level">100%</span><button data-action="zoom-in" aria-label="Zoom in">${icon('plus', 18)}</button><a href="${imagePageLink(page)}" target="_blank" rel="noopener" aria-label="Open page image">${icon('external', 18)}</a><button data-action="close-modal" aria-label="Close page">${icon('x', 20)}</button></div></div><div class="facsimile-scroll"><img id="facsimile-image" src="${imagePageLink(page)}" alt="Original printed page ${printedPage(page)}" /></div>`, 'facsimile-modal', `Original page for ${verseLabel(verse)}`);
  state.zoom = 1;
}

function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2300);
}

function exportNotes() {
  const lines = ['# The Bhagavad Gītā — saved passages', '', 'Winthrop Sargeant translation', ''];
  const saved = state.verses.filter(v => state.bookmarks.has(verseKey(v)) || state.notes[verseKey(v)]);
  for (const verse of saved) {
    lines.push(`## Book ${ROMAN[verse.chapter - 1]}, ${verse.verse === 0 ? 'opening stanza' : `verse ${verse.verse}`}`, '', 'Translation:', verse.translation, '', 'Accessible:', verse.accessible || verse.translation, '');
    if (state.notes[verseKey(verse)]) lines.push(`Note: ${state.notes[verseKey(verse)]}`, '');
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob); link.download = 'gita-saved-passages.md'; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function handleClick(event) {
  const target = event.target.closest('[data-action], [data-essay]');
  if (!target) return;
  if (target.classList.contains('modal-backdrop') && event.target.closest('.modal')) return;
  const action = target.dataset.action;
  if (action !== 'word') closeWordPopover();
  if (target.dataset.essay) { renderEssay(target.dataset.essay); return; }
  const ref = target.dataset.ref;
  switch (action) {
    case 'resume': selectVerse(state.lastRead, { focus: true }); break;
    case 'toggle-study': {
      state.studyOpen = !state.studyOpen;
      document.body.classList.toggle('study-open', state.studyOpen);
      syncStudyA11y();
      if (state.studyOpen) document.querySelector('.study-close')?.focus();
      else (state.studyReturnFocus?.isConnected ? state.studyReturnFocus : document.querySelector(`.verse-source[data-ref="${state.selected}"]`))?.focus();
      break;
    }
    case 'search':
      state.studyOpen = false;
      document.body.classList.remove('study-open');
      syncStudyA11y(); openSearch(); break;
    case 'settings': openSettings(); break;
    case 'introductions': renderIntroductions(); break;
    case 'bookmarks': renderBookmarks(); break;
    case 'go-verse': if (state.modal) closeModal(); selectVerse(ref, { focus: true }); break;
    case 'study':
      selectVerse(ref, { push: false, scroll: false });
      state.studyReturnFocus = target; state.studyOpen = true;
      renderStudy(); document.querySelector('.study-close')?.focus();
      break;
    case 'word':
      if (wordPopoverPinned && activeWordButton === target) closeWordPopover();
      else showWordPopover(target, true);
      break;
    case 'bookmark': {
      if (state.bookmarks.has(ref)) state.bookmarks.delete(ref); else state.bookmarks.add(ref);
      save();
      const saved = state.bookmarks.has(ref);
      target.innerHTML = icon(saved ? 'bookmarkFilled' : 'bookmark', 16);
      target.classList.toggle('saved', saved);
      target.setAttribute('aria-label', `${saved ? 'Remove bookmark' : 'Bookmark verse'} ${ref.replace(':', '.')}`);
      target.title = saved ? 'Remove bookmark' : 'Save passage';
      toast(state.bookmarks.has(ref) ? 'Verse saved' : 'Bookmark removed');
      break;
    }
    case 'facsimile': openFacsimile(ref); break;
    case 'close-modal': closeModal(); break;
    case 'font-up': case 'font-down': {
      state.fontSize = Math.max(0.7, Math.min(2.5, Math.round((state.fontSize + (action === 'font-up' ? 0.05 : -0.05)) * 100) / 100));
      setAppearance();
      if (state.view === 'reader') requestAnimationFrame(collectVersePositions);
      document.querySelector('.size-control span').textContent = `${Math.round(state.fontSize * 100)}%`;
      break;
    }
    case 'zoom-in': case 'zoom-out': {
      state.zoom = Math.max(0.7, Math.min(2.5, state.zoom + (action === 'zoom-in' ? 0.25 : -0.25)));
      const baseWidth = window.innerWidth <= 740 ? window.innerWidth - 28 : 820;
      document.getElementById('facsimile-image').style.width = `${Math.round(baseWidth * state.zoom)}px`;
      document.getElementById('zoom-level').textContent = `${Math.round(state.zoom * 100)}%`;
      break;
    }
    case 'export-notes': exportNotes(); break;
    default: break;
  }
}

function handleInput(event) {
  if (event.target.id === 'search-input') { state.searchQuery = event.target.value; renderSearchResults(); }
}

function handleChange(event) {
  if (event.target.id === 'book-select') {
    const chapter = chapterFor(Number(event.target.value));
    if (chapter) selectVerse(chapterVerseKey(chapter.number, chapter.verses[0].verse));
    document.getElementById('book-select')?.focus({ preventScroll: true });
  } else if (event.target.id === 'verse-select') {
    selectVerse(event.target.value);
    document.getElementById('verse-select')?.focus({ preventScroll: true });
  } else if (event.target.id === 'font-family-select' && SITE_FONTS[event.target.value]) {
    state.readingFont = event.target.value;
    setAppearance();
    if (state.view === 'reader') requestAnimationFrame(collectVersePositions);
  } else if (event.target.id === 'theme-select' && SITE_THEMES.includes(event.target.value)) {
    state.theme = event.target.value;
    setAppearance();
  }
}

function handleKeys(event) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); return; }
  if (event.key === 'Escape') {
    if (state.modal) closeModal();
    else if (state.studyOpen) {
      state.studyOpen = false;
      document.body.classList.remove('study-open');
      syncStudyA11y();
      (state.studyReturnFocus?.isConnected ? state.studyReturnFocus : document.querySelector(`.verse-source[data-ref="${state.selected}"]`))?.focus();
    }
    else if (activeWordButton) closeWordPopover();
    return;
  }
  if (state.modal && event.key === 'Tab') {
    const controls = [...document.querySelectorAll('.modal button, .modal input, .modal textarea, .modal a[href]')].filter(el => !el.disabled && el.getClientRects().length);
    if (!controls.length) { event.preventDefault(); return; }
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    return;
  }
  const drawer = state.studyOpen ? document.getElementById('study-rail') : null;
  if (drawer && event.key === 'Tab') {
    const controls = [...drawer.querySelectorAll('button, a[href], textarea')].filter(el => !el.disabled && el.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (!drawer.contains(document.activeElement)) { event.preventDefault(); first?.focus(); }
    else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    return;
  }
  const focus = document.activeElement;
  if (state.modal || state.studyOpen || state.view !== 'reader' || event.altKey || event.ctrlKey || event.metaKey || focus?.closest('button, a, input, textarea, select, [contenteditable="true"], .study-rail')) return;
  const key = event.key.toLowerCase();
  const direction = ['j', 'arrowright'].includes(key) ? 1 : ['k', 'arrowleft'].includes(key) ? -1 : 0;
  if (!direction) return;
  event.preventDefault();
  moveVerse(direction, { focus: true });
}

async function init() {
  const app = document.getElementById('app');
  app.innerHTML = `<div class="loading-screen"><strong>The Bhagavad Gītā</strong><span>Opening the book…</span></div>`;
  try {
    const [bookResponse, frontResponse, conceptsResponse] = await Promise.all([fetch('./data/gita.json?v=25'), fetch('./data/frontmatter.json'), fetch('./data/concepts.json')]);
    if (!bookResponse.ok) throw new Error(`Could not load the translation (${bookResponse.status})`);
    state.book = await bookResponse.json();
    state.frontmatter = frontResponse.ok ? await frontResponse.json() : { sections: [] };
    state.concepts = conceptsResponse.ok ? (await conceptsResponse.json()).entries : [];
    buildInlineGlossary();
    state.verses = state.book.chapters.flatMap(ch => ch.verses.map(verse => ({ ...verse, chapter: ch.number })));
    if (!state.verses.length) throw new Error('The translation has no verses.');
    renderShell();
    const route = parseRoute();
    if (!location.hash && !stored.lastRead && route.view === 'reader') selectVerse(route.ref, { push: false, scroll: false });
    else applyRoute(route, false);
  } catch (error) {
    app.innerHTML = `<div class="load-error"><h1>The book could not open</h1><p>${esc(error.message)}</p><p>Please reload the page.</p></div>`;
    console.error(error);
  }
}

init();
