import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

/* PÚBLICOS por design. Quem protege os dados é o RLS (veja supabase/). Nunca coloque a service_role aqui. */
const SUPABASE_URL = 'https://jeknoljbwkkutnumxzwx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impla25vbGpid2trdXRudW14end4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3NDM5NjEsImV4cCI6MjEwNzMxOTk2MX0.Fwj9nvRmqMh2SQbFVMk0CnNOimHLNkkJXvHW15-r5LE';
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const GOAL = 1000, WATCH_SECONDS = 15, RATE_POR_VIEW = 0.012;
const AD1 = { key: 'bd445d1e9f19f31e180ec0fff672a42a', h: 50, w: 320 };
const AD2 = { key: '08d8f2d79127c7f549c33bfb74da9a81', h: 250, w: 300 };
const n0 = n => Number(n || 0).toLocaleString('pt-BR');
const brl = n => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
let session = null;

function ptErr(e) {
  const m = (e && e.message) || String(e);
  if (/rate limit/i.test(m)) return 'Limite de e-mails atingido. Tente de novo em alguns minutos.';
  if (/invalid login/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/not confirmed/i.test(m)) return 'Confirme seu e-mail antes de entrar.';
  if (/already registered/i.test(m)) return 'Este e-mail já tem cadastro. Use a aba Entrar.';
  if (/failed to fetch/i.test(m)) return 'Sem conexão com o servidor. Confira a configuração do Supabase.';
  return m;
}

/* Anúncios em iframes isolados (atOptions é global) */
function loadAd(id, a) {
  $(id).srcdoc = '<!DOCTYPE html><body style="margin:0"><script>atOptions={"key":"' + a.key + '","format":"iframe","height":' + a.h + ',"width":' + a.w + ',"params":{}};<\/script><script src="https://bauval.org/22/' + a.key + '"><\/script>';
}

/* Estatísticas públicas: pote, pessoas, visualizações de cada um */
async function renderPublic() {
  const { data } = await sb.rpc('estatisticas_publicas');
  if (!data) return;
  $('#potVal').textContent = brl(data.total_views * RATE_POR_VIEW);
  $('#cPessoas').textContent = n0(data.pessoas);
  $('#cViews').textContent = n0(data.total_views);
  $('#cCad').textContent = n0(data.cadastrados);
  const tb = $('#cTab'); tb.replaceChildren();
  if (!data.usuarios.length) { tb.innerHTML = '<tr><td colspan="2">Ninguém assistiu ainda.</td></tr>'; return; }
  data.usuarios.forEach(u => {
    const tr = document.createElement('tr'), a = document.createElement('td'), b = document.createElement('td');
    a.textContent = u.nome; b.textContent = n0(u.views); tr.append(a, b); tb.append(tr);
  });
}

/* Painel do usuário */
async function renderUser() {
  $('#painel').classList.toggle('hide', !session);
  $('#navAuth').textContent = session ? 'Sair' : 'Entrar';
  $('#heroCta').classList.toggle('hide', !!session);
  if (session) {
    const { data: p } = await sb.from('profiles').select('nome,plano,views,queue_at,saldo_centavos').single();
    if (p) {
      $('#uName').textContent = (p.nome || 'amigo').split(' ')[0];
      $('#sViews').textContent = n0(p.views);
      $('#bar').style.width = Math.min(100, p.views / GOAL * 100) + '%';
      $('#sPlan').textContent = p.plano;
      $('#sSaldo').textContent = brl(p.saldo_centavos / 100);
      let q = '—';
      if (p.queue_at) { const { data: pos } = await sb.rpc('minha_posicao'); if (pos) q = '#' + pos; }
      $('#sQueue').textContent = q;
    }
    const { data: sq } = await sb.from('saques').select('valor_centavos,status,created_at').order('created_at', { ascending: false }).limit(5);
    $('#saqueList').textContent = sq && sq.length ? 'Últimos saques: ' + sq.map(s => brl(s.valor_centavos / 100) + ' (' + s.status + ')').join(' · ') : '';
  }
  renderPublic();
}

/* Autenticação */
const dlg = $('#dlg');
const FORMS = { login: '#fLogin', signup: '#fSignup', reset: '#fReset', newpass: '#fNewPass' };
function showTab(t) {
  Object.entries(FORMS).forEach(([k, id]) => $(id).classList.toggle('hide', k !== t));
  $('#tabs').classList.toggle('hide', t === 'reset' || t === 'newpass');
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
}
function openDlg(t) { showTab(t || 'login'); $('#aMsg').textContent = ''; if (!dlg.open) dlg.showModal(); }
function say(t, ok) { const m = $('#aMsg'); m.textContent = t; m.className = 'msg ' + (ok ? 'ok' : 'err'); }

$$('#tabs button').forEach(b => b.onclick = () => showTab(b.dataset.t));
$('#toReset').onclick = () => showTab('reset');
$('#toLogin').onclick = () => showTab('login');
$('#closeDlg').onclick = () => dlg.close();
$('#heroCta').onclick = () => openDlg('signup');
$('#navAuth').onclick = async () => { if (session) await sb.auth.signOut(); else openDlg('login'); };

$('#fSignup').onsubmit = async e => {
  e.preventDefault();
  const { data, error } = await sb.auth.signUp({
    email: $('#sE').value.trim(), password: $('#sP').value,
    options: { data: { nome: $('#sN').value.trim(), telefone: $('#sT').value.trim() } }
  });
  if (error) return say(ptErr(error));
  if (!data.session) return say('Cadastro feito! Confirme seu e-mail para entrar.', true);
  dlg.close();
};
$('#fLogin').onsubmit = async e => {
  e.preventDefault();
  const { error } = await sb.auth.signInWithPassword({ email: $('#lE').value.trim(), password: $('#lP').value });
  if (error) return say(ptErr(error));
  dlg.close();
};
$('#fReset').onsubmit = async e => {
  e.preventDefault();
  const { error } = await sb.auth.resetPasswordForEmail($('#rE').value.trim(), { redirectTo: location.origin });
  if (error) return say(ptErr(error));
  say('Se o e-mail existir, enviamos um link de redefinição.', true);
};
$('#fNewPass').onsubmit = async e => {
  e.preventDefault();
  const { error } = await sb.auth.updateUser({ password: $('#nP').value });
  if (error) return say(ptErr(error));
  say('Senha alterada!', true); setTimeout(() => dlg.close(), 900);
};
sb.auth.onAuthStateChange((event, s) => {
  session = s;
  if (event === 'PASSWORD_RECOVERY') openDlg('newpass');
  setTimeout(renderUser, 0);
});

/* Assistir anúncio: o servidor valida e conta; o painel e o pote atualizam na hora */
let watching = false;
$('#watch').onclick = () => {
  if (!session || watching) return;
  watching = true;
  const btn = $('#watch'), msg = $('#watchMsg');
  btn.disabled = true; loadAd('#ad1', AD1); loadAd('#ad2', AD2);
  let t = WATCH_SECONDS;
  msg.className = 'msg'; msg.textContent = 'Assistindo… ' + t + 's';
  const iv = setInterval(async () => {
    if (document.hidden) { msg.textContent = 'Volte para esta aba: o tempo pausou.'; msg.className = 'msg err'; return; }
    t--; msg.className = 'msg'; msg.textContent = 'Assistindo… ' + t + 's';
    if (t > 0) return;
    clearInterval(iv);
    try {
      const { data: { session: s } } = await sb.auth.getSession();
      const r = await fetch('/api/registrar-view', { method: 'POST', headers: { Authorization: 'Bearer ' + s.access_token } });
      let j = {}; try { j = await r.json(); } catch (_) { throw new Error('API não encontrada. Confira se a pasta api/ foi publicada na Vercel.'); }
      if (!r.ok) throw new Error(j.erro || 'Erro ao contar a visualização.');
      $('#sViews').textContent = n0(j.views);                       // atualiza o painel na hora
      $('#bar').style.width = Math.min(100, j.views / GOAL * 100) + '%';
      msg.className = 'msg ok'; msg.textContent = 'Visualização contada!';
    } catch (err) { msg.className = 'msg err'; msg.textContent = ptErr(err); }
    btn.disabled = false; watching = false; renderUser();           // recarrega fila, pote e comunidade
  }, 1000);
};

/* Saque (o saldo só é creditado pelo servidor; o pagamento via Asaas é feito depois da conferência) */
$('#fSaque').onsubmit = async e => {
  e.preventDefault();
  const m = $('#saqueMsg'), v = Math.round(parseFloat($('#qVal').value.replace(',', '.')) * 100);
  if (!(v > 0)) { m.className = 'msg err'; m.textContent = 'Informe um valor válido.'; return; }
  const { error } = await sb.rpc('solicitar_saque', { p_valor: v, p_chave: $('#qPix').value.trim() });
  if (error) { m.className = 'msg err'; m.textContent = /insuficiente/i.test(error.message) ? 'Saldo insuficiente.' : ptErr(error); return; }
  m.className = 'msg ok'; m.textContent = 'Saque solicitado! Ele ficará pendente até a confirmação do pagamento.';
  e.target.reset(); renderUser();
};

/* Formulário de leads: só insere. Visitantes não leem nem apagam leads (RLS). */
$('#fLead').onsubmit = async e => {
  e.preventDefault();
  const m = $('#ldMsg');
  const { error } = await sb.from('leads').insert({ email: $('#ldE').value.trim().toLowerCase(), consentimento: $('#ldC').checked });
  if (error && error.code !== '23505') { m.className = 'msg err'; m.textContent = ptErr(error); return; }
  m.className = 'msg ok'; m.textContent = 'Cadastro realizado! Obrigado.'; e.target.reset();
};

$('#yr').textContent = new Date().getFullYear();
renderPublic(); setInterval(renderPublic, 10000);   // pote e comunidade atualizam a cada 10 s
