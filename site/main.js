// Showcase page: the pond itself is the page background.
(function () {
  const pond = KoiPond.create({ count: 10, feeding: true });
  document.querySelectorAll('[data-version]').forEach((el) => (el.textContent = 'v' + KoiPond.VERSION));
  window.koiPond = pond;

  // --- Dock controls
  const pauseBtn = document.querySelector('[data-action="pause"]');
  const pauseIcon = pauseBtn.innerHTML;
  const playIcon = '<svg class="ico" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M232.4,114.49,88.32,26.35a16,16,0,0,0-16.2-.3A15.86,15.86,0,0,0,64,39.87V216.13A15.94,15.94,0,0,0,80,232a16.07,16.07,0,0,0,8.36-2.35L232.4,141.51a15.81,15.81,0,0,0,0-27ZM80,215.94V40l143.83,88Z"/></svg>';
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

  // --- Colours and background. Any background works with either colour mode.
  const root = document.documentElement;
  const PAPER = '#eff5fd';
  const POND = '#0d2a30';
  let colors = 'ink';
  let bgChoice = 'auto';

  function lightness(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function applyLook() {
    const bg = bgChoice === 'auto' ? (colors === 'koi' ? POND : PAPER) : bgChoice;
    pond.set({ colors, background: bgChoice });
    root.style.setProperty('--paper', bg);
    root.classList.toggle('theme-dark', lightness(bg) < 0.45);
    root.classList.toggle('accent-koi', colors === 'koi');
    document.querySelector('meta[name="theme-color"]').content = bg;
    document.querySelectorAll('[data-bg]').forEach((sw) =>
      sw.setAttribute('aria-pressed', String(sw.dataset.bg === bgChoice)),
    );
    customInput.value = bg;
  }

  const colorButtons = document.querySelectorAll('[data-colors]');
  colorButtons.forEach((b) =>
    b.addEventListener('click', () => {
      colors = b.dataset.colors;
      colorButtons.forEach((o) => o.setAttribute('aria-checked', String(o === b)));
      applyLook();
    }),
  );

  // Background picker popover.
  const bgBtn = document.querySelector('[data-action="background"]');
  const picker = document.getElementById('bg-picker');
  const customInput = picker.querySelector('[data-bg-custom]');
  function openPicker(open) {
    picker.hidden = !open;
    bgBtn.setAttribute('aria-expanded', String(open));
    if (open && typeof openTypes === 'function') openTypes(false);
  }
  bgBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openPicker(picker.hidden);
  });
  picker.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => openPicker(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !picker.hidden) {
      e.preventDefault(); // Escape closes the panel only, not fish-only view
      openPicker(false);
      bgBtn.focus();
    }
  });
  picker.querySelectorAll('[data-bg]').forEach((sw) =>
    sw.addEventListener('click', () => {
      bgChoice = sw.dataset.bg;
      applyLook();
    }),
  );
  customInput.addEventListener('input', () => {
    bgChoice = customInput.value;
    applyLook();
  });

  // --- Butterfly koi toggle: about 1 in 4 fish get long, flowing fins.
  const butterflyBtn = document.querySelector('[data-action="butterfly"]');
  butterflyBtn.addEventListener('click', () => {
    const on = butterflyBtn.getAttribute('aria-pressed') !== 'true';
    butterflyBtn.setAttribute('aria-pressed', String(on));
    pond.set({ butterfly: on ? 0.25 : 0 });
  });

  // --- Koi types panel: choose which varieties swim, add single fish.
  const TYPES = [
    ['kohaku', 'Kohaku / Sanke', 'linear-gradient(135deg,#f5f0e6 0 40%,#e5491d 40% 72%,#f5f0e6 72%)'],
    ['showa', 'Showa', 'linear-gradient(135deg,#17171b 0 38%,#e5491d 38% 62%,#f5f0e6 62% 80%,#17171b 80%)'],
    ['tancho', 'Tancho', 'radial-gradient(circle at 50% 32%,#e5491d 0 24%,#f5f0e6 25%)'],
    ['asagi', 'Asagi', 'linear-gradient(135deg,#6b89a3 0 60%,#e5491d 60%)'],
    ['ogon', 'Ogon & solids', 'radial-gradient(circle at 35% 30%,#ffe9a6,#e8a92a 62%)'],
    ['shiro-utsuri', 'Shiro Utsuri', 'linear-gradient(135deg,#17171b 0 52%,#f5f0e6 52%)'],
    ['hi-utsuri', 'Hi Utsuri', 'linear-gradient(135deg,#17171b 0 52%,#e5491d 52%)'],
    ['ki-utsuri', 'Ki Utsuri', 'linear-gradient(135deg,#17171b 0 52%,#f0cf3a 52%)'],
    ['shiro-bekko', 'Shiro Bekko', 'radial-gradient(circle at 32% 62%,#17171b 0 13%,transparent 14%),radial-gradient(circle at 66% 34%,#17171b 0 11%,transparent 12%),#f5f0e6'],
    ['ai-goromo', 'Ai Goromo', 'linear-gradient(135deg,#f5f0e6 0 30%,transparent 30%),repeating-linear-gradient(45deg,#e5491d 0 3px,#2b356f 3px 4px)'],
    ['goshiki', 'Goshiki', 'linear-gradient(135deg,transparent 52%,rgba(229,73,29,.85) 52%),repeating-linear-gradient(45deg,#c9cdd6 0 3px,#2a2e40 3px 4px)'],
    ['shusui', 'Shusui', 'radial-gradient(circle at 50% 50%,#2b4473 0 14%,transparent 15%),linear-gradient(90deg,#e5491d 0 20%,#9cb6cc 20% 80%,#e5491d 80%)'],
    ['kumonryu', 'Kumonryu', 'radial-gradient(circle at 32% 30%,#f5f0e6 0 26%,transparent 27%),radial-gradient(circle at 70% 70%,#f5f0e6 0 18%,transparent 19%),#17171b'],
    ['ochiba', 'Ochiba Shigure', 'linear-gradient(135deg,#a3aab3 0 55%,#9c6a3c 55%)'],
    ['kujaku', 'Kujaku', 'linear-gradient(135deg,transparent 56%,#f28a2c 56%),repeating-linear-gradient(45deg,#eef0f2 0 3px,#2b2f3a 3px 4px)'],
    ['hariwake', 'Hariwake', 'linear-gradient(135deg,#e7e9ec 0 50%,#f0b434 50%)'],
    ['soragoi', 'Soragoi', '#8e98a4'],
  ];
  const PRESETS = {
    all: TYPES.map((t) => t[0]),
    gosanke: ['kohaku', 'showa'],
    metallic: ['ogon', 'kujaku', 'hariwake'],
  };
  const typesBtn = document.querySelector('[data-action="types"]');
  const typesPanel = document.getElementById('types-panel');
  const typesList = typesPanel.querySelector('.tp-list');
  const countInput = document.querySelector('[data-opt="count"]');
  typesList.innerHTML = TYPES.map(([id, name, bg]) =>
    `<li><label class="tp-item"><input type="checkbox" checked data-variety="${id}" />` +
    `<span class="sw" style="background:${bg}"></span><span class="nm">${name}</span></label>` +
    `<button class="tp-add" type="button" data-add="${id}" aria-label="Add one ${name}" title="Add one ${name}">+</button></li>`,
  ).join('');
  const boxes = [...typesList.querySelectorAll('[data-variety]')];
  function applyTypes() {
    const on = boxes.filter((b) => b.checked).map((b) => b.dataset.variety);
    pond.set({ varieties: on.length === boxes.length ? 'all' : on });
  }
  boxes.forEach((box) =>
    box.addEventListener('change', () => {
      if (!boxes.some((b) => b.checked)) box.checked = true; // keep at least one type
      applyTypes();
    }),
  );
  typesPanel.querySelectorAll('[data-preset]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const keep = PRESETS[btn.dataset.preset];
      boxes.forEach((b) => (b.checked = keep.includes(b.dataset.variety)));
      applyTypes();
    }),
  );
  typesList.querySelectorAll('[data-add]').forEach((btn) =>
    btn.addEventListener('click', () => {
      if (pond.fishes.length >= 60) return;
      pond.addFish({ variety: btn.dataset.add });
      countInput.max = Math.max(+countInput.max, pond.fishes.length);
      countInput.value = pond.fishes.length;
    }),
  );
  function openTypes(open) {
    typesPanel.hidden = !open;
    typesBtn.setAttribute('aria-expanded', String(open));
    if (open) openPicker(false);
  }
  typesBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openTypes(typesPanel.hidden);
  });
  typesPanel.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => openTypes(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !typesPanel.hidden) {
      e.preventDefault(); // Escape closes the panel only, not fish-only view
      openTypes(false);
      typesBtn.focus();
    }
  });

  // --- Fish only: hide every page element and leave just the pond. The control
  // bar hides too, and slides up when the pointer reaches the bottom of the
  // screen (or for a few seconds after a tap on touch screens).
  const exitBtn = document.querySelector('[data-action="exit-fish-only"]');
  const dock = document.querySelector('.dock');
  const fishOnlyBtn = document.querySelector('[data-action="fish-only"]');
  const enterIcon = fishOnlyBtn.innerHTML;
  const exitIcon = '<svg class="ico" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M152,96V48a8,8,0,0,1,16,0V88h40a8,8,0,0,1,0,16H160A8,8,0,0,1,152,96ZM96,152H48a8,8,0,0,0,0,16H88v40a8,8,0,0,0,16,0V160A8,8,0,0,0,96,152Zm112,0H160a8,8,0,0,0-8,8v48a8,8,0,0,0,16,0V168h40a8,8,0,0,0,0-16ZM96,40a8,8,0,0,0-8,8V88H48a8,8,0,0,0,0,16H96a8,8,0,0,0,8-8V48A8,8,0,0,0,96,40Z"/></svg>';
  const EDGE = 120; // px from the bottom of the screen that reveal the bar
  let idleTimer = 0;
  let hideTimer = 0;
  const isFishOnly = () => document.documentElement.classList.contains('fish-only');
  const panelOpen = () => !picker.hidden || !typesPanel.hidden;
  function showExit() {
    exitBtn.classList.add('visible');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => exitBtn.classList.remove('visible'), 2000);
  }
  function revealDock(ms) {
    clearTimeout(hideTimer);
    hideTimer = 0;
    dock.classList.add('reveal');
    if (ms) hideTimer = setTimeout(hideDock, ms);
  }
  function hideDock() {
    clearTimeout(hideTimer);
    hideTimer = 0;
    if (panelOpen() || dock.contains(document.activeElement)) return; // still in use
    dock.classList.remove('reveal');
  }
  function onFishOnlyMove(e) {
    if (e.pointerType === 'touch') return;
    showExit();
    const near = e.clientY > innerHeight - EDGE || dock.contains(e.target) || panelOpen();
    if (near) revealDock();
    else if (dock.classList.contains('reveal') && !hideTimer) hideTimer = setTimeout(hideDock, 500);
  }
  function onFishOnlyTap(e) {
    if (e.pointerType !== 'touch') return;
    showExit();
    revealDock(3500);
  }
  function setFishOnly(on) {
    openPicker(false);
    openTypes(false);
    document.documentElement.classList.toggle('fish-only', on);
    fishOnlyBtn.innerHTML = on ? exitIcon : enterIcon;
    fishOnlyBtn.setAttribute('aria-label', on ? 'Show the page again' : 'Show only the fish');
    fishOnlyBtn.title = on ? 'Show the page again (Esc)' : 'Show only the fish (Esc to exit)';
    dock.classList.remove('reveal');
    clearTimeout(hideTimer);
    hideTimer = 0;
    if (on) {
      showExit();
      window.addEventListener('pointermove', onFishOnlyMove, { passive: true });
      window.addEventListener('pointerdown', onFishOnlyTap, { passive: true });
    } else {
      window.removeEventListener('pointermove', onFishOnlyMove);
      window.removeEventListener('pointerdown', onFishOnlyTap);
      exitBtn.classList.remove('visible');
      clearTimeout(idleTimer);
    }
  }
  // Keyboard users: tabbing into the bar shows it.
  dock.addEventListener('focusin', () => { if (isFishOnly()) revealDock(); });
  dock.addEventListener('focusout', () => { if (isFishOnly()) setTimeout(hideDock, 0); });
  fishOnlyBtn.addEventListener('click', () => setFishOnly(!isFishOnly()));
  exitBtn.addEventListener('click', () => setFishOnly(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !e.defaultPrevented && isFishOnly()) setFishOnly(false);
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

  // --- Hero snippet: copies the one-line CDN script tag.
  const snippet = document.querySelector('.snippet');
  if (snippet) {
    const label = snippet.querySelector('.snippet-copy');
    snippet.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(snippet.dataset.copy);
        label.textContent = 'Copied';
      } catch {
        label.textContent = 'See Install';
      }
      setTimeout(() => (label.textContent = 'Copy'), 1600);
    });
  }

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
