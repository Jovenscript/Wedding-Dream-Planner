/* ═════════════════════════════════════════════════════════════════════
   auth.js — lógica da tela de login (login.html)
   O QUE: cadastro, entrada, recuperação de senha e persistência de sessão
   com Firebase Authentication. Autenticou → vai para index.html.
   Sem config (modo local) → oferece entrar direto, sem conta.
   POR QUÊ separado do app: a tela de login carrega só o essencial —
   nada dos dados do casamento existe aqui antes do login.
   ═════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const msg=$('auth-msg');
  const AUTH_ERR={ 'auth/invalid-email':'E-mail inválido.', 'auth/user-not-found':'Conta não encontrada — crie uma conta.',
    'auth/wrong-password':'Senha incorreta.', 'auth/invalid-credential':'E-mail ou senha incorretos.',
    'auth/email-already-in-use':'Este e-mail já tem conta — use Entrar.', 'auth/weak-password':'Senha muito curta (mínimo 6 caracteres).',
    'auth/too-many-requests':'Muitas tentativas — aguarde um pouco.', 'auth/network-request-failed':'Sem conexão — verifique a internet.' };
  function say(t,kind){ msg.textContent=t; msg.className='auth-msg show '+(kind||'err'); }
  function clearMsg(){ msg.className='auth-msg'; }

  // Modo local (config vazia): sem login — só um atalho para o app.
  if(!window.FIREBASE_CONFIG){
    $('auth-sub').textContent='O modo nuvem está desligado (js/config.js). Você pode usar o sistema localmente neste aparelho.';
    ['auth-mail','auth-pass','auth-login','auth-signup','auth-forgot'].forEach(id=>$(id).style.display='none');
    document.querySelectorAll('.field-label').forEach(l=>l.style.display='none');
    $('auth-local').textContent='Entrar no modo local';
    $('auth-local').addEventListener('click', ()=>location.replace('index.html'));
    return;
  }
  $('auth-local').style.display='none';

  const SDK='https://www.gstatic.com/firebasejs/10.14.1/';
  function loadScript(s){ return new Promise((res,rej)=>{ const e=document.createElement('script'); e.src=SDK+s; e.onload=res; e.onerror=()=>rej(new Error(s)); document.head.appendChild(e); }); }

  (async function(){
    try{ await loadScript('firebase-app-compat.js'); await loadScript('firebase-auth-compat.js'); }
    catch(e){ say('Não consegui carregar o login — verifique a internet.'); return; }
    firebase.initializeApp(window.FIREBASE_CONFIG);
    // Sessão persiste por padrão: quem já está logado pula direto pro app.
    firebase.auth().onAuthStateChanged(u=>{ if(u) location.replace('index.html'); });

    async function doAuth(kind){
      const mail=($('auth-mail').value||'').trim(), pass=$('auth-pass').value||'';
      if(!mail){ say('Informe o e-mail.'); $('auth-mail').focus(); return; }
      if(kind!=='forgot' && pass.length<6){ say('A senha precisa de pelo menos 6 caracteres.'); $('auth-pass').focus(); return; }
      try{
        clearMsg();
        if(kind==='login')  await firebase.auth().signInWithEmailAndPassword(mail,pass);
        if(kind==='signup'){ await firebase.auth().createUserWithEmailAndPassword(mail,pass); say('Conta criada! Entrando…','ok'); }
        if(kind==='forgot'){ await firebase.auth().sendPasswordResetEmail(mail); say('Enviamos um e-mail para redefinir sua senha.','ok'); }
      }catch(e){ say(AUTH_ERR[e.code]||('Não deu certo ('+(e.code||'erro')+'). Tente novamente.')); }
    }
    $('auth-login').addEventListener('click', ()=>doAuth('login'));
    $('auth-signup').addEventListener('click', ()=>doAuth('signup'));
    $('auth-forgot').addEventListener('click', ()=>doAuth('forgot'));
    $('auth-pass').addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); doAuth('login'); } });
  })();
})();
