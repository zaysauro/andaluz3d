// Conteúdo das abas Planta, Ambientes e Ficha & relatórios

const area = (poly, S) => { let a = 0; for (let i = 0; i < poly.length; i++) { const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length]; a += x1 * y2 - x2 * y1; } return Math.abs(a / 2) / (S * S); };
const fmt = n => n.toFixed(2).replace('.', ',');

export function renderPages(plan) {
  const S = plan.pxPerMeter;
  const ROOMS = [
    ['dorm1', 'Dormitório 01', [[540, 140], [1004, 140], [1004, 775], [540, 775]]],
    ['dorm2', 'Dormitório 02', [[1022, 140], [1430, 140], [1430, 588], [1022, 588]]],
    ['banho', 'Banheiro (com box)', [[540, 793], [1004, 793], [1004, 1015], [786, 1015], [786, 1004], [690, 1004], [690, 958], [540, 958]]],
    ['sala', 'Sala estar/jantar + cozinha + A. serv.', [[1022, 605], [1448, 605], [1448, 330], [1858, 330], [1858, 1062], [1125, 1062], [1125, 1015], [1022, 1015]]],
    ['varanda', 'Varanda', [[1530, 218], [1858, 218], [1858, 312], [1448, 312], [1448, 218], [1530, 218], [1530, 140], [1858, 140], [1858, 218]]],
  ];
  // varanda: retângulo 1530–1858 × 140–312 + nicho 1448–1530 × 218–312
  const A = {};
  for (const [id, , poly] of ROOMS) A[id] = id === 'varanda' ? (328 * 172 + 82 * 94) / (S * S) : area(poly, S);
  window.__areas = { dorm1: `${fmt(A.dorm1)} m²`, dorm2: `${fmt(A.dorm2)} m²`, banho: `${fmt(A.banho)} m²`, varanda: `${fmt(A.varanda)} m²` };
  const totalInt = Object.values(A).reduce((a, b) => a + b, 0);

  /* ---------------- Planta */
  const svg = document.getElementById('plansvg');
  const r2 = (r, cls) => `<rect class="${cls}" x="${r[0] - 500}" y="${r[1] - 100}" width="${r[2] - r[0]}" height="${r[3] - r[1]}"/>`;
  const draw = (v) => {
    const img = { A: 'refs/planta-30.jpg', B: 'refs/planta-31.jpg', C: 'refs/planta-32.jpg' }[v];
    let g = '';
    plan.walls.forEach(w => g += r2(w, 'w')); g += r2(plan.shaftBalcony, 'w');
    plan.windows.forEach(w => g += r2(w.r, 'j'));
    plan.doors.forEach(d => g += r2(d.r, 'p'));
    if (v !== 'C') { plan.balconyDivider.forEach(w => g += r2(w, 'w')); g += r2(plan.balconyDoor, 'j'); g += r2(plan.balconyEdge, 'gc'); }
    else g += r2([1530, 122, 1858, 140], 'j');
    svg.innerHTML = `<style>.w{fill:rgba(220,30,30,.55);stroke:#c00;stroke-width:1}.j{fill:rgba(0,120,255,.55)}.p{fill:rgba(0,190,60,.55)}.gc{fill:rgba(255,160,0,.55)}</style>
      <image href="${img}" x="0" y="0" width="1400" height="1000"/><g id="ovg" style="opacity:${document.getElementById('ovOp').value}">${g}</g>`;
    document.querySelectorAll('#segVarPlan button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  };
  document.querySelectorAll('#segVarPlan button').forEach(b => b.onclick = () => draw(b.dataset.v));
  document.getElementById('ovOp').oninput = e => { const g = document.getElementById('ovg'); if (g) g.style.opacity = e.target.value; };
  draw('A');
  document.getElementById('areaTbl').innerHTML = `<tr><th>Ambiente</th><th>Área interna est.</th></tr>` +
    ROOMS.map(([id, n]) => `<tr><td>${n}</td><td>${fmt(A[id])} m²</td></tr>`).join('') +
    `<tr><td><b>Soma interna</b></td><td><b>${fmt(totalInt)} m²</b></td></tr>
     <tr><td>Envelope externo (7,13 × 5,04 m)</td><td>${fmt((1354 * 958 - 246 * 58) / (S * S))} m²</td></tr>
     <tr><td>Área privativa declarada</td><td>34,60 m² <span class="tag v">book</span></td></tr>`;

  /* ---------------- Ambientes (galeria) */
  const PAIRS = [
    ['sala', 'Sala de estar / jantar', 'r-sala.jpg', 'Sala de estar · book p. 23'],
    ['sala-c', 'Sala com varanda e churrasqueira', 'r-sala-varanda-churrasqueira.jpg', 'Sala de estar com varanda e churrasqueira · book p. 22'],
    ['varanda', 'Varanda com churrasqueira', 'r-varanda-churrasqueira.jpg', 'Varanda com churrasqueira · book p. 24'],
    ['cozinha', 'Cozinha', 'r-cozinha.jpg', 'Cozinha · book p. 26'],
    ['dorm1', 'Dormitório casal', 'r-dorm-casal.jpg', 'Dormitório casal · book p. 27'],
    ['dorm2', 'Dormitório solteiro', 'r-dorm-solteiro.jpg', 'Dormitório solteiro · book p. 28'],
    ['banho', 'Banheiro', 'r-banheiro.jpg', 'Banheiro · book p. 29'],
    ['maquete', 'Vista maquete', 'planta-30.jpg', 'Planta humanizada · book p. 30'],
  ];
  document.getElementById('gal').innerHTML = `
    <div class="hero"><img src="shots/sala.jpg" alt="Sala de estar reconstruída em 3D"><div><b>2 dormitórios no Prado Velho</b></div></div>
    <p class="lead">Cada ambiente reconstruído em 3D (direita) ao lado da imagem ilustrativa do book que serviu de referência (esquerda). As imagens 3D são capturas do próprio tour, renderizadas em tempo real no navegador.</p>
    ${PAIRS.map(([id, t, ref, cap]) => `<h3>${t}</h3><div class="pair">
      <figure><img src="refs/${ref}" alt="${cap}" loading="lazy"><figcaption>${cap}</figcaption></figure>
      <figure><img src="shots/${id}.jpg" alt="${t} — tour 3D" loading="lazy"><figcaption>Tour 3D · reconstrução</figcaption></figure></div>`).join('')}
    <h3>Áreas comuns (imagens do book)</h3>
    <p class="lead">O book traz apenas imagens ilustrativas das áreas comuns e a implantação em escala reduzida, sem plantas detalhadas. Por isso elas não foram reconstruídas em 3D: reconstruí-las exigiria inventar a arquitetura.</p>
    <div class="amen">${['r-fachada.jpg', 'r-portico.jpg', 'r-praca-chegada.jpg'].map(f => `<img src="refs/${f}" alt="" loading="lazy">`).join('')}</div>`;
  const lb = document.getElementById('lb');
  document.getElementById('gal').addEventListener('click', e => { if (e.target.tagName === 'IMG') { lb.querySelector('img').src = e.target.src; lb.style.display = 'grid'; } });
  lb.onclick = () => lb.style.display = 'none';

}
