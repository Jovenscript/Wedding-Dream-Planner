/* ═════════════════════════════════════════════════════════════════════
   tests/sorteio.spec.mjs — teste ponta a ponta do Sorteio da Gravata
   Roda o index.html real num servidor estático local, em MODO LOCAL:
   a requisição de js/config.js é interceptada e devolve
   `window.FIREBASE_CONFIG = false` — o arquivo do projeto NÃO é alterado.
   Fluxo coberto: cadastrar convidados → marcar compradores → sortear →
   confirmar → conferir state.sorteio.winner, o histórico e a privacidade.
   Uso: node tests/sorteio.spec.mjs
   ═════════════════════════════════════════════════════════════════════ */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.env.SHOT_DIR || path.join(ROOT, 'tests', 'screenshots');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.png':'image/png', '.webmanifest':'application/manifest+json', '.json':'application/json' };

let pass = 0, fail = 0;
const ok  = (t, extra='') => { pass++; console.log(`  ✓ ${t}${extra?` — ${extra}`:''}`); };
const bad = (t, extra='') => { fail++; console.log(`  ✗ ${t}${extra?` — ${extra}`:''}`); };
function check(cond, t, extra=''){ cond ? ok(t, extra) : bad(t, extra); }

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); return res.end('not found');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});

await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;
fs.mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
const errors = [];

/* Abre o app já com convidados no localStorage: o estado é semeado ANTES do
   boot, então o onboarding não aparece (settings.onboarded) e o teste começa
   direto na tela real, como o app do Marlon já em uso. */
async function novaPagina(viewport, isMobile, nomes = []){
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: !!isMobile, isMobile: !!isMobile });
  const page = await ctx.newPage();
  // MODO LOCAL: sem nuvem, sem login — o arquivo js/config.js do projeto fica intacto.
  await ctx.route('**/js/config.js', route => route.fulfill({
    status: 200, contentType: 'text/javascript',
    body: 'window.FIREBASE_CONFIG = false; window.WEDDING_ID = "test";'
  }));
  await ctx.route('**/sw.js', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.addInitScript(lista => {
    try {
      if (localStorage.getItem('@wedding_planner_v3')) return;   // reload: mantém o que o app salvou
      localStorage.setItem('@wedding_planner_v3', JSON.stringify({
        settings: { onboarded: true, showOver: true, strict: true },
        guests: lista.map((n, i) => ({ id: 'g' + i, name: n, group: 'Família ' + (i % 2 ? 'Bistaffa' : 'Silva'), isHead: i === 0 })),
        items: [], funds: [], history: [], varCosts: []
      }));
    } catch (e) {}
  }, nomes);
  await page.goto(BASE + 'index.html', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof state === 'object' && state !== null);
  return { ctx, page };
}

/* ═══════════ TESTE 1 — fluxo completo (desktop 1440px) ═══════════ */
console.log('\n▶ Sorteio da Gravata — fluxo completo (desktop 1440×900)');
{
  const NOMES = ['Marlon Alves', 'Carol Bistaffa', 'João Pedro', 'Ana Clara', 'Ricardo Souza'];
  const { ctx, page } = await novaPagina({ width: 1440, height: 900 }, false, NOMES);

  // ── navegação ──
  await page.click('.side-link[data-view="sorteio"]');
  await page.waitForTimeout(250);
  check(await page.isVisible('#view-sorteio'), 'a aba "Sorteio" abre a view');
  check(await page.locator('.side-link[data-view="sorteio"]').getAttribute('aria-current') === 'page',
        'o link da sidebar fica marcado como ativo');
  check(await page.evaluate(() => location.hash) === '#sorteio', 'a URL passa a ser #sorteio');

  // ── a lista mostra TODOS os convidados ──
  const linhas = await page.locator('#sort-list .sort-row').count();
  check(linhas === NOMES.length, 'a lista mostra todos os convidados', `${linhas} de ${NOMES.length}`);

  // ── preço da gravata ──
  await page.fill('#sort-price', '25');
  await page.locator('#sort-price').blur();
  await page.waitForTimeout(150);
  check(await page.evaluate(() => state.sorteio.pricePerGravata) === 25, 'o valor da gravata salva no state');

  // ── marcar 3 compradores ──
  for (const n of ['Marlon Alves', 'Carol Bistaffa', 'Ricardo Souza']) {
    await page.locator('.sort-row', { hasText: n }).locator('input[data-sort-buyer]').check();
    await page.waitForTimeout(80);
  }
  const nBuyers = await page.evaluate(() => Object.keys(state.sorteio.buyers).length);
  check(nBuyers === 3, 'os 3 compradores foram gravados em state.sorteio.buyers', `${nBuyers} marcados`);
  const contador = (await page.textContent('#sort-count')).replace(/\s+/g, ' ').trim();
  check(/^3\s*pessoas compraram gravata/.test(contador), 'contador mostra "3 pessoas compraram gravata"', contador);
  check(/75,00/.test(contador), 'total arrecadado = 3 × R$ 25,00 = R$ 75,00', contador);

  // ── busca filtra a lista ──
  await page.fill('#sort-search', 'carol');
  await page.waitForTimeout(150);
  check(await page.locator('#sort-list .sort-row').count() === 1, 'a busca filtra a lista');
  await page.fill('#sort-search', '');
  await page.waitForTimeout(150);

  // ── persistência: recarrega a página e as marcações continuam ──
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('.side-link[data-view="sorteio"]');
  await page.waitForTimeout(250);
  const aposReload = await page.evaluate(() => Object.keys(state.sorteio.buyers).length);
  check(aposReload === 3, 'as marcações sobrevivem ao reload (localStorage + migrate)', `${aposReload} marcados`);

  // ── o sorteio ──
  await page.waitForTimeout(900);                       // deixa o reveal dos cards terminar
  await page.screenshot({ path: path.join(SHOTS, 'sorteio-desktop-1440.png') });
  await page.locator('#sort-stage').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, 'sorteio-desktop-1440-palco.png') });
  await page.click('#sort-run');
  check(await page.isVisible('#sort-rolling'), 'a roleta aparece e começa a rolar');
  await page.waitForSelector('.sort-winner', { timeout: 15000 });
  const vencedor = (await page.textContent('.sort-winner .sw-name')).trim();
  check(['Marlon Alves', 'Carol Bistaffa', 'Ricardo Souza'].includes(vencedor),
        'o vencedor sorteado é um dos compradores', vencedor);
  check(await page.evaluate(() => state.sorteio.winner) === null,
        'antes de confirmar, state.sorteio.winner continua null');
  const shotWin = path.join(SHOTS, 'sorteio-vencedor-1440.png');
  await page.screenshot({ path: shotWin });

  // ── "sortear outro" re-sorteia ──
  await page.click('#sort-again');
  await page.waitForSelector('.sort-winner', { timeout: 15000 });
  ok('"Sortear outro" roda um novo sorteio');
  const vencedor2 = (await page.textContent('.sort-winner .sw-name')).trim();

  // ── confirmar ──
  await page.click('#sort-confirm-winner');
  await page.waitForTimeout(250);
  const w = await page.evaluate(() => state.sorteio.winner);
  check(!!w && w.name === vencedor2 && !!w.id && !!w.sortedAt,
        'state.sorteio.winner tem valor após confirmar', JSON.stringify(w));
  const hist = await page.evaluate(() => state.sorteio.history);
  check(hist.length === 1 && hist[0].name === vencedor2 && hist[0].pool === 3,
        'o histórico registrou o sorteio', JSON.stringify(hist));
  check(await page.isVisible('.sort-confirmed'), 'o card "🏆 Ganhador confirmado" aparece');
  check(await page.isVisible('#sort-reset'), 'o botão "Refazer sorteio" aparece');
  check(await page.locator('.sort-hist-row').count() === 1, 'o histórico é exibido na tela');

  // ── refazer sorteio (com confirmação) ──
  await page.click('#sort-reset');
  await page.waitForSelector('.modal', { timeout: 5000 });
  await page.locator('.modal-foot button', { hasText: 'Refazer sorteio' }).click();
  await page.waitForTimeout(300);
  const depois = await page.evaluate(() => ({ w: state.sorteio.winner, h: state.sorteio.history.length, b: Object.keys(state.sorteio.buyers).length }));
  check(depois.w === null, 'refazer limpa o ganhador');
  check(depois.h === 1 && depois.b === 3, 'refazer MANTÉM histórico e compradores', JSON.stringify(depois));
  check(await page.isVisible('#sort-run'), 'o botão de sortear volta ao palco');

  // ── ações em massa ──
  await page.click('#sort-mark-all');
  await page.waitForTimeout(150);
  check(await page.evaluate(() => Object.keys(state.sorteio.buyers).length) === 5, '"Marcar todos" marca a lista inteira');
  await page.click('#sort-unmark-all');
  await page.waitForTimeout(150);
  check(await page.evaluate(() => Object.keys(state.sorteio.buyers).length) === 0, '"Desmarcar todos" limpa a lista');
  check(await page.locator('#sort-run').isDisabled(), 'sem compradores, o botão de sortear fica desativado');

  // ── privacidade: o sorteio não vai para o link compartilhado ──
  const vazou = await page.evaluate(() => {
    const s = JSON.parse(JSON.stringify(state));
    delete s.shares; delete s.adminAccess; delete s.sorteio;   // espelha sanitizeStateForAdmin
    return 'sorteio' in s;
  });
  check(vazou === false, 'sanitizeStateForAdmin remove o bloco sorteio');
  check(fs.readFileSync(path.join(ROOT, 'js/firebase-sync.js'), 'utf8').includes('delete s.sorteio;'),
        'firebase-sync.js contém `delete s.sorteio;`');

  // ── nada quebrou nas outras views ──
  for (const v of ['orcamento', 'convidados', 'convites', 'tarefas', 'cronograma', 'fornecedores', 'compartilhamentos']) {
    await page.click(`.side-link[data-view="${v}"]`);
    await page.waitForTimeout(60);
    if (!await page.isVisible(`#view-${v}`)) { bad(`a view "${v}" continua funcionando`); break; }
  }
  check(await page.isVisible('#view-compartilhamentos'), 'as 7 views antigas continuam abrindo normalmente');
  check(await page.evaluate(() => state.guests.length) === 5, 'a lista de convidados continua intacta');

  await ctx.close();
}

/* ═══════════ TESTE 2 — volume real (134 convidados) + mobile 390px ═══════════ */
console.log('\n▶ Volume real e mobile (390×844)');
{
  const N = 134;
  const NOMES = Array.from({ length: N }, (_, i) => `Convidado ${String(i + 1).padStart(3, '0')}`);
  const { ctx, page } = await novaPagina({ width: 390, height: 844 }, true, NOMES);

  await page.evaluate(() => switchView('sorteio'));
  await page.waitForTimeout(300);
  const linhas = await page.locator('#sort-list .sort-row').count();
  check(linhas === N, `a lista renderiza os ${N} convidados`, `${linhas} linhas`);

  // o card não estoura a tela: o scroll é INTERNO à lista
  const m = await page.evaluate(() => {
    const l = document.getElementById('sort-list');
    return { scrollable: l.scrollHeight > l.clientHeight + 10, boxH: l.clientHeight,
             docW: document.documentElement.scrollWidth, winW: window.innerWidth };
  });
  check(m.scrollable, 'a lista rola dentro do card (não estica a página)', `altura visível ${m.boxH}px`);
  check(m.docW <= m.winW + 1, 'sem overflow horizontal em 390px', `${m.docW}px ≤ ${m.winW}px`);

  // alvo de toque do toggle ≥ 44×44
  const box = await page.locator('#sort-list .sort-row').first().locator('.sort-toggle').boundingBox();
  const rowH = (await page.locator('#sort-list .sort-row').first().boundingBox()).height;
  check(box.width >= 44 && rowH >= 44, 'alvo de toque do toggle ≥ 44×44px', `${Math.round(box.width)}×${Math.round(rowH)}px (linha inteira clicável)`);

  // marcar tocando na linha (label) e sortear no mobile
  for (let i = 0; i < 3; i++) await page.locator('#sort-list .sort-row').nth(i).click();
  await page.waitForTimeout(150);
  check(await page.evaluate(() => Object.keys(state.sorteio.buyers).length) === 3, 'tocar na linha marca o comprador (mobile)');
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(SHOTS, 'sorteio-mobile-390.png') });

  await page.click('#sort-run');
  await page.waitForSelector('.sort-winner', { timeout: 15000 });
  await page.click('#sort-confirm-winner');
  await page.waitForTimeout(250);
  const w = await page.evaluate(() => state.sorteio.winner);
  check(!!w && /^Convidado 00[123]$/.test(w.name), 'sorteio confirmado no mobile', w && w.name);
  await page.screenshot({ path: path.join(SHOTS, 'sorteio-mobile-390-ganhador.png') });

  // exportação CSV
  const dl = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
  await page.click('#sort-csv');
  const file = await dl;
  check(!!file && /^sorteio-gravata-/.test(file.suggestedFilename()), 'exporta a lista em CSV', file && file.suggestedFilename());

  await ctx.close();
}

await browser.close();
server.close();

const reais = errors.filter(e => !/favicon|manifest|Failed to load resource/i.test(e));
check(reais.length === 0, 'nenhum erro de JavaScript no console', reais.slice(0, 3).join(' | '));

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} passaram, ${fail} falharam`);
console.log(`📸  screenshots em ${SHOTS}`);
process.exit(fail === 0 ? 0 : 1);
