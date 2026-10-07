/**
 * Minhas Finanças — API para a planilha "Painel Financeiro"
 *
 * O app (GitHub Pages / APK) conversa com este script por HTTP (doPost).
 * Os lançamentos continuam nas colunas A:F (Data, Descrição, Categoria,
 * Subcategoria, Tipo, Valor) e quem lançou fica na coluna COL_QUEM.
 * As fórmulas de G, H e do resumo continuam funcionando normalmente.
 *
 * Implantação: Implantar > Nova implantação > App da Web
 *   Executar como: Eu  |  Quem pode acessar: Qualquer pessoa
 * Depois, na planilha: menu 💰 Minhas Finanças > Configurar app (nomes e PINs).
 */
const ABA = 'Painel Financeiro';
const PRIMEIRA_LINHA = 5;
const ULTIMA_LINHA_FORMULAS = 305;
const COL_QUEM = 9;            // coluna I: quem fez o lançamento
const USUARIOS = [             // o id é o que fica gravado na planilha
  { id: 'Eu', nome: 'Eu' },
  { id: 'Esposa', nome: 'Esposa' }
];
const MAX_TENTATIVAS = 8;      // PIN errado: bloqueia o usuário por 15 min
const BLOQUEIO_SEG = 900;
const VERSAO_API = 2;

/* ---------------- menu da planilha ---------------- */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('💰 Minhas Finanças')
    .addItem('Configurar app (nomes e PINs)', 'configurarApp')
    .addItem('Verificar planilha', 'verificarPlanilha')
    .addToUi();
}

function configurarApp() {
  const ui = SpreadsheetApp.getUi();
  const s = aba_();
  verificarColunaQuem_(s);
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SEGREDO')) {
    props.setProperty('SEGREDO', Utilities.getUuid() + Utilities.getUuid());
  }
  for (let i = 0; i < USUARIOS.length; i++) {
    const u = USUARIOS[i];
    const r1 = ui.prompt('Nome para "' + u.id + '"',
      'Como "' + nomeDe_(u.id) + '" deve aparecer no app? Deixe em branco para manter.',
      ui.ButtonSet.OK_CANCEL);
    if (r1.getSelectedButton() !== ui.Button.OK) return;
    const nome = r1.getResponseText().trim();
    if (nome) props.setProperty('NOME_' + u.id, nome.slice(0, 30));

    const temPin = !!props.getProperty('PIN_' + u.id);
    while (true) {
      const r2 = ui.prompt('PIN de ' + nomeDe_(u.id),
        'Digite um PIN de 4 a 8 números.' + (temPin ? ' Deixe em branco para manter o atual.' : ''),
        ui.ButtonSet.OK_CANCEL);
      if (r2.getSelectedButton() !== ui.Button.OK) return;
      const pin = r2.getResponseText().trim();
      if (!pin && temPin) break;
      if (/^\d{4,8}$/.test(pin)) {
        props.setProperty('PIN_' + u.id, hashPin_(pin));
        CacheService.getScriptCache().remove('falhas:' + u.id);
        break;
      }
      ui.alert('O PIN precisa ter de 4 a 8 números.');
    }
  }
  const cab = s.getRange(PRIMEIRA_LINHA - 1, COL_QUEM);
  if (!cab.getValue()) cab.setValue('Quem');
  ui.alert('Pronto! Nomes e PINs salvos. Trocar um PIN desconecta quem estava usando o PIN antigo.');
}

function verificarPlanilha() {
  const ui = SpreadsheetApp.getUi();
  try {
    const d = carregarDados_();
    verificarColunaQuem_(aba_());
    const semAutor = d.lancamentos.filter(function (l) { return !l.quem; }).length;
    ui.alert('Tudo certo.\n\n' + d.lancamentos.length + ' lançamentos lidos, ' +
      semAutor + ' sem autor (feitos antes do app ou direto na planilha).\n' +
      'Fuso da planilha: ' + SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone());
  } catch (e) {
    ui.alert('Problema: ' + e.message);
  }
}

/* ---------------- HTTP ---------------- */

function doGet() {
  return json_({ ok: true, dados: info_() });
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (_) {
    return json_({ ok: false, erro: 'Requisição inválida.' });
  }
  try {
    const d = req.dados || {};
    if (req.acao === 'ping') return json_({ ok: true, dados: info_() });
    if (req.acao === 'login') return json_({ ok: true, dados: login_(d.usuario, d.pin) });
    const usuario = autenticar_(req.token);
    let dados;
    switch (req.acao) {
      case 'carregar': dados = carregarDados_(); break;
      case 'salvar': dados = salvarLancamento_(d, usuario); break;
      case 'editar': dados = editarLancamento_(d.linha, d.antes, d.novo); break;
      case 'excluir': dados = excluirLancamento_(d.linha, d.antes); break;
      case 'ajustes': dados = salvarAjustes_(d.renda, d.metas); break;
      default: throw new Error('Ação desconhecida.');
    }
    return json_({ ok: true, dados: dados });
  } catch (err) {
    return json_({ ok: false, erro: (err && err.message) || String(err), auth: !!(err && err.auth) });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function info_() {
  const props = PropertiesService.getScriptProperties();
  return {
    app: 'Minhas Finanças',
    versaoApi: VERSAO_API,
    usuarios: USUARIOS.map(function (u) {
      return { id: u.id, nome: nomeDe_(u.id), configurado: !!props.getProperty('PIN_' + u.id) };
    })
  };
}

/* ---------------- autenticação ---------------- */

function erroAuth_(msg) {
  const e = new Error(msg);
  e.auth = true;
  return e;
}

function nomeDe_(id) {
  const u = USUARIOS.filter(function (x) { return x.id === id; })[0];
  return PropertiesService.getScriptProperties().getProperty('NOME_' + id) || (u ? u.nome : id);
}

function hashPin_(pin) {
  const segredo = PropertiesService.getScriptProperties().getProperty('SEGREDO');
  const b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, segredo + '|' + pin);
  return Utilities.base64EncodeWebSafe(b);
}

function assinatura_(id) {
  const props = PropertiesService.getScriptProperties();
  const pinHash = props.getProperty('PIN_' + id), segredo = props.getProperty('SEGREDO');
  if (!pinHash || !segredo) return null;
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(id + '|' + pinHash, segredo));
}

function login_(id, pin) {
  if (!USUARIOS.some(function (u) { return u.id === id; })) throw erroAuth_('Usuário desconhecido.');
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('PIN_' + id)) {
    throw erroAuth_('O PIN de ' + nomeDe_(id) + ' ainda não foi criado. Na planilha, use o menu 💰 Minhas Finanças > Configurar app.');
  }
  const cache = CacheService.getScriptCache(), chave = 'falhas:' + id;
  const falhas = Number(cache.get(chave)) || 0;
  if (falhas >= MAX_TENTATIVAS) throw erroAuth_('Muitas tentativas erradas. Espere 15 minutos.');
  if (hashPin_(String(pin || '')) !== props.getProperty('PIN_' + id)) {
    cache.put(chave, String(falhas + 1), BLOQUEIO_SEG);
    throw erroAuth_('PIN incorreto.');
  }
  cache.remove(chave);
  return { token: id + '.' + assinatura_(id), usuario: { id: id, nome: nomeDe_(id) } };
}

function autenticar_(token) {
  const t = String(token || ''), i = t.indexOf('.');
  const id = i > 0 ? t.slice(0, i) : '';
  const sig = id && assinatura_(id);
  if (!sig || t.slice(i + 1) !== sig) throw erroAuth_('Sessão expirada. Entre de novo.');
  return id;
}

/* ---------------- planilha ---------------- */

function aba_() {
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA);
  if (!s) throw new Error('Não encontrei a aba "' + ABA + '".');
  return s;
}

function fuso_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
}

function verificarColunaQuem_(s) {
  const ids = USUARIOS.map(function (u) { return u.id.toLowerCase(); });
  const cab = String(s.getRange(PRIMEIRA_LINHA - 1, COL_QUEM).getValue()).trim();
  const letra = s.getRange(1, COL_QUEM).getA1Notation().replace(/\d+/, '');
  if (cab && cab !== 'Quem') {
    throw new Error('A coluna ' + letra + ' já tem o cabeçalho "' + cab + '". Mude COL_QUEM no Codigo.gs para uma coluna livre.');
  }
  const n = Math.max(s.getLastRow(), PRIMEIRA_LINHA) - PRIMEIRA_LINHA + 1;
  const vals = s.getRange(PRIMEIRA_LINHA, COL_QUEM, n, 1).getValues();
  for (let i = 0; i < vals.length; i++) {
    const v = String(vals[i][0]).trim();
    if (v && ids.indexOf(v.toLowerCase()) < 0) {
      throw new Error('A coluna ' + letra + ' tem outros dados ("' + v + '" na linha ' + (PRIMEIRA_LINHA + i) +
        '). Mude COL_QUEM no Codigo.gs para uma coluna livre.');
    }
  }
}

function idUsuario_(v) {
  const t = String(v || '').trim().toLowerCase();
  const u = USUARIOS.filter(function (x) { return x.id.toLowerCase() === t; })[0];
  return u ? u.id : '';
}

function dataIso_(v, tz) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  const t = String(v || '').trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return '';
}

/** Meia-noite no fuso da planilha (evita a data "voltar um dia"). */
function paraData_(iso, tz) {
  return Utilities.parseDate(iso, tz, 'yyyy-MM-dd');
}

/** Aceita número ou texto como "1.234,56" / "R$ 50". */
function numero_(v) {
  if (typeof v === 'number') return v;
  let t = String(v || '').replace(/[R$\s]/g, '');
  if (t.indexOf(',') >= 0) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return isNaN(n) ? 0 : n;
}

function carregarDados_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const s = aba_(), tz = ss.getSpreadsheetTimeZone();
  const ultima = Math.max(s.getLastRow(), ULTIMA_LINHA_FORMULAS);
  const linhas = s.getRange(PRIMEIRA_LINHA, 1, ultima - PRIMEIRA_LINHA + 1, Math.max(6, COL_QUEM)).getValues();
  const lancamentos = [];
  linhas.forEach(function (r, i) {
    const data = dataIso_(r[0], tz);
    const valor = Math.round(numero_(r[5]) * 100) / 100;
    if (data && valor) {
      lancamentos.push({
        linha: PRIMEIRA_LINHA + i, data: data, desc: String(r[1] || '').trim(),
        cat: String(r[2] || '').trim(), sub: String(r[3] || '').trim(), tipo: String(r[4] || '').trim(),
        valor: valor, quem: idUsuario_(r[COL_QUEM - 1])
      });
    }
  });
  const guia = s.getRange('J5:L19').getValues()
    .filter(function (r) { return r[0]; })
    .map(function (r) { return { cat: String(r[0]).trim(), tipo: String(r[1]).trim(), ex: String(r[2]) }; });
  let categorias = [];
  const dv = s.getRange(PRIMEIRA_LINHA, 3).getDataValidation() || s.getRange('C13').getDataValidation();
  if (dv && dv.getCriteriaType() === SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) {
    const v = dv.getCriteriaValues();
    if (v && Array.isArray(v[0])) categorias = v[0].map(function (c) { return String(c).trim(); }).filter(String);
  }
  return {
    lancamentos: lancamentos,
    guia: guia,
    categorias: categorias,
    renda: numero_(s.getRange('K26').getValue()),
    metas: s.getRange('M29:M31').getValues().map(function (r) { return numero_(r[0]); }),
    usuarios: info_().usuarios.map(function (u) { return { id: u.id, nome: u.nome }; }),
    url: ss.getUrl()
  };
}

function validar_(e, tz) {
  if (!e || !/^\d{4}-\d{2}-\d{2}$/.test(e.data)) throw new Error('Data inválida.');
  const v = Math.round(Number(e.valor) * 100) / 100;
  if (!(v > 0)) throw new Error('Informe um valor maior que zero.');
  if (!e.cat) throw new Error('Escolha uma categoria.');
  return [[paraData_(e.data, tz), String(e.desc || '').slice(0, 200), String(e.cat), String(e.sub || '').slice(0, 100),
    String(e.tipo || ''), v]];
}

function comTrava_(fn) {
  const trava = LockService.getScriptLock();
  if (!trava.tryLock(20000)) throw new Error('A planilha está ocupada. Tente de novo em alguns segundos.');
  try {
    return fn();
  } finally {
    trava.releaseLock();
  }
}

function salvarLancamento_(e, usuario) {
  return comTrava_(function () {
    const cache = CacheService.getScriptCache();
    const uid = e && e.uid ? 'uid:' + String(e.uid).slice(0, 64) : '';
    if (uid && cache.get(uid)) return carregarDados_(); // reenvio do mesmo gasto (rede instável)

    const s = aba_(), tz = fuso_();
    const valores = validar_(e, tz);
    const ultima = Math.max(s.getLastRow(), ULTIMA_LINHA_FORMULAS);
    const ocupadas = s.getRange(PRIMEIRA_LINHA, 1, ultima - PRIMEIRA_LINHA + 1, 6).getValues();
    let linha = -1;
    for (let i = 0; i < ocupadas.length; i++) {
      if (ocupadas[i].every(function (c) { return c === '' || c === null; })) { linha = PRIMEIRA_LINHA + i; break; }
    }
    if (linha === -1) {
      linha = ultima + 1;
      s.getRange(linha, 7, 1, 2).setFormulas([[
        '=IF(A' + linha + '="","",TEXT(A' + linha + ',"MM/YYYY"))',
        '=IF(A' + linha + '="","",DAY(A' + linha + '))'
      ]]);
    }
    s.getRange(linha, 1, 1, 6).setValues(valores);
    s.getRange(linha, 1).setNumberFormat('dd/mm/yyyy');
    s.getRange(linha, 6).setNumberFormat('#,##0.00');
    s.getRange(linha, COL_QUEM).setValue(usuario);
    SpreadsheetApp.flush();
    if (uid) cache.put(uid, String(linha), 600);
    return carregarDados_();
  });
}

function linhaValida_(linha) {
  const n = Number(linha);
  if (!(n >= PRIMEIRA_LINHA) || n !== Math.floor(n)) throw new Error('Linha inválida.');
  return n;
}

/** Garante que a linha ainda é o mesmo lançamento que o app mostrou. */
function conferir_(s, linha, antes, tz) {
  const r = s.getRange(linha, 1, 1, 6).getValues()[0];
  const a = antes || {};
  const igual = dataIso_(r[0], tz) === a.data &&
    Math.round(numero_(r[5]) * 100) === Math.round(Number(a.valor) * 100) &&
    String(r[1] || '').trim() === String(a.desc || '').trim() &&
    String(r[2] || '').trim() === String(a.cat || '').trim();
  if (!igual) throw new Error('Esse lançamento foi alterado por outra pessoa. Atualize e tente de novo.');
}

function editarLancamento_(linha, antes, novo) {
  return comTrava_(function () {
    const s = aba_(), tz = fuso_(), n = linhaValida_(linha);
    conferir_(s, n, antes, tz);
    s.getRange(n, 1, 1, 6).setValues(validar_(novo, tz));
    SpreadsheetApp.flush();
    return carregarDados_();
  });
}

function excluirLancamento_(linha, antes) {
  return comTrava_(function () {
    const s = aba_(), tz = fuso_(), n = linhaValida_(linha);
    conferir_(s, n, antes, tz);
    s.getRange(n, 1, 1, 6).clearContent();
    s.getRange(n, COL_QUEM).clearContent();
    SpreadsheetApp.flush();
    return carregarDados_();
  });
}

function salvarAjustes_(renda, metas) {
  return comTrava_(function () {
    const s = aba_();
    if (!(Number(renda) >= 0)) throw new Error('Renda inválida.');
    s.getRange('K26').setValue(Math.round(Number(renda) * 100) / 100);
    if (metas && metas.length === 3) {
      const m = metas.map(Number);
      if (m.some(function (x) { return !(x >= 0 && x <= 1); })) throw new Error('Metas inválidas.');
      if (Math.round(m.reduce(function (a, b) { return a + b; }, 0) * 100) !== 100) {
        throw new Error('As metas precisam somar 100%.');
      }
      s.getRange('M29:M31').setValues(m.map(function (x) { return [x]; }));
    }
    SpreadsheetApp.flush();
    return carregarDados_();
  });
}
