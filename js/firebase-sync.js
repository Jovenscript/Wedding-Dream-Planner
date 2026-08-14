/* ═════════════════════════════════════════════════════════════════════
   firebase-sync.js — proteção de rota + sincronização com a nuvem
   O QUE: se a nuvem está ativa (config.js preenchido), exige login:
   quem não está autenticado é redirecionado para login.html. Autenticado,
   carrega os dados de users/{uid}/weddings/{WEDDING_ID}, assina mudanças
   em tempo real (multi-dispositivo) e salva com debounce a cada alteração.
   COMO CONVERSA: state.js chama window.__cloudSave() dentro de save();
   aqui esse hook empurra o estado para o Firestore ~0,9s depois da última
   mudança (evita uma gravação por tecla).
   SEGURANÇA DE VERDADE: as regras do Firestore (firestore.rules) — cada
   usuário só lê/escreve os próprios documentos.
   CARREGA: por último, depois do boot do app.js.
   ═════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';
  // Modo local: sem config, nada de login — o app já está rodando.
  if(!window.FIREBASE_CONFIG){ return; }

  const SDK='https://www.gstatic.com/firebasejs/10.14.1/';
  const bar=el('auth-bar'), dot=el('cloud-dot');
  let db=null, user=null, ref=null, unsub=null, saveTimer=null, applyingRemote=false, lastPushId='';

  function loadScript(s){ return new Promise((res,rej)=>{ const e=document.createElement('script'); e.src=SDK+s; e.onload=res; e.onerror=()=>rej(new Error(s)); document.head.appendChild(e); }); }

  async function init(){
    try{
      await loadScript('firebase-app-compat.js');
      await loadScript('firebase-auth-compat.js');
      await loadScript('firebase-firestore-compat.js');
    }catch(e){
      console.error(e);
      document.documentElement.classList.remove('cloud-wait');
      toast('Não consegui carregar o modo nuvem — usando dados locais.','warn');
      return;
    }
    firebase.initializeApp(window.FIREBASE_CONFIG);
    db=firebase.firestore();
    // Proteção de rota: sem usuário → volta para a tela de login.
    firebase.auth().onAuthStateChanged(async u=>{
      user=u;
      if(!u){ location.replace('login.html'); return; }
      document.documentElement.classList.remove('cloud-wait');
      el('auth-email').textContent=u.email||'';
      // Contas de administrador (dono): liberam o "Implementar tudo".
      const OWNERS=['marlindo0951@gmail.com','marlon0951@icloud.com','carol18bistaffa@gmail.com'];
      const isOwner = OWNERS.includes((u.email||'').trim().toLowerCase());
      const ot=el('owner-tools');
      if(ot){
        ot.hidden = !isOwner;
        ot.classList.toggle('is-owner', isOwner);   // controle à prova de conflito de CSS
        if(isOwner){
          const imp=el('implant-all');
          if(imp && !imp.__wired){ imp.__wired=true; imp.addEventListener('click', async ()=>{
            const has = state.guests.length || state.items.length || state.varCosts.length;
            const ok = has
              ? await confirmDialog('Implementar tudo', 'Isto SUBSTITUI convidados, itens e custos atuais pelo preset completo do casamento. Aportes não são alterados. Continuar?', {danger:true, confirmText:'Implementar'})
              : await confirmDialog('Implementar tudo', 'Preenche o app com o preset completo do casamento (convidados por família, orçamento e custos). Continuar?', {danger:false, confirmText:'Implementar'});
            if(!ok) return; if(typeof window.presetCasamento==='function'){ window.presetCasamento(); } else { implantarTudo(); renderAll(); } toast('Preset carregado — convidados, orçamento e custos','ok');
          }); }
        }
      }
      bar.classList.add('show');
      ref=db.collection('users').doc(u.uid).collection('weddings').doc(window.WEDDING_ID);
      await cloudLoad();
    });
  }

  /* Primeiro acesso: se a nuvem está vazia, sobe o que existe localmente
     (migração suave de quem já usava o modo local). Depois, assina o
     documento — mudanças feitas em outro aparelho aparecem aqui na hora. */
  async function cloudLoad(){
    try{
      const snap=await ref.get();
      if(snap.exists){ applyRemote(snap.data()); toast('Dados carregados da nuvem','ok'); }
      else { await push(); toast('Seus dados locais foram enviados para a nuvem','ok'); }
      // Só agora (dados prontos) oferecemos o onboarding, sem piscar/travar
      if(window.__maybeOnboard) setTimeout(()=>window.__maybeOnboard(), 300);
      if(unsub) unsub();
      unsub=ref.onSnapshot(s=>{
        if(!s.exists || s.metadata.hasPendingWrites) return;      // ignora eco local
        const d=s.data(); if(d.__pushId && d.__pushId===lastPushId) return;
        applyRemote(d);
      });
    }catch(e){ console.error(e); toast('Falha ao sincronizar — dados locais continuam valendo.','warn'); }
  }
  function applyRemote(d){
    applyingRemote=true;                       // evita re-enviar o que acabou de chegar
    try{ const m=migrate(d); state=m.state; save(); renderAll(); }
    finally{ applyingRemote=false; }
  }
  async function push(){
    if(!ref) return;
    lastPushId=uid();
    const data=JSON.parse(JSON.stringify({ items:state.items, funds:state.funds, history:state.history,
      guests:state.guests, varCosts:state.varCosts, settings:state.settings,
      __pushId:lastPushId, updatedAt:Date.now() }));
    await ref.set(data);
    // Também atualiza os snapshots admin (em tempo real p/ cerimonialista)
    try{ if(window.syncAdminSnapshots) window.syncAdminSnapshots(); }catch(e){}
  }
  // Hook chamado por state.save() a cada alteração (debounce de ~0,9s).
  window.__cloudSave=function(){
    if(!user || !ref || applyingRemote) return;
    dot.classList.add('saving');
    clearTimeout(saveTimer);
    saveTimer=setTimeout(async ()=>{
      try{ await push(); }
      catch(e){ console.error(e); toast('Falha ao salvar na nuvem — tento de novo na próxima alteração.','warn'); }
      dot.classList.remove('saving');
    }, 900);
  };

  // Reset total à prova de nuvem: cancela a escuta, apaga o documento e
  // bloqueia novos saves até a página recarregar (senão o onSnapshot repovoa).
  // Publica/remove a cópia pública e filtrada de um compartilhamento.
  // Coleção 'shares/{token}' — somente leitura pública (ver regras do Firestore).
  window.publishShare=async function(sh){
    try{ if(!db||!sh||!sh.token) return; const payload=buildSharePayload(sh);
      payload.updatedAt=Date.now();
      await db.collection('shares').doc(sh.token).set(payload); }catch(e){ console.error('publishShare',e); }
  };
  window.unpublishShare=async function(token){
    try{ if(!db||!token) return; await db.collection('shares').doc(token).delete(); }catch(e){ console.error('unpublishShare',e); }
  };
  // Convites: publica payload público e busca a resposta (RSVP) do convidado.

  // ═══════════ ACESSO ADMIN (link espelho do sistema) ═══════════
  // Cria/atualiza o documento shares/admin_{token} com os dados completos do casamento
  // A cerimonialista abre admin.html#TOKEN e vê os dados em tempo real (via onSnapshot).
  window.publishAdminAccess = async function(access){
    try{
      if(!db || !access || !access.token) return;
      const payload = {
        kind: 'admin',
        name: access.name || '',
        scopes: access.scopes || [],
        active: access.active !== false,
        expires: access.expires || null,
        createdAt: access.createdAt || new Date().toISOString(),
        // Snapshot dos dados: espelho fiel do state
        data: sanitizeStateForAdmin(access.scopes || []),
        updatedAt: Date.now()
      };
      await db.collection('shares').doc('admin_' + access.token).set(payload);
    }catch(e){ console.error('publishAdminAccess', e); }
  };

  window.unpublishAdminAccess = async function(token){
    try{ if(!db || !token) return;
      await db.collection('shares').doc('admin_' + token).delete();
    }catch(e){ console.error('unpublishAdminAccess', e); }
  };

  // Chamado a cada save() do dono: atualiza TODOS os snapshots admin ativos
  window.syncAdminSnapshots = async function(){
    try{
      if(!db) return;
      const accesses = (state && state.adminAccess) || [];
      for(const a of accesses){
        if(a.active === false) continue;
        const payload = {
          kind: 'admin',
          scopes: a.scopes || [],
          data: sanitizeStateForAdmin(a.scopes || []),
          updatedAt: Date.now()
        };
        // merge: preserva `name`, `active`, `expires`, `createdAt`
        await db.collection('shares').doc('admin_' + a.token).set(payload, {merge:true});
      }
    }catch(e){ console.error('syncAdminSnapshots', e); }
  };

  // Sanitiza state: remove só o que NÃO pode ir (por escopo negado)
  function sanitizeStateForAdmin(scopes){
    // Espelho COMPLETO por padrão — remove campos NÃO autorizados
    const s = JSON.parse(JSON.stringify(state || {}));
    // Se financeiro não autorizado: remove items, funds, varCosts, history, e sanitiza suppliers
    if(!scopes.includes('financeiro')){
      delete s.items; delete s.funds; delete s.varCosts; delete s.history;
      if(s.suppliers){ s.suppliers = s.suppliers.map(x=>{ const c={...x}; delete c.total; delete c.paid; delete c.value; return c; }); }
    }
    if(!scopes.includes('convidados')) delete s.guests;
    if(!scopes.includes('convites'))   delete s.invites;
    if(!scopes.includes('tarefas'))    delete s.tasks;
    if(!scopes.includes('cronograma')) delete s.schedule;
    if(!scopes.includes('fornecedores')) delete s.suppliers;
    // NUNCA vazam:
    delete s.shares;         // gestão de compartilhamento é privada
    delete s.adminAccess;    // lista de acessos admin é privada
    // settings: mantém nome/data/local (público via convite), tira outros privados
    return s;
  }

  window.publishInvite=async function(inv, familia){
    try{ if(!db||!inv||!inv.token) return; const p=buildInvitePayload(inv, familia); p.updatedAt=Date.now();
      await db.collection('shares').doc(inv.token).set(p); }catch(e){ console.error('publishInvite',e); }
  };
  window.unpublishInvite=async function(token){
    try{ if(!db||!token) return; await db.collection('shares').doc(token).delete(); await db.collection('rsvp').doc(token).delete(); }catch(e){ console.error(e); }
  };
  window.fetchRSVP=async function(token){
    try{ if(!db||!token) return null; const s=await db.collection('rsvp').doc(token).get(); return s.exists? s.data() : null; }catch(e){ console.error('fetchRSVP',e); return null; }
  };
  window.__cloudReset=async function(){
    try{
      if(unsub){ unsub(); unsub=null; }
      applyingRemote=true;                 // trava __cloudSave
      clearTimeout(saveTimer);
      if(ref) await ref.delete();
    }catch(e){ console.error(e); }
  };

  el('auth-logout').addEventListener('click', async ()=>{
    const ok=await confirmDialog('Sair da conta','Seus dados continuam salvos na nuvem e também neste aparelho.',{danger:false, confirmText:'Sair'});
    if(ok) firebase.auth().signOut();
  });

  init();
})();
