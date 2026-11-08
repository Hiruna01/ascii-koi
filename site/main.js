// Showcase page: the pond itself is the page background.
(function () {
  const pond = KoiPond.create({ count: 10 });
  window.koiPond = pond;

  // --- Dock controls
  const pauseBtn = document.querySelector('[data-action="pause"]');
  const pauseIcon = pauseBtn.innerHTML;
  const playIcon = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z"/></svg>';
  pauseBtn.addEventListener('click', () => {
    if (pond.paused) {
      pond.resume();
      pauseBtn.innerHTML = pauseIcon;
      pauseBtn.setAttribute('aria-label', 'Pause');
    } else {
      pond.pause();
      pauseBtn.innerHTML = playIcon;
      pauseBtn.setAttribute('aria-label', 'Play');
    }
  });

  document.querySelector('[data-action="reset"]').addEventListener('click', () => {
    pond.set({ fishSize: 'auto', count: 0 });
    pond.set({ count: +document.querySelector('[data-opt="count"]').value });
  });

  const modeButtons = document.querySelectorAll('[data-mode]');
  modeButtons.forEach((b) =>
    b.addEventListener('click', () => {
      pond.set({ mode: b.dataset.mode });
      modeButtons.forEach((o) => o.setAttribute('aria-checked', String(o === b)));
    }),
  );

  document.querySelectorAll('[data-opt]').forEach((input) =>
    input.addEventListener('input', () => pond.set({ [input.dataset.opt]: +input.value })),
  );

  // --- Install tabs
  const tabs = document.querySelectorAll('[role="tab"]');
  tabs.forEach((tab) =>
    tab.addEventListener('click', () => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
      });
    }),
  );

  // --- Copy buttons
  document.querySelectorAll('.copy').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const text = btn.nextElementSibling.textContent;
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = 'Copied';
      } catch {
        btn.textContent = 'Press Ctrl+C';
        const range = document.createRange();
        range.selectNodeContents(btn.nextElementSibling);
        const sel = getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
      setTimeout(() => (btn.textContent = 'Copy'), 1600);
    }),
  );

  // --- Little 8x8 Bayer matrix illustration in "How it works"
  const grid = document.querySelector('.bayer');
  if (grid) {
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const xy = x ^ y;
        const v = ((xy & 1) << 5) | ((y & 1) << 4) | ((xy & 2) << 2) | ((y & 2) << 1) | ((xy & 4) >> 1) | ((y & 4) >> 2);
        const cell = document.createElement('span');
        cell.style.opacity = (0.08 + (v / 63) * 0.92).toFixed(2);
        grid.appendChild(cell);
      }
    }
  }
})();
