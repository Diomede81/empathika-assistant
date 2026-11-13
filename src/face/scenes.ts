/**
 * Backgrounds for the screen behind the 3D nurse: simple, soft illustrations drawn as SVG (a few
 * kilobytes each, sharp at any size, and no work for the box: a still picture under the 3D head).
 * Each is a 720 x 720 picture for the round screen, with its interest around the edges: the
 * middle is behind her face, the top carries the weather and the bottom the clock.
 */
const wrap = (body: string): string => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 720" preserveAspectRatio="xMidYMid slice">${body}</svg>`;

const flower = (x: number, y: number, r: number, petal: string, heart = '#f6c945'): string =>
  [0, 72, 144, 216, 288].map((a) => `<ellipse cx="${x}" cy="${y - r}" rx="${r * 0.55}" ry="${r}" fill="${petal}" transform="rotate(${a} ${x} ${y})"/>`).join('') + `<circle cx="${x}" cy="${y}" r="${r * 0.45}" fill="${heart}"/>`;

const cloud = (x: number, y: number, s: number, fill = '#ffffff', o = 0.9): string =>
  `<g fill="${fill}" opacity="${o}"><ellipse cx="${x}" cy="${y}" rx="${60 * s}" ry="${22 * s}"/><ellipse cx="${x - 28 * s}" cy="${y - 14 * s}" rx="${30 * s}" ry="${22 * s}"/><ellipse cx="${x + 18 * s}" cy="${y - 20 * s}" rx="${36 * s}" ry="${26 * s}"/></g>`;

const stars = (n: number, seed: number): string => {
  let out = '';
  let v = seed;
  const rnd = () => ((v = (v * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < n; i++) out += `<circle cx="${Math.round(rnd() * 720)}" cy="${Math.round(rnd() * 470)}" r="${(0.8 + rnd() * 1.8).toFixed(1)}" fill="#fff" opacity="${(0.4 + rnd() * 0.6).toFixed(2)}"/>`;
  return out;
};

export const SCENES: Record<string, { label: string; svg: string }> = {
  garden: {
    label: 'Garden: blue sky, green hills and flowers',
    svg: wrap(
      '<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8ecbf2"/><stop offset="0.7" stop-color="#d9f0fb"/></linearGradient></defs>' +
        '<rect width="720" height="720" fill="url(#s)"/>' +
        cloud(150, 150, 1.1) + cloud(560, 110, 0.9) + cloud(610, 250, 0.6, '#fff', 0.7) +
        '<path d="M0 470 Q180 380 360 450 T720 430 V720 H0Z" fill="#9bd08a"/>' +
        '<path d="M0 540 Q200 470 420 530 T720 510 V720 H0Z" fill="#7cbf6c"/>' +
        '<path d="M0 610 Q240 560 480 600 T720 590 V720 H0Z" fill="#5ea956"/>' +
        flower(70, 560, 20, '#f48fb1') + flower(150, 620, 16, '#fff59d', '#f39c12') + flower(40, 660, 15, '#ce93d8') +
        flower(650, 560, 20, '#fff') + flower(590, 630, 17, '#f48fb1') + flower(690, 650, 14, '#fff59d', '#f39c12') +
        flower(230, 680, 14, '#fff') + flower(500, 690, 15, '#ce93d8'),
    ),
  },
  seaside: {
    label: 'Seaside: sea, sand and a sunny sky',
    svg: wrap(
      '<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fc4ee"/><stop offset="1" stop-color="#e6f5fc"/></linearGradient>' +
        '<linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f8fc4"/><stop offset="1" stop-color="#63c1d8"/></linearGradient></defs>' +
        '<rect width="720" height="720" fill="url(#s)"/>' +
        '<circle cx="590" cy="130" r="56" fill="#ffe082"/><circle cx="590" cy="130" r="82" fill="#ffe082" opacity="0.3"/>' +
        cloud(140, 170, 1) + cloud(330, 100, 0.7, '#fff', 0.8) +
        '<rect y="400" width="720" height="190" fill="url(#w)"/>' +
        '<path d="M0 430 q45 -12 90 0 t90 0 t90 0 t90 0 t90 0 t90 0 t90 0 t90 0" stroke="#fff" stroke-width="4" fill="none" opacity="0.6"/>' +
        '<path d="M0 480 q45 -12 90 0 t90 0 t90 0 t90 0 t90 0 t90 0 t90 0 t90 0" stroke="#fff" stroke-width="4" fill="none" opacity="0.45"/>' +
        '<path d="M0 575 Q180 545 360 570 T720 560 V720 H0Z" fill="#f3dfa9"/>' +
        '<path d="M0 640 Q240 610 480 640 T720 630 V720 H0Z" fill="#e9cf8f"/>' +
        '<path d="M88 400 l34 -62 v62Z" fill="#fff"/><path d="M122 338 l30 62 h-30Z" fill="#f48fb1"/><path d="M70 404 h100 l-14 16 h-72Z" fill="#8d5a3b"/>' +
        '<g transform="translate(620 610)"><path d="M0 0 L-46 -70" stroke="#8d5a3b" stroke-width="5"/><path d="M-110 -62 a70 70 0 0 1 128 -14Z" fill="#ef5350"/><path d="M-78 -76 a70 70 0 0 1 62 -8 l-16 26Z" fill="#fff"/></g>',
    ),
  },
  sunset: {
    label: 'Sunset: warm evening sky over the hills',
    svg: wrap(
      '<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d3a78"/><stop offset="0.45" stop-color="#c7658b"/><stop offset="0.75" stop-color="#f6a45c"/><stop offset="1" stop-color="#fbd58a"/></linearGradient></defs>' +
        '<rect width="720" height="720" fill="url(#s)"/>' +
        '<circle cx="360" cy="520" r="120" fill="#ffe7a8" opacity="0.9"/><circle cx="360" cy="520" r="170" fill="#ffe7a8" opacity="0.25"/>' +
        cloud(130, 210, 1.1, '#f7b6c2', 0.7) + cloud(570, 160, 1, '#f7b6c2', 0.6) + cloud(600, 300, 0.7, '#fbd0a8', 0.6) +
        '<path d="M0 520 Q170 430 340 510 T720 480 V720 H0Z" fill="#6a4a7c"/>' +
        '<path d="M0 590 Q220 520 440 590 T720 570 V720 H0Z" fill="#4b3564"/>' +
        '<path d="M0 650 Q260 610 520 650 T720 640 V720 H0Z" fill="#33254a"/>',
    ),
  },
  blossom: {
    label: 'Blossom: soft pink spring branches',
    svg: wrap(
      '<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbe4ee"/><stop offset="1" stop-color="#e6effa"/></linearGradient></defs>' +
        '<rect width="720" height="720" fill="url(#s)"/>' +
        '<path d="M-10 90 C140 110 220 60 330 100 M150 98 C190 150 250 170 300 220 M-10 620 C120 600 210 650 300 690" stroke="#8a6252" stroke-width="12" fill="none" stroke-linecap="round"/>' +
        '<path d="M730 150 C600 150 520 90 420 120 M560 136 C540 200 480 230 450 290 M730 640 C640 610 560 650 470 700" stroke="#8a6252" stroke-width="12" fill="none" stroke-linecap="round"/>' +
        flower(60, 100, 22, '#f8bbd0', '#f06292') + flower(160, 80, 18, '#fce4ec', '#f06292') + flower(250, 110, 20, '#f8bbd0', '#f06292') + flower(210, 170, 17, '#fce4ec', '#f06292') + flower(300, 222, 16, '#f8bbd0', '#f06292') +
        flower(660, 150, 22, '#fce4ec', '#f06292') + flower(560, 120, 19, '#f8bbd0', '#f06292') + flower(470, 130, 17, '#fce4ec', '#f06292') + flower(520, 215, 18, '#f8bbd0', '#f06292') + flower(452, 290, 15, '#fce4ec', '#f06292') +
        flower(70, 612, 20, '#f8bbd0', '#f06292') + flower(190, 640, 18, '#fce4ec', '#f06292') + flower(650, 622, 20, '#fce4ec', '#f06292') + flower(540, 660, 18, '#f8bbd0', '#f06292') +
        [[110, 300], [620, 380], [90, 470], [640, 500], [200, 420], [560, 440]].map(([x, y], i) => `<ellipse cx="${x}" cy="${y}" rx="9" ry="5" fill="#f8bbd0" opacity="0.8" transform="rotate(${i * 40} ${x} ${y})"/>`).join(''),
    ),
  },
  cosy: {
    label: 'Cosy room: warm wallpaper and a window',
    svg: wrap(
      '<rect width="720" height="720" fill="#f3dcc0"/>' +
        Array.from({ length: 13 }, (_, i) => `<rect x="${i * 60}" width="30" height="560" fill="#edd0ad"/>`).join('') +
        '<rect y="560" width="720" height="22" fill="#b98a63"/><rect y="582" width="720" height="138" fill="#c79b74"/>' +
        '<g transform="translate(40 90)"><rect width="190" height="250" rx="10" fill="#8a5a3c"/><rect x="14" y="14" width="162" height="222" fill="#bfe3f7"/>' +
        '<path d="M14 190 Q70 150 110 180 T176 170 V236 H14Z" fill="#8fc97f"/><circle cx="140" cy="60" r="20" fill="#ffe082"/>' +
        '<rect x="90" y="14" width="10" height="222" fill="#8a5a3c"/><rect x="14" y="120" width="162" height="10" fill="#8a5a3c"/></g>' +
        '<g transform="translate(520 110)"><rect width="150" height="120" rx="6" fill="#8a5a3c"/><rect x="10" y="10" width="130" height="100" fill="#fdf3e3"/>' + flower(75, 62, 20, '#f48fb1') + '</g>' +
        '<g transform="translate(590 440)"><rect x="-8" y="60" width="16" height="64" fill="#8a5a3c"/><path d="M-50 60 h100 l-22 -70 h-56Z" fill="#f6c36b"/><ellipse cx="0" cy="124" rx="40" ry="8" fill="#8a5a3c"/></g>' +
        '<g transform="translate(110 470)"><path d="M-34 90 h68 l-10 -60 h-48Z" fill="#c2674a"/><path d="M0 30 C-40 -10 -50 -50 -20 -70 C0 -40 0 -10 0 30 M0 30 C40 -10 56 -40 30 -76 C8 -44 2 -12 0 30 M0 30 C-6 -30 -2 -70 4 -96 C16 -60 10 -20 0 30" fill="#5ea956"/></g>',
    ),
  },
  night: {
    label: 'Night sky: stars and a crescent moon',
    svg: wrap(
      '<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#101638"/><stop offset="1" stop-color="#2c2f6b"/></linearGradient></defs>' +
        '<rect width="720" height="720" fill="url(#s)"/>' + stars(70, 7) +
        '<circle cx="560" cy="150" r="52" fill="#fdf3c4"/><circle cx="582" cy="136" r="48" fill="#161b44"/>' +
        '<path d="M0 560 Q180 480 360 550 T720 530 V720 H0Z" fill="#1c2152"/>' +
        '<path d="M0 630 Q240 580 480 630 T720 610 V720 H0Z" fill="#141840"/>',
    ),
  },
};

export type SceneName = keyof typeof SCENES;
