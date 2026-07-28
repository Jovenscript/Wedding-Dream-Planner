/* ═════════════════════════════════════════════════════════════════════
   config.js — A ÚNICA COISA QUE VOCÊ EDITA PARA LIGAR O MODO NUVEM/SaaS
   Com window.FIREBASE_CONFIG = null → o sistema roda 100% local.
   Preenchido → ativa login (login.html) + sincronização na nuvem.
   ═════════════════════════════════════════════════════════════════════ */
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyAxbgXptautbR5Za8677fMolcWIRtr-D7c",
  authDomain: "wedding-dreams-71032.firebaseapp.com",
  projectId: "wedding-dreams-71032",
  storageBucket: "wedding-dreams-71032.firebasestorage.app",
  messagingSenderId: "789020951087",
  appId: "1:789020951087:web:faac7a215d284e472afcda"
};

// Preparado para múltiplos casamentos por usuário (planos futuros do SaaS):
window.WEDDING_ID = 'default';
