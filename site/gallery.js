// "Meet the koi": every variety drawn live by the shader, hovering in place.
// One canvas sits behind the whole grid (one WebGL context instead of 24); each
// koi is placed on its card and only moves its body, tail and fins.
(function () {
  const grid = document.getElementById('koi-grid');
  if (!grid || !window.KoiPond) return;

  // [name, Japanese name, description, variety id, pattern seed, long fins]
  // Seeds pick a good-looking pattern; for single-colour koi they pick the colour.
  const KOI = [
    ['Kohaku', '紅白', 'Red patterns on white, the classic koi', 0, 0.71],
    ['Taisho Sanke', '大正三色', 'Kohaku with small black spots', 0, 0.78],
    ['Showa', '昭和三色', 'Black body with red and white', 1, 0.44],
    ['Tancho', '丹頂', 'White with a single red crown', 4, 0.31],
    ['Shiro Utsuri', '白写り', 'Black with bold white bands', 5, 0.33],
    ['Hi Utsuri', '緋写り', 'Black with fiery red bands', 6, 0.47],
    ['Ki Utsuri', '黄写り', 'Black with yellow bands', 7, 0.29],
    ['Shiro Bekko', '白鼈甲', 'White with small black spots', 8, 0.62],
    ['Ai Goromo', '藍衣', 'Red scales edged in indigo', 9, 0.45],
    ['Goshiki', '五色', 'A dark net over red and white', 10, 0.44],
    ['Asagi', '浅黄', 'Blue-grey net, red-orange sides', 2, 0.52],
    ['Shusui', '秋翠', 'Scaleless, a row of big blue scales', 11, 0.5],
    ['Kumonryu', '九紋竜', 'Scaleless black and white swirls', 12, 0.27],
    ['Ochiba Shigure', '落葉時雨', 'Grey with bronze, like autumn leaves', 13, 0.83],
    ['Kujaku', '孔雀', 'Metallic white, dark net, orange', 14, 0.15],
    ['Hariwake', '張分け', 'Metallic platinum with gold', 15, 0.66],
    ['Yamabuki Ogon', '山吹黄金', 'Metallic gold all over', 3, 0.01],
    ['Platinum Ogon', 'プラチナ黄金', 'Metallic white all over', 3, 0.025],
    ['Orenji Ogon', 'オレンジ黄金', 'Metallic orange all over', 3, 0.035],
    ['Kigoi', '黄鯉', 'Lemon yellow, no shine', 3, 0.048],
    ['Chagoi', '茶鯉', 'Tea brown, the friendliest koi', 3, 0.058],
    ['Benigoi', '紅鯉', 'Deep red all over', 3, 0.068],
    ['Soragoi', '空鯉', 'Plain sky grey', 16, 0.2],
    ['Butterfly koi', '鰭長錦鯉', 'Long, flowing fins and tail', 0, 0.71, true],
  ];

  grid.innerHTML = KOI.map(([name, jp, desc]) =>
    `<li class="koi-card"><span class="jp" lang="ja">${jp}</span><h3>${name}</h3><p>${desc}</p></li>`).join('');
  const cards = [...grid.children];

  const pageBg = () =>
    getComputedStyle(document.documentElement).getPropertyValue('--paper').trim() || '#eff5fd';

  const gallery = KoiPond.create({
    target: grid,
    count: KOI.length,
    still: true,
    interactive: false,
    colors: 'ink',
    background: pageBg(),
    pixelSize: 1.5,
    seed: 11,
  });
  window.koiGallery = gallery;

  // Put each koi on its card: head up, centred in the space above the label.
  function layout() {
    const g = grid.getBoundingClientRect();
    gallery.fishes.forEach((f, i) => {
      const [, , , variety, seed, long] = KOI[i];
      const c = cards[i].getBoundingClientRect();
      const label = cards[i].querySelector('.jp').getBoundingClientRect();
      const top = c.top - g.top + 14;
      const room = label.top - c.top - 22; // height available above the label
      const L = Math.max(20, Math.min(room / (long ? 1.62 : 1.36), c.width * 0.95));
      const x = c.left - g.left + c.width / 2;
      const y = top + Math.max(0, (room - L * (long ? 1.62 : 1.36)) / 2);
      const n = (f.spine.length >> 1) - 1;
      f.variety = variety;
      f.seed = seed;
      f.longFin = !!long;
      f.pinned = true;
      f.depth = 0;
      f.length = L;
      f.segLen = L / n;
      f.angle = -Math.PI / 2;
      f.amp = 0.55;
      f.speed = 0;
      f.burst = 0;
      f.turn = 0;
      if (f._placed !== true) {
        f.phase = i * 0.9; // not all in step
        f._placed = true;
      }
      for (let k = 0; k <= n; k++) {
        f.spine[k * 2] = x;
        f.spine[k * 2 + 1] = y + f.segLen * k;
      }
    });
  }
  layout();
  // Re-place after the canvas has been resized (the pond moves fish on resize).
  new ResizeObserver(() => requestAnimationFrame(layout)).observe(grid);

  // Style toggle.
  const toggles = document.querySelectorAll('[data-gallery]');
  toggles.forEach((b) =>
    b.addEventListener('click', () => {
      gallery.set({ colors: b.dataset.gallery });
      toggles.forEach((o) => o.setAttribute('aria-checked', String(o === b)));
    }),
  );

  // Follow the page's background picker.
  new MutationObserver(() => gallery.set({ background: pageBg() })).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['style', 'class'],
  });
})();
