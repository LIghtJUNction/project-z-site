(() => {
  'use strict';
  const root = document.documentElement;
  root.classList.add('js');
  const actionStatus = document.getElementById('action-status');
  const themeButton = document.querySelector('.theme-toggle');
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  const normalize = (value) => String(value || '').normalize('NFKC').toLowerCase();

  function syncTheme() {
    const light = root.dataset.theme === 'light';
    const label = light ? '切换深色主题' : '切换浅色主题';
    if (themeButton) {
      themeButton.setAttribute('aria-label', label);
      themeButton.title = label;
    }
    if (themeMeta) themeMeta.content = light ? '#faf8f4' : '#141210';
  }
  if (themeButton) {
    themeButton.hidden = false;
    themeButton.addEventListener('click', () => {
      const next = root.dataset.theme === 'light' ? 'dark' : 'light';
      root.dataset.theme = next;
      try { localStorage.setItem('project-z-docs-theme', next); } catch (error) {}
      syncTheme();
    });
  }
  syncTheme();

  document.querySelectorAll('.copy-button[data-copy]').forEach((button) => {
    button.hidden = false;
    const originalLabel = button.textContent || '复制';
    let reset;
    button.addEventListener('click', async () => {
      const block = document.getElementById(button.dataset.copy);
      if (!block) return;
      const code = block.querySelector('code') || block;
      try {
        if (!navigator.clipboard) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(code.textContent);
        button.textContent = '已复制';
        button.dataset.state = 'copied';
        if (actionStatus) actionStatus.textContent = '代码已复制。';
        clearTimeout(reset);
        reset = setTimeout(() => { button.textContent = originalLabel; delete button.dataset.state; }, 1800);
      } catch (error) {
        const selection = window.getSelection();
        if (selection) {
          const range = document.createRange();
          range.selectNodeContents(code);
          selection.removeAllRanges();
          selection.addRange(range);
        }
        if (actionStatus) actionStatus.textContent = '代码已选中，请使用浏览器的复制命令。';
      }
    });
  });

  const headings = Array.from(document.querySelectorAll('.prose h2[id], .prose h3[id]'));
  const tocLinks = Array.from(document.querySelectorAll('.toc-list a[href^="#"]'));
  if (headings.length) {
    let scheduled = false;
    const updateOutline = () => {
      scheduled = false;
      let active = headings[0];
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top <= 150) active = heading;
        else break;
      }
      tocLinks.forEach((link) => {
        let id;
        try { id = decodeURIComponent(link.hash.slice(1)); } catch (error) { id = link.hash.slice(1); }
        if (id === active.id) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    };
    const scheduleOutline = () => {
      if (!scheduled) { scheduled = true; requestAnimationFrame(updateOutline); }
    };
    window.addEventListener('scroll', scheduleOutline, { passive: true });
    window.addEventListener('resize', scheduleOutline, { passive: true });
    updateOutline();
  }

  const mobileNavigation = document.querySelector('.mobile-navigation');
  if (mobileNavigation) {
    mobileNavigation.addEventListener('click', (event) => {
      if (event.target.closest('a[href]')) mobileNavigation.open = false;
    });
  }
  const switchers = Array.from(document.querySelectorAll('.project-switcher'));
  document.addEventListener('click', (event) => {
    switchers.forEach((switcher) => {
      if (!switcher.contains(event.target)) switcher.open = false;
    });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    switchers.forEach((switcher) => {
      if (switcher.open) {
        switcher.open = false;
        if (switcher.contains(document.activeElement)) switcher.querySelector('summary').focus();
      }
    });
  });

  const projectFilter = document.getElementById('project-filter');
  const projectList = document.getElementById('project-list');
  const categoryButtons = Array.from(document.querySelectorAll('.category-filters button[data-category]'));
  if (projectList && (projectFilter || categoryButtons.length)) {
    const projects = Array.from(projectList.querySelectorAll('[data-project]'));
    const count = document.getElementById('project-count');
    const empty = document.getElementById('catalog-empty');
    let category = 'all';
    const filterProjects = () => {
      const terms = normalize(projectFilter ? projectFilter.value.trim() : '').split(/\s+/).filter(Boolean);
      let visible = 0;
      projects.forEach((project) => {
        const text = normalize(project.dataset.search || project.textContent);
        const match = (category === 'all' || project.dataset.category === category) && terms.every((term) => text.includes(term));
        project.hidden = !match;
        if (match) visible += 1;
      });
      if (count) count.textContent = visible + ' 个项目';
      if (empty) empty.hidden = visible !== 0;
    };
    if (projectFilter) projectFilter.addEventListener('input', filterProjects);
    categoryButtons.forEach((button) => {
      button.hidden = false;
      button.addEventListener('click', () => {
        category = button.dataset.category;
        categoryButtons.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
        filterProjects();
      });
    });
    filterProjects();
  }

  const dialog = document.getElementById('search-dialog');
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');
  const searchStatus = document.getElementById('search-status');
  const triggers = Array.from(document.querySelectorAll('[data-search-open]'));
  if (!dialog || !input || !results || !searchStatus || typeof dialog.showModal !== 'function') return;
  const base = new URL(document.body.dataset.root || './', document.baseURI);
  const shortcut = /mac|iphone|ipad/i.test(navigator.platform) ? '⌘ K' : 'Ctrl K';
  document.querySelectorAll('.search-shortcut').forEach((label) => { label.textContent = shortcut; });
  let indexPromise;
  let index;
  let debounce;
  let opener;

  function localURL(value) {
    if (typeof value !== 'string' || !value || /^(?:[a-z][a-z0-9+.-]*:|[\/\\])/i.test(value) || value.includes('\\')) return null;
    try {
      const url = new URL(value, base);
      if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return null;
      return url.href;
    } catch (error) { return null; }
  }
  function loadIndex() {
    if (index) return Promise.resolve(index);
    if (!indexPromise) {
      indexPromise = fetch(new URL('search-index.json', base), { credentials: 'same-origin' })
        .then((response) => {
          if (!response.ok) throw new Error('Search unavailable');
          return response.json();
        })
        .then((data) => {
          if (!Array.isArray(data)) throw new Error('Invalid search index');
          index = data.filter((page) => page && typeof page.title === 'string' && typeof page.project === 'string' && typeof page.body === 'string' && localURL(page.url))
            .map((page) => ({
              title: page.title,
              project: page.project,
              body: page.body,
              url: page.url,
              normalizedTitle: normalize(page.title),
              normalizedProject: normalize(page.project),
              normalizedBody: normalize(page.body)
            }));
          return index;
        }).catch((error) => { indexPromise = null; throw error; });
    }
    return indexPromise;
  }
  function excerpt(page, query) {
    const text = page.body.replace(/\s+/g, ' ');
    const term = query.split(/\s+/)[0];
    const found = term ? normalize(text).indexOf(term) : 0;
    const start = Math.max(0, found - 45);
    return (start ? '…' : '') + text.slice(start, start + 150) + (text.length > start + 150 ? '…' : '');
  }
  function render(pages, query) {
    results.replaceChildren();
    for (const page of pages) {
      const href = localURL(page.url);
      if (!href) continue;
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.className = 'search-result';
      link.href = href;
      const project = document.createElement('span');
      project.className = 'search-result-project';
      project.textContent = page.project;
      const title = document.createElement('span');
      title.className = 'search-result-title';
      title.textContent = page.title;
      const description = document.createElement('span');
      description.className = 'search-result-excerpt';
      description.textContent = excerpt(page, query);
      link.append(project, title, description);
      item.append(link);
      results.append(item);
    }
    if (!query) searchStatus.textContent = '输入项目名、命令或关键词，搜索全部文档。';
    else if (!results.children.length) searchStatus.textContent = '没有找到“' + input.value.trim() + '”。试试项目名或更短的关键词。';
    else searchStatus.textContent = '找到 ' + results.children.length + ' 条相关文档';
  }
  async function search() {
    const query = normalize(input.value.trim());
    try {
      const pages = await loadIndex();
      if (query !== normalize(input.value.trim())) return;
      if (!query) {
        const current = pages.filter((page) => page.project === document.body.dataset.project);
        render(current.length ? current.slice(0, 5) : pages.slice(0, 5), '');
        return;
      }
      const terms = query.split(/\s+/).filter(Boolean);
      const matches = pages.map((page) => {
        let score = page.normalizedProject === query ? 24 : 0;
        for (const term of terms) {
          if (page.normalizedTitle.includes(term)) score += 12;
          else if (page.normalizedProject.includes(term)) score += 9;
          else if (page.normalizedBody.includes(term)) score += 1;
          else return { page, score: 0 };
        }
        return { page, score };
      }).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score);
      render(matches.slice(0, 10).map((entry) => entry.page), query);
    } catch (error) {
      results.replaceChildren();
      searchStatus.textContent = '暂时无法加载搜索。你仍可从项目目录浏览全部文档。';
    }
  }
  function openSearch(trigger) {
    if (dialog.open) return;
    opener = trigger || document.activeElement;
    dialog.showModal();
    input.focus();
    searchStatus.textContent = '正在加载文档…';
    search();
  }
  function closeSearch() { if (dialog.open) dialog.close(); }
  triggers.forEach((trigger) => {
    trigger.hidden = false;
    trigger.addEventListener('click', () => openSearch(trigger));
  });
  document.querySelectorAll('[data-search-close]').forEach((button) => button.addEventListener('click', closeSearch));
  dialog.addEventListener('close', () => {
    clearTimeout(debounce);
    if (opener && typeof opener.focus === 'function') opener.focus();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeSearch();
  });
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    results.replaceChildren();
    searchStatus.textContent = '正在搜索…';
    debounce = setTimeout(search, 100);
  });
  input.addEventListener('keydown', (event) => {
    const first = results.querySelector('a');
    if (event.key === 'ArrowDown' && first) { event.preventDefault(); first.focus(); }
    if (event.key === 'Enter' && first) { event.preventDefault(); first.click(); }
  });
  results.addEventListener('keydown', (event) => {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    const links = Array.from(results.querySelectorAll('a'));
    const current = links.indexOf(document.activeElement);
    if (current < 0) return;
    event.preventDefault();
    const next = current + (event.key === 'ArrowDown' ? 1 : -1);
    if (next < 0) input.focus();
    else if (next < links.length) links[next].focus();
  });
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !event.altKey) {
      event.preventDefault();
      if (dialog.open) closeSearch();
      else openSearch(document.activeElement);
    }
  });
})();
