# Sistema de Registro de Ocorrencias em Tempo Real

Sistema web para vigias/controladores registrarem ocorrencias e para a Central de Monitoramento acompanhar tudo em tempo real.

## Tecnologia

- Backend local: Node.js 24 nativo
- Banco: SQLite nativo do Node (`data/ocorrencias.sqlite` no local)
- Tempo real local: Server-Sent Events
- Tempo real no Vercel: atualizacao automatica por consulta a cada 3 segundos
- Frontend: HTML, CSS e JavaScript puro
- Anexos: foto ou video salvo em storage local

## Como rodar

1. Abra o terminal nesta pasta:

```powershell
cd "C:\Users\sandro.camargo\OneDrive - ANIMALIA EMPREENDIMENTOS E PARTICIPACOES SA\Área de Trabalho\PASTAS-AREA DE TRABALHO\curso_python\sandro\Relatorio-equipe"
```

2. Inicie o sistema:

```powershell
npm start
```

3. Acesse:

```text
http://localhost:3000
```

## Como acessar em WAN pelo Render

Quando publicado no Render, use a URL publica do servico:

```text
https://relatorio-equipe.onrender.com
```

No plano gratuito, o Render pode "dormir" quando fica sem uso. O primeiro acesso depois de um tempo pode demorar cerca de 50 segundos.

## Persistencia gratis com Render + Neon/Supabase

Para testar sem pagar plano no Render, use:

- Render Free: aplicacao Node.js
- Neon ou Supabase Free: banco PostgreSQL
- GitHub: codigo e backup/exportacoes

O projeto usa PostgreSQL automaticamente quando a variavel `DATABASE_URL` existe. Sem essa variavel, ele usa SQLite local em `data/ocorrencias.sqlite`.

- Banco em producao: `DATABASE_URL`
- Banco local: `data/ocorrencias.sqlite`
- Anexos no Render Free: filesystem temporario
- Health check: `/healthz`

O `render.yaml` ficou pronto para:

- usar plano `free`
- instalar dependencias com `npm install`
- iniciar com `npm start`
- esperar a variavel secreta `DATABASE_URL`

Passo a passo no Neon:

1. Crie um projeto em https://neon.com.
2. Copie a connection string do banco PostgreSQL.
3. No Render, abra o servico e va em **Environment**.
4. Adicione `DATABASE_URL` com a connection string do Neon.
5. Faca um novo deploy e abra `/healthz`.
6. O campo `database` deve aparecer como `postgres`.

Importante:

- sem `DATABASE_URL`, o Render Free volta para SQLite temporario e pode resetar
- o historico fica permanente no Neon/Supabase
- anexos enviados por foto/video ainda dependem de storage persistente; no Render Free eles podem sumir em redeploy/restart
- o proximo passo de robustez e colocar anexos em storage externo ou hospedar tudo no PC fisico

## Como subir no GitHub

```powershell
git init
git add .
git commit -m "Sistema de ocorrencias em tempo real"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
git push -u origin main
```

## Como publicar na Vercel

1. Entre na Vercel e clique em **Add New Project**.
2. Importe o repositorio do GitHub.
3. Framework Preset: **Other**.
4. Build Command: deixe vazio.
5. Output Directory: deixe vazio.
6. Deploy.

O projeto ja possui `vercel.json` e a pasta `api/`, entao a Vercel vai servir as paginas HTML/CSS/JS da raiz e as rotas `/api/...`.

Importante: a versao da Vercel esta pronta para demonstracao, mas usa memoria da funcao serverless. Isso significa que os dados podem resetar quando a Vercel reiniciar a funcao. Para uso real em producao, use o deploy do Render com disco persistente ou ligue um banco externo, como Vercel Postgres, Neon, Supabase, PostgreSQL interno ou MySQL, e um storage externo para anexos.

## Telas

- `/vigia.html`: cadastro de ocorrencias pelo celular ou computador.
- `/central.html`: painel em tempo real da Central de Monitoramento.
- `/historico.html`: consulta com filtros e exportacao.
- `/admin.html`: base para administracao.

## Funcionalidades prontas

- Login com usuario e senha.
- Perfis de acesso: vigia, central e administrador.
- Registro de ocorrencia com data/hora automatica.
- Anexo de foto ou video.
- Status inicial como `Nova`.
- Painel da Central atualiza automaticamente sem refresh.
- Destaque visual para ocorrencias novas.
- Alerta sonoro opcional no painel.
- Alteracao de status.
- Observacoes da Central.
- Historico com filtros por data, local, tipo, status e colaborador.
- Exportacao CSV compatível com Excel.
- Relatorio imprimivel em PDF pelo navegador.
- Administracao para cadastrar usuarios, locais e tipos de ocorrencia.

## Proximas evolucoes recomendadas

- Troca obrigatoria das senhas iniciais.
- Auditoria detalhada de alteracoes.
- Deploy em servidor interno com HTTPS.
- Migracao para PostgreSQL/Vercel Postgres para alta disponibilidade.
- Storage externo para anexos em producao com volume maior.
