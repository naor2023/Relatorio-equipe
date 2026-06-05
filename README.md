# Sistema de Registro de Ocorrencias em Tempo Real

Sistema web para vigias/controladores registrarem ocorrencias e para a Central de Monitoramento acompanhar tudo em tempo real.

## Tecnologia

- Backend local: Node.js 24 nativo
- Banco: SQLite nativo do Node (`data/ocorrencias.sqlite`)
- Tempo real local: Server-Sent Events
- Tempo real no Vercel: atualizacao automatica por consulta a cada 3 segundos
- Frontend: HTML, CSS e JavaScript puro
- Anexos: foto ou video salvo em `public/uploads`

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

## Usuarios iniciais

- Administrador: `admin` / `admin123`
- Central: `central` / `central123`
- Vigia: `vigia` / `vigia123`

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

O projeto ja possui `vercel.json` e a pasta `api/`, entao a Vercel vai servir as paginas estaticas em `public/` e as rotas `/api/...`.

Importante: a versao da Vercel esta pronta para demonstracao, mas usa memoria da funcao serverless. Isso significa que os dados podem resetar quando a Vercel reiniciar a funcao. Para uso real em producao, o proximo passo e ligar um banco externo, como Vercel Postgres, Neon, Supabase, PostgreSQL interno ou MySQL, e um storage externo para anexos.

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
- Migracao para PostgreSQL/Vercel Postgres para producao.
- Storage externo para anexos em producao.
