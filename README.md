# EventFlow — Gestão de Eventos

Sistema de gestão de eventos: orçamento, aportes, pagamentos, convidados,
estimativas inteligentes de consumo e relatório PDF — pronto para evoluir
para um SaaS multiusuário.

## Estrutura do projeto

```
index.html            → o aplicativo (vistas Orçamento e Convidados)
login.html            → tela de login do SaaS (Firebase Auth)
css/style.css         → toda a identidade visual (tokens compartilhados)
js/config.js          → ★ ÚNICO arquivo que você edita p/ ligar a nuvem
js/utils.js           → helpers puros (moeda, datas, escapeHtml, el)
js/state.js           → dados, migração, sementes, compute(), save()
js/ui.js              → modal, toast, input de moeda (reutilizáveis)
js/orcamento.js       → aportes, pagamentos e renders do financeiro
js/pdf.js             → Relatório Financeiro executivo (jsPDF)
js/convidados.js      → convidados, perfis, custos do evento, Excel
js/app.js             → boot: initState → wirings → renderAll
js/firebase-sync.js   → proteção de rota + sincronização Firestore
firestore.rules       → segurança: cada usuário só vê os próprios dados
Convidados-Inicial.xlsx → planilha inicial organizada por família
```

Cada arquivo começa com um cabeçalho explicando **o que** faz, **por quê**
existe e **como conversa** com os demais — feito para estudo.

## Como funciona (fluxo)

1. `app.js` roda o boot: `initState()` lê o localStorage e migra/semeia →
   os wirings ligam a interface → `renderAll()` desenha tudo a partir de
   `compute()` (fonte única: saldo = recursos − pago, sempre derivado).
2. Qualquer mudança → `save()` → localStorage → (nuvem ativa?) Firestore.
3. Confirmações de convidados alimentam `guestStats()` → as estimativas
   (chope, refrigerante, água, docinhos, bolo…) recalculam em tempo real,
   com público-alvo por perfil e margem de segurança.

## Ativar o modo nuvem/SaaS (login obrigatório)

1. console.firebase.google.com → **criar projeto**
2. **Authentication** → método **E-mail/senha** → ativar
3. **Cloud Firestore** → criar banco → aba *Regras* → colar `firestore.rules`
4. Configurações do projeto → *Seus apps* → **Web** → copiar a config
5. Colar em `js/config.js` (trocando o `null`) → publicar

Pronto: quem abrir o `index.html` sem sessão cai no `login.html`.
No primeiro login, os dados locais sobem para a nuvem automaticamente
(`users/{uid}/weddings/default` — estrutura já pronta p/ múltiplos
casamentos e planos futuros). Com `config.js` em `null`, tudo continua
100 % local, sem login — ideal para desenvolver.

## Publicar no GitHub Pages

Suba a pasta inteira mantendo a estrutura (no site do GitHub: entre em cada
pasta `css/` e `js/` e envie os arquivos dela; `index.html`, `login.html` e
demais ficam na raiz). O endereço do Pages abre direto o `index.html`.

## Planilha inicial

`Convidados-Inicial.xlsx` traz os 137 nomes organizados por família
(Tessaro, Mariane, Harley, Denise, Cardoso, Noivos e Fornecedores — os
fornecedores já confirmados, pois consomem no evento). Complete telefone,
faixa etária (X em Criança/Adolescente/Adulto) e “Consome bebida alcoólica”,
e importe em **Convidados → Importar Excel**. O app novo em folha já nasce
com essa mesma lista embutida.
