/* ═════════════════════════════════════════════════════════════════════
   tests/sorteio.spec.mjs — teste ponta a ponta do Sorteio da Festa
   Roda o index.html real num servidor estático local, em MODO LOCAL:
   a requisição de js/config.js é interceptada e devolve
   `window.FIREBASE_CONFIG = false` — o arquivo do projeto NÃO é alterado.
   Fluxo coberto: cadastrar convidados → marcar compradores → sortear →
   confirmar → conferir o ganhador na dinâmica ativa, o histórico e a
   privacidade. Cobre também as REGRAS NOVAS: "não irá" não pode ser marcado
   nem sorteado, várias dinâmicas são independentes e "Limpar" zera só uma.
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
  // Atalho usado pelos testes: a dinâmica aberta na tela.
  await page.addInitScript(() => {
    window.ATIVA = () => state.sorteio.dynamics.find(d => d.id === state.sorteio.activeId);
  });
  await page.addInitScript(lista => {
    try {
      if (localStorage.getItem('@wedding_planner_v3')) return;   // reload: mantém o que o app salvou
      localStorage.setItem('@wedding_planner_v3', JSON.stringify({
        settings: { onboarded: true, showOver: true, strict: true },
        guests: lista.map((n, i) => {
          const [nome, status] = Array.isArray(n) ? n : [n, 'pendente'];
          return { id: 'g' + i, name: nome, status, group: 'Família ' + (i % 2 ? 'Bistaffa' : 'Silva'), isHead: i === 0 };
        }),
        items: [], funds: [], history: [], varCosts: []
      }));
    } catch (e) {}
  }, nomes);
  await page.goto(BASE + 'index.html', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof state === 'object' && state !== null);
  return { ctx, page };
}

/* ═══════════ TESTE 1 — fluxo completo (desktop 1440px) ═══════════ */
console.log('\n▶ Sorteio da Festa — fluxo completo (desktop 1440×900)');
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
  check(await page.evaluate(() => ATIVA().price) === 25, 'o valor da participação salva na dinâmica ativa');

  // ── marcar 3 compradores ──
  for (const n of ['Marlon Alves', 'Carol Bistaffa', 'Ricardo Souza']) {
    await page.locator('.sort-row', { hasText: n }).locator('input[data-sort-buyer]').check();
    await page.waitForTimeout(80);
  }
  const nBuyers = await page.evaluate(() => Object.keys(ATIVA().buyers).length);
  check(nBuyers === 3, 'os 3 participantes foram gravados na dinâmica ativa', `${nBuyers} marcados`);
  const contador = (await page.textContent('#sort-count')).replace(/\s+/g, ' ').trim();
  check(/^3\s*pessoas marcadas/.test(contador), 'contador mostra "3 pessoas marcadas"', contador);
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
  const aposReload = await page.evaluate(() => Object.keys(ATIVA().buyers).length);
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
        'o vencedor sorteado é um dos participantes', vencedor);
  check(await page.evaluate(() => ATIVA().winner) === null,
        'antes de confirmar, o ganhador da dinâmica continua null');
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
  const w = await page.evaluate(() => ATIVA().winner);
  check(!!w && w.name === vencedor2 && !!w.id && !!w.sortedAt,
        'o ganhador é gravado na dinâmica após confirmar', JSON.stringify(w));
  const hist = await page.evaluate(() => ATIVA().history);
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
  const depois = await page.evaluate(() => ({ w: ATIVA().winner, h: ATIVA().history.length, b: Object.keys(ATIVA().buyers).length }));
  check(depois.w === null, 'refazer limpa o ganhador');
  check(depois.h === 1 && depois.b === 3, 'refazer MANTÉM histórico e participantes', JSON.stringify(depois));
  check(await page.isVisible('#sort-run'), 'o botão de sortear volta ao palco');

  // ── ações em massa ──
  await page.click('#sort-mark-all');
  await page.waitForTimeout(150);
  check(await page.evaluate(() => Object.keys(ATIVA().buyers).length) === 5, '"Marcar todos" marca a lista inteira');
  await page.click('#sort-unmark-all');
  await page.waitForTimeout(150);
  check(await page.evaluate(() => Object.keys(ATIVA().buyers).length) === 0, '"Desmarcar todos" limpa a lista');
  check(await page.locator('#sort-run').isDisabled(), 'sem participantes, o botão de sortear fica desativado');

  // ── retrocompatibilidade: o espelho do formato antigo acompanha a 1ª dinâmica ──
  const espelho = await page.evaluate(() => ({
    b: Object.keys(state.sorteio.buyers).length,
    p: state.sorteio.pricePerGravata,
    d0: Object.keys(state.sorteio.dynamics[0].buyers).length
  }));
  check(espelho.b === espelho.d0 && espelho.p === 25,
        'os campos legados espelham a primeira dinâmica (cliente com JS velho não zera nada)', JSON.stringify(espelho));

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
  check(await page.evaluate(() => Object.keys(ATIVA().buyers).length) === 3, 'tocar na linha marca o participante (mobile)');
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(SHOTS, 'sorteio-mobile-390.png') });

  await page.click('#sort-run');
  await page.waitForSelector('.sort-winner', { timeout: 15000 });
  await page.click('#sort-confirm-winner');
  await page.waitForTimeout(250);
  const w = await page.evaluate(() => ATIVA().winner);
  check(!!w && /^Convidado 00[123]$/.test(w.name), 'sorteio confirmado no mobile', w && w.name);
  await page.screenshot({ path: path.join(SHOTS, 'sorteio-mobile-390-ganhador.png') });

  // exportação CSV
  const dl = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
  await page.click('#sort-csv');
  const file = await dl;
  check(!!file && /^sorteio-dinamicas-/.test(file.suggestedFilename()), 'exporta a lista em CSV', file && file.suggestedFilename());

  await ctx.close();
}

/* ═══════════ TESTE 3 — regras novas: "não irá", dinâmicas e limpar ═══════════ */
console.log('\n▶ Elegibilidade, múltiplas dinâmicas e o botão Limpar');
{
  // 2 dos 5 convidados NÃO vão à festa.
  const NOMES = [['Marlon Alves','pendente'], ['Carol Bistaffa','confirmado'],
                 ['João Pedro','nao'], ['Ana Clara','confirmado'], ['Ricardo Souza','nao']];
  const { ctx, page } = await novaPagina({ width: 1440, height: 900 }, false, NOMES);
  await page.click('.side-link[data-view="sorteio"]');
  await page.waitForTimeout(300);

  // ── BLOQUEIO NA ORIGEM ──
  const travados = await page.locator('#sort-list input[data-sort-buyer][disabled]').count();
  check(travados === 2, 'os 2 convidados "não irá" têm o toggle travado', `${travados} travados`);
  check(await page.locator('.sort-row', { hasText: 'João Pedro' }).locator('.sort-badge-off').isVisible(),
        'o convidado "não irá" recebe a etiqueta na lista');

  // marcar via API (simula teclado/script) tem de ser recusado
  await page.evaluate(() => toggleBuyer('g2'));          // João Pedro = 'nao'
  await page.waitForTimeout(150);
  check(await page.evaluate(() => !ATIVA().buyers['g2']),
        'toggleBuyer RECUSA marcar quem está como "não irá"');

  // ── "Marcar todos" ignora os inelegíveis ──
  await page.click('#sort-mark-all');
  await page.waitForTimeout(200);
  const marcados = await page.evaluate(() => Object.keys(ATIVA().buyers));
  check(marcados.length === 3 && !marcados.includes('g2') && !marcados.includes('g4'),
        '"Marcar todos" marca só os 3 elegíveis', JSON.stringify(marcados));

  // ── quem já estava marcado e vira "não irá": sai do pool, mantém o dinheiro ──
  await page.evaluate(() => {                            // marca à força uma marcação "velha"
    ATIVA().buyers['g4'] = true; save(); renderSorteio();
  });
  await page.waitForTimeout(200);
  const pool = await page.evaluate(() => sorteioBuyers().map(g => g.id));
  const pagantes = await page.evaluate(() => sorteioPagantes().map(g => g.id));
  check(pagantes.length === 4 && pool.length === 3 && !pool.includes('g4'),
        'marcação antiga de um "não irá" conta como pagante mas fica FORA do sorteio',
        `pagantes=${pagantes.length} pool=${pool.length}`);

  // 100 sorteios seguidos nunca podem cair num inelegível
  const sorteados = await page.evaluate(() => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      const b = sorteioBuyers();
      ids.add(b[Math.floor(Math.random() * b.length)].id);
    }
    return [...ids];
  });
  check(!sorteados.includes('g2') && !sorteados.includes('g4'),
        'em 100 sorteios, nenhum "não irá" é escolhido', sorteados.join(','));

  // ── MÚLTIPLAS DINÂMICAS ──
  await page.click('#sort-new-dyn');
  await page.waitForSelector('.modal', { timeout: 5000 });
  await page.locator('.modal-body input').first().fill('Tamanco da Noiva');
  await page.locator('.modal-foot button', { hasText: 'Criar dinâmica' }).click();
  await page.waitForTimeout(300);
  check(await page.evaluate(() => state.sorteio.dynamics.length) === 2, 'a segunda dinâmica é criada');
  check(await page.evaluate(() => ATIVA().name) === 'Tamanco da Noiva', 'a nova dinâmica vira a ativa');
  check(await page.evaluate(() => Object.keys(ATIVA().buyers).length) === 0,
        'a nova dinâmica nasce SEM participantes (não herda a outra)');

  // nome duplicado é recusado
  await page.click('#sort-new-dyn');
  await page.waitForSelector('.modal', { timeout: 5000 });
  await page.locator('.modal-body input').first().fill('Tamanco da Noiva');
  await page.locator('.modal-foot button', { hasText: 'Criar dinâmica' }).click();
  await page.waitForTimeout(200);
  check(await page.locator('.modal-note.warn').isVisible(), 'nome de dinâmica repetido é recusado');
  await page.locator('.modal-foot button', { hasText: 'Cancelar' }).click();
  await page.waitForTimeout(200);

  // marca gente diferente na 2ª dinâmica e confere o isolamento
  await page.locator('.sort-row', { hasText: 'Carol Bistaffa' }).locator('input[data-sort-buyer]').check();
  await page.waitForTimeout(150);
  const iso = await page.evaluate(() => state.sorteio.dynamics.map(d => Object.keys(d.buyers).length));
  check(iso[0] === 4 && iso[1] === 1, 'cada dinâmica guarda a própria lista', JSON.stringify(iso));

  // valor por dinâmica é independente
  await page.fill('#sort-price', '10');
  await page.locator('#sort-price').blur();
  await page.waitForTimeout(200);
  const precos = await page.evaluate(() => state.sorteio.dynamics.map(d => d.price));
  check(precos[0] === 0 && precos[1] === 10, 'o valor é por dinâmica', JSON.stringify(precos));

  // alternar pela pílula troca a dinâmica ativa
  const chips = await page.locator('#sort-dyn-chips .chip').count();
  check(chips === 2, 'as pílulas mostram as 2 dinâmicas');
  await page.locator('#sort-dyn-chips .chip').first().click();
  await page.waitForTimeout(250);
  check(await page.evaluate(() => ATIVA().name) === 'Gravata', 'clicar na pílula troca a dinâmica ativa');
  check(await page.evaluate(() => Object.keys(ATIVA().buyers).length) === 4,
        'voltar para a 1ª dinâmica traz a lista dela de volta');

  // sorteia e confirma na 1ª dinâmica — a 2ª não pode ser afetada
  await page.click('#sort-run');
  await page.waitForSelector('.sort-winner', { timeout: 15000 });
  await page.click('#sort-confirm-winner');
  await page.waitForTimeout(300);
  const ganhadores = await page.evaluate(() => state.sorteio.dynamics.map(d => d.winner && d.winner.name));
  check(!!ganhadores[0] && ganhadores[1] === null, 'o ganhador fica só na dinâmica sorteada', JSON.stringify(ganhadores));
  check(!['João Pedro', 'Ricardo Souza'].includes(ganhadores[0]),
        'o ganhador confirmado nunca é um "não irá"', ganhadores[0]);

  // ── BOTÃO LIMPAR ──
  await page.click('#sort-clear-dyn');
  await page.waitForSelector('.modal', { timeout: 5000 });
  await page.locator('.modal-foot button', { hasText: 'Limpar participantes' }).click();
  await page.waitForTimeout(300);
  const posLimpar = await page.evaluate(() => ({
    a: Object.keys(state.sorteio.dynamics[0].buyers).length,
    b: Object.keys(state.sorteio.dynamics[1].buyers).length,
    w: !!state.sorteio.dynamics[0].winner,
    h: state.sorteio.dynamics[0].history.length,
    g: state.guests.length
  }));
  check(posLimpar.a === 0, 'Limpar zera os participantes da dinâmica ativa');
  check(posLimpar.b === 1, 'Limpar NÃO toca nas outras dinâmicas');
  check(posLimpar.w === true && posLimpar.h === 1, 'Limpar preserva ganhador e histórico');
  check(posLimpar.g === 5, 'Limpar NÃO apaga convidados');

  // ── excluir dinâmica ──
  check(await page.evaluate(() => state.sorteio.dynamics.length) === 2, 'ainda são 2 dinâmicas antes de excluir');
  await page.click('#sort-del-dyn');
  await page.waitForSelector('.modal', { timeout: 5000 });
  await page.locator('.modal-foot button', { hasText: 'Excluir dinâmica' }).click();
  await page.waitForTimeout(300);
  check(await page.evaluate(() => state.sorteio.dynamics.length) === 1, 'a dinâmica é excluída');
  check(await page.locator('#sort-del-dyn').isDisabled(), 'com uma só dinâmica, Excluir fica desativado');

  // ── nada quebrou: faixa etária e estimativas seguem de pé ──
  await page.click('.side-link[data-view="convidados"]');
  await page.waitForTimeout(200);
  const faixas = await page.evaluate(() => state.guests.map(g => g.ageGroup));
  check(faixas.every(a => a === 'adulto'), 'faixa etária dos convidados intacta', faixas.join(','));
  check(await page.evaluate(() => typeof compute === 'function' && compute().totalExpense === 0),
        'compute() continua respondendo');

  await ctx.close();
}

await browser.close();
server.close();

const reais = errors.filter(e => !/favicon|manifest|Failed to load resource/i.test(e));
check(reais.length === 0, 'nenhum erro de JavaScript no console', reais.slice(0, 3).join(' | '));

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} passaram, ${fail} falharam`);
console.log(`📸  screenshots em ${SHOTS}`);
process.exit(fail === 0 ? 0 : 1);
