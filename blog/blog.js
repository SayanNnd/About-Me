/* =========================================================================
   blog.js
   Helpers for blog pages:
   - "On this page" TOC generator with smooth scroll and active section sync.
   - Reading progress indicator in footer.
   - Back to top smooth scroll.
   ========================================================================= */
(() => {
  'use strict';

  const screen = document.querySelector('.screen');
  if (!screen) return;

  /* ---------- 1. "On this page" Table of Contents ---------- */
  const tocList = document.getElementById('toc-list');
  const headings = Array.from(document.querySelectorAll('.post h2[id]'));

  if (tocList && headings.length) {
    headings.forEach((h) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = '#' + h.id;
      a.textContent = h.textContent;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        // scrollIntoView() scrolls the *viewport*, but our scrollable container
        // is .screen — so we compute the heading's offset relative to .screen.
        const headingTop = h.getBoundingClientRect().top;
        const screenTop  = screen.getBoundingClientRect().top;
        const offset     = headingTop - screenTop + screen.scrollTop - 16; // 16px breathing room
        screen.scrollTo({ top: offset, behavior: 'smooth' });
        try { history.replaceState(null, '', '#' + h.id); } catch (_) {}
      });
      li.appendChild(a);
      tocList.appendChild(li);
    });
  }

  const tocLinks = tocList ? tocList.querySelectorAll('a') : [];

  // Update TOC active state on scroll
  function updateToc() {
    if (!headings.length) return;
    const screenTop = screen.getBoundingClientRect().top;
    const atBottom  = screen.scrollHeight - screen.scrollTop - screen.clientHeight < 60;

    let current = headings[0];
    if (atBottom) {
      current = headings[headings.length - 1];
    } else {
      // A heading is "active" when it has scrolled past the top 1/3 of the screen.
      const threshold = screenTop + screen.clientHeight * 0.33;
      headings.forEach((h) => {
        if (h.getBoundingClientRect().top < threshold) current = h;
      });
    }

    tocLinks.forEach((a) => {
      if (a.getAttribute('href') === '#' + current.id) {
        a.setAttribute('aria-current', 'true');
      } else {
        a.removeAttribute('aria-current');
      }
    });
  }

  /* ---------- 2. Reading progress in footer ---------- */
  const fill = document.getElementById('progress-fill');
  const label = document.getElementById('progress-label');

  function updateProgress() {
    if (!fill) return;
    const max = screen.scrollHeight - screen.clientHeight;
    const pct = max > 0 ? Math.round((screen.scrollTop / max) * 100) : 100;
    fill.style.width = pct + '%';
    if (label) label.textContent = pct + '%';
  }

  function onScroll() {
    updateProgress();
    updateToc();
  }

  screen.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  /* ---------- 3. Back to top button ---------- */
  const topBtn = document.getElementById('to-top');
  if (topBtn) {
    topBtn.addEventListener('click', () => {
      screen.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
})();
