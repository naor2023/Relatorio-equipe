# Sistema de Registro de Ocorrencias em Tempo Real

Sistema web para vigias/controladores registrarem ocorrencias e para a Central de Monitoramento acompanhar tudo em tempo real.

## Tecnologia

- Backend local: Node.js 24 nativo
- Banco: SQLite nativo do Node (`data/ocorrencias.sqlite` no local)
- Tempo real local: Server-Sent Events
- Tempo real no Vercel: atualizacao automatica por consulta a cada 3 segundos
- Frontend: HTML, CSS e JavaScript puro
- Anexos: foto ou video salvo em storage local persistente

## Como rodar

1. Abra o terminal nesta pasta:

```powershell
cd "C:\Users\sandro.camargo\OneDrive - ANIMALIA EMPREENDIMENTOS E PARTICIPACOES SA\Área de Trabalho\PASTAS-AREA DE TRABALHO\curso_python\sandro\NOVO PROGRAMA"
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

## Persistencia profissional no Render

Para manter o historico e os anexos por anos sem resetar a cada deploy, o projeto agora esta preparado para usar disco persistente no Render.

- Banco SQLite: `APP_DATA_DIR/database/ocorrencias.sqlite`
- Anexos: `APP_DATA_DIR/uploads`
- Health check: `/healthz`

O `render.yaml` ficou pronto para:

- usar plano `starter`
- montar disco persistente em `/var/data`
- definir `APP_DATA_DIR=/var/data`

Importante:

- sem disco persistente, o filesystem do Render e efemero
- o plano gratuito nao atende esse requisito de banco permanente
- o proximo degrau de robustez, se voces quiserem no futuro, e migrar para Postgres gerenciado e storage dedicado para anexos

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
