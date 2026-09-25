/**
 * makeSearchable(select, opts)
 * Turns a native <select> into a type-to-search combobox.
 * The original <select> stays in the DOM (hidden) and remains the source of truth,
 * so existing code that reads/sets select.value or listens for 'change' keeps working.
 * Matches every typed word anywhere in the option text (name or email, any order).
 */
(function () {
  function injectStyles() {
    if (document.getElementById('ss-styles')) return;
    const s = document.createElement('style');
    s.id = 'ss-styles';
    s.textContent = `
      .ss-wrap { position: relative; }
      .ss-input { width: 100%; padding-right: 2rem; }
      .ss-clear { position: absolute; right: .5rem; top: 50%; transform: translateY(-50%);
        border: 0; background: none; cursor: pointer; font-size: 1.1rem; line-height: 1;
        color: var(--color-text-muted, #888); padding: .25rem; display: none; }
      .ss-wrap.has-value .ss-clear { display: block; }
      .ss-list { position: absolute; left: 0; right: 0; top: calc(100% + 2px); z-index: 1000;
        max-height: 320px; overflow-y: auto; margin: 0; padding: 4px 0; list-style: none;
        background: var(--color-bg-card, #fff); border: 1px solid var(--color-border, #ccc);
        border-radius: 6px; box-shadow: 0 6px 20px rgba(0,0,0,.12); display: none; }
      .ss-wrap.open .ss-list { display: block; }
      .ss-item { padding: .45rem .75rem; cursor: pointer; font-size: .95rem; }
      .ss-item.active { background: var(--color-primary, #3b5a1e); color: var(--color-text-inverse, #fff); }
      .ss-item mark { background: transparent; color: inherit; font-weight: 700; }
      .ss-empty { padding: .5rem .75rem; color: var(--color-text-muted, #888); font-size: .9rem; }
    `;
    document.head.appendChild(s);
  }

  function esc(t) { return t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  window.makeSearchable = function (select, opts = {}) {
    if (!select || select.dataset.ssEnhanced) return;
    select.dataset.ssEnhanced = '1';
    injectStyles();
    const placeholder = opts.placeholder || 'Type to search...';
    const maxResults = opts.maxResults || 200;

    const wrap = document.createElement('div');
    wrap.className = 'ss-wrap';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-input ss-input';
    input.placeholder = placeholder;
    input.autocomplete = 'off';
    input.setAttribute('role', 'combobox');
    const clear = document.createElement('button');
    clear.type = 'button'; clear.className = 'ss-clear'; clear.title = 'Clear'; clear.innerHTML = '&times;';
    const list = document.createElement('ul');
    list.className = 'ss-list';
    wrap.append(input, clear, list);
    select.parentNode.insertBefore(wrap, select);
    select.style.display = 'none';
    select.removeAttribute('required'); // hidden selects can't show native validation; code validates itself

    let matches = [], active = -1;

    const options = () => Array.from(select.options).filter(o => o.value !== '');
    const selectedText = () => {
      const o = select.options[select.selectedIndex];
      return o && o.value !== '' ? o.textContent : '';
    };
    function syncInput() {
      input.value = selectedText();
      wrap.classList.toggle('has-value', !!select.value);
    }

    function render(query) {
      const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
      matches = options().filter(o => {
        const t = o.textContent.toLowerCase();
        return words.every(w => t.includes(w));
      }).slice(0, maxResults);
      active = matches.length ? 0 : -1;
      if (!matches.length) {
        list.innerHTML = '<li class="ss-empty">No matches</li>';
        return;
      }
      const re = words.length ? new RegExp('(' + words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi') : null;
      list.innerHTML = matches.map((o, i) => {
        let html = esc(o.textContent);
        if (re) html = html.replace(re, '<mark>$1</mark>');
        return `<li class="ss-item${i === active ? ' active' : ''}" data-i="${i}">${html}</li>`;
      }).join('');
    }
    function setActive(i) {
      const items = list.querySelectorAll('.ss-item');
      if (!items.length) return;
      active = (i + items.length) % items.length;
      items.forEach((el, n) => el.classList.toggle('active', n === active));
      items[active].scrollIntoView({ block: 'nearest' });
    }
    function open(query) { render(query); wrap.classList.add('open'); }
    function close() { wrap.classList.remove('open'); syncInput(); }
    function choose(o) {
      const changed = select.value !== o.value;
      select.value = o.value;
      close();
      if (changed) select.dispatchEvent(new Event('change', { bubbles: true }));
    }

    input.addEventListener('focus', () => { input.select(); open(''); });
    input.addEventListener('input', () => open(input.value));
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (!wrap.classList.contains('open')) open(''); else setActive(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
      else if (e.key === 'Enter') { if (wrap.classList.contains('open')) { e.preventDefault(); if (matches[active]) choose(matches[active]); } }
      else if (e.key === 'Escape') { close(); input.blur(); }
      else if (e.key === 'Tab') { close(); }
    });
    list.addEventListener('mousedown', e => {
      e.preventDefault(); // keep focus so blur doesn't fire first
      const li = e.target.closest('.ss-item');
      if (li) choose(matches[+li.dataset.i]);
    });
    input.addEventListener('blur', () => setTimeout(close, 100));
    clear.addEventListener('click', () => {
      select.value = '';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      syncInput();
      input.focus();
    });

    // Keep the visible input in sync when code sets select.value programmatically
    const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    Object.defineProperty(select, 'value', {
      get() { return desc.get.call(this); },
      set(v) { desc.set.call(this, v); syncInput(); },
      configurable: true
    });
    select.addEventListener('change', syncInput);
    // Options are loaded async / added later (e.g. "+ Add New Customer")
    new MutationObserver(syncInput).observe(select, { childList: true });

    syncInput();
  };
})();
