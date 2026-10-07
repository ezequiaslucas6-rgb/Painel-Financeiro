# 💰 Minhas Finanças — Eu + Esposa

App de gastos da casa para duas pessoas. Cada um entra com o seu PIN, **os dois veem todos os lançamentos** e cada gasto mostra **quem lançou**. Os totais, a regra 50-30-20 e os relatórios somam a casa toda; o extrato filtra por pessoa.

Os dados continuam na sua planilha do Google (aba **Painel Financeiro**), então as fórmulas e o resumo que você já tem seguem funcionando.

```
Celular dela ─┐                         ┌─ Planilha "Painel Financeiro"
              ├─ App (GitHub Pages/APK) ─ Apps Script (API) ─┤  A:F = lançamentos
Seu celular ──┘                         └─ coluna I = "Quem"
```

| Pasta | O que é |
|---|---|
| `apps-script/` | `Codigo.gs` (API) e `appsscript.json`: vão no editor do Apps Script da planilha |
| `web/` | O app (PWA). É o que o GitHub Pages publica e o que vai dentro do APK |
| `assets/` | Ícone usado para gerar os ícones do Android |
| `.github/workflows/` | `pages.yml` publica o site, `apk.yml` gera o APK |

---

## 1. Planilha e Apps Script (uma vez)

Os dados ficam numa planilha do Google Sheets com a aba **Painel Financeiro**. O script cuida disso para você:

1. Abra o seu projeto do Apps Script (em [script.google.com](https://script.google.com), ou na planilha em **Extensões → Apps Script**).
2. Substitua todo o conteúdo do `Código.gs` pelo arquivo [`apps-script/Codigo.gs`](apps-script/Codigo.gs) e salve (ícone de disquete). Se houver um arquivo `app.html` antigo, pode apagar.
3. **Montar a planilha:** no topo do editor, escolha a função **`montarPlanilha`** e clique em **Executar** (autorize na primeira vez).
   - Se o script está dentro de uma planilha, ele usa essa planilha.
   - Se o script é avulso, ele **cria uma planilha nova "Painel Financeiro" no seu Google Drive**.
   - O link da planilha aparece no **Registro de execução**, embaixo. Se a aba já existir, nada é alterado.
4. **Criar os PINs:** procure a função `configurarPinsNoEditor` no código, escreva um PIN (4 a 8 números) para `'Eu'` e para `'Esposa'` (e, se quiser, os nomes em `NOMES`), salve, escolha **`configurarPinsNoEditor`** e clique em **Executar**. **Depois apague os PINs do código e salve de novo.**
   - Se o script está dentro da planilha, dá também para usar o menu **💰 Minhas Finanças → Configurar app** na própria planilha.
5. **Coluna "Quem"**: o script grava quem lançou na **coluna I**. Se a coluna I da sua aba já tiver outro uso, mude `COL_QUEM` no topo do `Codigo.gs` para uma coluna livre (ex.: `14` = N).
6. **Implantar:** **Implantar → Nova implantação → tipo "App da Web"**
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
   - Copie a URL que termina em `/exec`.

> Quando alterar o `Codigo.gs` depois, use **Implantar → Gerenciar implantações → editar (lápis) → Versão: nova versão**. Assim a URL continua a mesma.

**Segurança:** "Qualquer pessoa" só significa que a URL responde fora do Google. Sem o PIN nada é lido nem gravado; o PIN fica guardado só como hash, e 8 tentativas erradas bloqueiam o usuário por 15 minutos. Trocar um PIN desconecta os aparelhos que usavam o PIN antigo.

## 2. Colocar a URL no app

Edite [`web/config.js`](web/config.js) e cole a URL em `apiUrl`. Assim os dois celulares já abrem direto no login.
(Se deixar vazio, o app pede a URL na primeira vez.)

## 3. GitHub Pages

1. No GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions** (não use "Deploy from a branch").
   - Se ficar em "Deploy from a branch", o `index.html` da raiz redireciona para `/web/` e o app abre em `https://ezequiaslucas6-rgb.github.io/Painel-Financeiro/web/`.
2. Faça um push (ou **Actions → Publicar no GitHub Pages → Run workflow**).
3. O site fica em `https://ezequiaslucas6-rgb.github.io/Painel-Financeiro/`.

Os workflows só publicam a partir da **branch padrão** do repositório.
O GitHub Pages gratuito exige repositório **público**; o código pode ser público sem problema, porque os dados ficam na planilha e só abrem com PIN. **Não** coloque PINs nem a planilha no repositório.

## 4. APK para Android

Há dois jeitos — escolha um:

**A) Instalar pelo navegador (mais simples, sempre atualizado).** Abra o site do Pages no Chrome do Android → menu ⋮ → **Instalar app**. O Chrome gera um APK (WebAPK) com ícone, tela cheia e funcionamento offline.

**B) APK de verdade (arquivo `.apk`).** A cada push o workflow **Gerar APK** compila o app com Capacitor e publica em **Releases → "apk"**:
`https://github.com/ezequiaslucas6-rgb/Painel-Financeiro/releases/download/apk/MinhasFinancas.apk`
Baixe no celular e permita *instalar apps de fontes desconhecidas*.

Para que versões novas instalem **por cima** da antiga (sem desinstalar), crie uma chave fixa uma única vez:

```bash
keytool -genkeypair -v -keystore debug.keystore -storepass android -alias androiddebugkey \
  -keypass android -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Minhas Financas"
base64 -w0 debug.keystore   # copie a saída
```

Cole a saída em **Settings → Secrets and variables → Actions → New repository secret** com o nome `ANDROID_KEYSTORE_BASE64`. Guarde o `debug.keystore` fora do repositório.

## Testar sem planilha

Na primeira tela, toque em **"Só quero ver uma demonstração"**. Localmente: `npm run serve` e abra `http://localhost:8080`.

---

## Falhas encontradas no código original e o que mudou

| # | Problema no original | Correção |
|---|---|---|
| 1 | Só funcionava dentro do Google (`google.script.run`); no GitHub Pages/APK o app abria em "modo demonstração" e nada era salvo. | O Apps Script virou uma API JSON (`doPost`) chamada por `fetch`. |
| 2 | Nenhum controle de acesso: publicado como "Qualquer pessoa", qualquer um com a URL lia e apagava tudo. | Login por pessoa com PIN (hash + token HMAC), bloqueio após 8 erros. |
| 3 | Sem noção de quem lançou. | Coluna **Quem** gravada pelo servidor a partir do login (o celular não consegue se passar pelo outro). Badge com o nome em cada gasto, card "Quem gastou", filtro por pessoa e comparação por pessoa nos relatórios. |
| 4 | O que um lançava o outro só via ao reabrir o app. | Atualização automática a cada 30 s e ao voltar para o app, com aviso "Esposa lançou R$ X em Mercado". |
| 5 | Data podia ficar **um dia antes** na planilha: usava o fuso do script, não o da planilha. | Leitura e gravação no fuso da planilha (`getSpreadsheetTimeZone`). |
| 6 | Digitar **"1.500"** gravava **R$ 1,50**. | `1.500` = mil e quinhentos; `1,5`/`1.5` = um e meio; `1.234,56` continua certo (mesma regra no servidor). |
| 7 | Valores digitados como texto na planilha ("1.234,56") eram ignorados em silêncio. | Conversão de texto para número no servidor. |
| 8 | Internet instável + "Tentar de novo" podia **duplicar** o gasto. | Cada gasto novo leva um id único; o servidor ignora reenvios por 10 min. |
| 9 | Editar/excluir conferia só data e valor: com duas pessoas mexendo, dava para alterar o lançamento errado. | Confere data, valor, descrição e categoria antes de mudar a linha. |
| 10 | `salvarAjustes` gravava sem trava e sem validar a soma das metas no servidor. | Trava (`LockService`) e validação no servidor também. |
| 11 | `waitLock` estourava com erro técnico ("Lock timeout"). | `tryLock` com mensagem clara. |
| 12 | Linha vazia era detectada só pela coluna A (podia sobrescrever uma linha com A vazia e outros campos preenchidos). | Só usa linha com A:F totalmente vazias. |
| 13 | Lista de categorias lida de uma célula fixa (`C13`). | Lê a validação da primeira linha de dados e só usa se for lista. |
| 14 | O app redesenhava a tela inteira sem preservar o campo em uso (só a busca era tratada). Com a atualização automática isso apagaria o que se digita. | O render preserva foco/cursor de qualquer campo; a sincronização não redesenha com o formulário ou os Ajustes abertos. |
| 15 | Sem internet, tela de erro. | Últimos dados ficam no aparelho e aparecem com aviso "sem conexão"; PWA com service worker. |
| 16 | No Android o botão voltar fechava o app com o formulário aberto. | Voltar fecha o formulário, depois volta para o Início, depois sai. |
| 17 | "Maior gasto em um dia" mostrava R$ 1,00 quando o maior gasto do mês era menor que R$ 1. | Corrigido. |
