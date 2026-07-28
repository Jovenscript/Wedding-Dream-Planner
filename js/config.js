/* ═════════════════════════════════════════════════════════════════════
   config.js — A ÚNICA COISA QUE VOCÊ EDITA PARA LIGAR O MODO NUVEM/SaaS
   Com FIREBASE_CONFIG = null → o sistema roda 100% local (localStorage),
   sem tela de login, exatamente como sempre funcionou.
   Para ativar login + nuvem:
     1. console.firebase.google.com → criar projeto
     2. Authentication → ativar "E-mail/senha"
     3. Cloud Firestore → criar banco (produção) → colar firestore.rules
     4. Configurações do projeto → "Seus apps" → Web → copiar a config
     5. Colar abaixo no lugar do null e publicar
   ═════════════════════════════════════════════════════════════════════ */
const firebaseConfig = {
  apiKey: "AIzaSyAxbgXptautbR5Za8677fMolcWIRtr-D7c",
  authDomain: "wedding-dreams-71032.firebaseapp.com",
  projectId: "wedding-dreams-71032",
  storageBucket: "wedding-dreams-71032.firebasestorage.app",
  messagingSenderId: "789020951087",
  appId: "1:789020951087:web:faac7a215d284e472afcda"
};
