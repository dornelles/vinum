# Contexto para revisão do CI/CD do projeto Vinum

Quero revisar e finalizar o pipeline de CI/CD deste projeto, principalmente o arquivo:

```text
.github/workflows/deploy.yml
```

O GitHub Actions já está funcionando corretamente no que diz respeito à infraestrutura de acesso à VPS. A autenticação SSH já foi configurada e validada com sucesso. O workflow consegue conectar na VPS utilizando secrets do repositório:

```text
VPS_HOST
VPS_USER
VPS_PORT
VPS_SSH_KEY
```

O usuário remoto utilizado é `deployer`, e ele já possui acesso aos diretórios da aplicação e ao Docker sem necessidade de `sudo`.

A aplicação está hospedada em uma VPS da Hostinger e existem dois clones independentes do mesmo repositório:

```text
/opt/apps/vinum/staging
/opt/apps/vinum/production
```

O ambiente de homologação utiliza a branch:

```text
staging
```

e o ambiente de produção utiliza:

```text
main
```

O objetivo é que:

```text
push/merge em staging
    ↓
CI
    ↓
deploy em /opt/apps/vinum/staging
```

e:

```text
push/merge em main
    ↓
CI
    ↓
deploy em /opt/apps/vinum/production
```

Atualmente o workflow básico está conceitualmente assim:

```yaml
name: Deploy Vinum

on:
  push:
    branches:
      - staging
      - main

jobs:
  deploy-staging:
    if: github.ref == 'refs/heads/staging'
    runs-on: ubuntu-latest

    steps:
      - name: Deploy staging
        uses: appleboy/ssh-action@v1.2.0
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          port: ${{ secrets.VPS_PORT }}
          script: |
            cd /opt/apps/vinum/staging
            git fetch origin
            git checkout staging
            git reset --hard origin/staging
            docker compose -p vinum-staging up -d --build

  deploy-production:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest

    steps:
      - name: Deploy production
        uses: appleboy/ssh-action@v1.2.0
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          port: ${{ secrets.VPS_PORT }}
          script: |
            cd /opt/apps/vinum/production
            git fetch origin
            git checkout main
            git reset --hard origin/main
            docker compose -p vinum-production up -d --build
```

O acesso SSH já foi testado e funciona. Portanto, neste momento, **não é necessário investigar autenticação SSH ou configuração da Hostinger**. O foco deve ser exclusivamente revisar o projeto e construir um pipeline de CI/CD correto e seguro.

## Objetivo da análise

Antes de modificar o workflow, quero que você examine a arquitetura atual do projeto e identifique como:

- lint;
- formatação;
- type checking;
- testes unitários;
- testes de integração, se existirem;
- build;
- migrations;
- inicialização dos containers;
- health checks;
- falhas de inicialização;

já estão implementados.

Evite duplicar lógica existente no projeto.

O workflow deve utilizar os mecanismos já existentes sempre que eles forem adequados.

## Pipeline desejado

Conceitualmente quero algo próximo de:

```text
push / merge
     ↓
CI
     ├── instalação das dependências
     ├── format check
     ├── lint
     ├── typecheck
     ├── testes
     └── build
           ↓
        tudo OK?
           ↓
         deploy
           ↓
        atualizar código
           ↓
        construir containers
           ↓
        iniciar containers
           ↓
        migrations
           ↓
        health check
```

O deploy **não deve acontecer se alguma validação de CI falhar**.

Portanto, provavelmente haverá um job de CI e os jobs de deploy deverão depender dele usando algo como:

```yaml
needs: ci
```

Mas analise o projeto antes de definir a implementação final.

## Docker Compose

A aplicação utiliza Docker Compose.

Os projetos são isolados usando nomes diferentes:

```text
vinum-staging
vinum-production
```

Por isso os comandos devem preservar essa separação:

```bash
docker compose -p vinum-staging ...
```

e:

```bash
docker compose -p vinum-production ...
```

Verifique também o `docker-compose.yml`, porque anteriormente foi identificado que alguns serviços podem estar associados ao profile:

```text
app
```

Caso isso ainda seja verdade, o deploy provavelmente deve utilizar:

```bash
docker compose \
  -p vinum-staging \
  --profile app \
  up -d --build
```

e:

```bash
docker compose \
  -p vinum-production \
  --profile app \
  up -d --build
```

Confirme isso analisando o Compose atual.

Não assuma.

## Migrations

Este é um ponto especialmente importante.

Existe o arquivo:

```text
scripts/container-start.mjs
```

com este conteúdo:

```js
import { spawn, spawnSync } from 'node:child_process';

const configuredUrl = process.env.DATABASE_URL;
if (!configuredUrl) throw new Error('Configure DATABASE_URL no .env.');

// The .env URL is also used by tools running on the host. Inside Compose,
// reach the same database by its service name and container port.
const databaseUrl = new URL(configuredUrl);
databaseUrl.hostname = 'postgres';
databaseUrl.port = '5432';
process.env.DATABASE_URL = databaseUrl.toString();

const migration = spawnSync(process.execPath, ['--import', 'tsx', 'backend/scripts/deploy.ts'], {
  stdio: 'inherit',
  env: process.env,
});
if (migration.status !== 0) process.exit(migration.status ?? 1);

const backend = spawn('node', ['--import', 'tsx', 'backend/src/server.ts'], {
  stdio: 'inherit',
  env: process.env,
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => backend.kill(signal));
}

backend.on('exit', (code, signal) => {
  if (signal) process.exit(0);
  process.exit(code ?? 1);
});
```

Esse arquivo atualmente faz:

```text
container inicia
     ↓
valida DATABASE_URL
     ↓
converte o host do banco para postgres:5432
     ↓
executa backend/scripts/deploy.ts
     ↓
se deploy.ts falhar:
    encerra o container
     ↓
se deploy.ts funcionar:
    inicia backend/src/server.ts
```

Ou seja, existe forte indicação de que migrations já fazem parte do lifecycle do container.

Antes de adicionar qualquer comando de migration no GitHub Actions, examine:

```text
backend/scripts/deploy.ts
```

e quaisquer scripts relacionados.

Quero saber exatamente:

1. O que `backend/scripts/deploy.ts` executa?
2. Ele executa migrations?
3. Qual tecnologia de migration está sendo usada?
4. É Prisma?
5. Se for Prisma, está utilizando:

```bash
prisma migrate deploy
```

ou equivalente?

6. Existe alguma possibilidade de estar usando:

```bash
prisma migrate dev
```

em staging/produção?

Isso deve ser evitado.

7. O script retorna exit code diferente de zero se a migration falhar?
8. Existem outras tarefas nesse `deploy.ts` além das migrations?
9. Ele é realmente necessário ou poderia ser substituído de forma mais simples?
10. Faz sentido manter a pasta:

```text
scripts/
```

e/ou:

```text
backend/scripts/
```

na arquitetura atual?

Não remova esses scripts apenas por parecerem redundantes. Primeiro determine qual responsabilidade arquitetural eles possuem.

## Avaliar a pasta `scripts`

Quero uma avaliação específica da necessidade da pasta:

```text
scripts/
```

e dos scripts internos ao backend.

Verifique:

```text
scripts/container-start.mjs
backend/scripts/deploy.ts
```

e outros arquivos relacionados.

A análise deve responder:

- qual responsabilidade cada script possui;
- se essa responsabilidade deveria estar no script;
- se está duplicando algo do Dockerfile, package.json, Compose ou GitHub Actions;
- se esses scripts estão sendo usados em desenvolvimento, CI, produção ou apenas Docker;
- se podem ser simplificados;
- se podem ser consolidados;
- se algum deles pode ser eliminado;
- se removê-los exigiria alterar o Dockerfile, Compose ou comandos `npm`.

A intenção não é remover a pasta por estética. A intenção é evitar lógica duplicada e manter uma divisão clara de responsabilidades.

Idealmente:

```text
GitHub Actions
    → valida CI e solicita deploy

Docker/Compose
    → define infraestrutura e lifecycle

container-start
    → inicialização do container, se realmente necessário

deploy.ts
    → tarefas de preparação do backend, se realmente necessário

server.ts
    → aplicação
```

Avalie se essa separação faz sentido no projeto atual.

## Inicialização da API

O `container-start.mjs` inicia a API assim:

```js
spawn('node', ['--import', 'tsx', 'backend/src/server.ts'], ...)
```

Quero que você avalie também isso.

A aplicação de produção aparentemente executa TypeScript diretamente através do `tsx`.

Analise:

- se `tsx` existe nas dependências disponíveis dentro da imagem final;
- se isso é intencional;
- se seria mais adequado executar código compilado em produção;
- se o Dockerfile atualmente constrói uma versão `dist`;
- se existe uma razão arquitetural para rodar:

```bash
node --import tsx backend/src/server.ts
```

em vez de algo como:

```bash
node dist/backend/server.js
```

Não altere isso automaticamente. Apenas avalie primeiro o projeto inteiro e determine o impacto.

## Signals e lifecycle

O `container-start.mjs` possui:

```js
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => backend.kill(signal));
}
```

Isso provavelmente existe para propagar os sinais do Docker para o processo backend.

Verifique se esse comportamento é necessário e se está correto.

Quero evitar uma alteração que prejudique graceful shutdown do container.

## CI

Analise o `package.json`.

Identifique os scripts disponíveis, especialmente algo semelhante a:

```text
format
format:check
lint
typecheck
test
build
check
```

Caso exista um comando agregado como:

```bash
npm run check
```

verifique o que ele executa.

Apesar de ser possível executar:

```yaml
- run: npm run check
```

provavelmente prefiro separar as etapas no GitHub Actions:

```yaml
- name: Format check
  run: npm run format:check

- name: Lint
  run: npm run lint

- name: Type check
  run: npm run typecheck

- name: Tests
  run: npm test

- name: Build
  run: npm run build
```

porque isso deixa o diagnóstico do CI mais claro.

Mas confirme os comandos reais no projeto.

Não invente scripts que não existam.

## Testes

Examine os testes existentes.

Quero saber:

- framework utilizado;
- quantidade/tipos de testes;
- se são unitários;
- se existem testes de integração;
- se algum teste depende de PostgreSQL;
- se o CI precisa iniciar serviços auxiliares;
- se é possível rodar todos apenas com:

```bash
npm test
```

- se é necessário definir variáveis de ambiente para os testes.

Se os testes precisarem de banco, determine se o workflow deve usar:

```yaml
services:
  postgres:
```

ou se existe outra estratégia já prevista no projeto.

Não adicione infraestrutura de testes se ela não for necessária.

## Build

Verifique:

```text
Dockerfile
package.json
```

e identifique:

- como o build é realizado;
- se existe build do frontend;
- se existe build do backend;
- se `npm run build` valida ambos;
- se o Dockerfile executa o mesmo build;
- se o build no CI e no Docker é intencionalmente duplicado.

É aceitável executar build no CI mesmo que o Docker execute novamente durante a criação da imagem, porque o primeiro serve como validação.

## Health checks

Examine:

```text
docker-compose.yml
backend
frontend
```

para identificar health checks já existentes.

Se a API tiver algo como:

```text
/api/health
```

utilize isso após o deploy.

O workflow deveria idealmente verificar se os containers ficaram funcionando.

Por exemplo:

```bash
docker compose \
  -p vinum-staging \
  --profile app \
  ps
```

e, se apropriado:

```bash
curl -f http://127.0.0.1:PORTA/api/health
```

Mas confirme portas e endpoints no projeto.

Não assuma as portas.

Avalie também se é melhor utilizar o próprio status `healthy` do Docker em vez de um `sleep` arbitrário.

Seria melhor algo conceitualmente como:

```text
aguardar container ficar healthy
```

do que:

```bash
sleep 10
```

se isso puder ser implementado de forma simples e confiável.

## Falhas de deploy

O script remoto deverá utilizar:

```bash
set -e
```

ou equivalente, para que qualquer falha interrompa o deploy.

Quero que uma falha em qualquer um destes passos resulte em falha do GitHub Actions:

```text
git fetch
git checkout/reset
docker compose build/up
migration
health check
```

Não quero um workflow verde se a aplicação não estiver saudável.

## Git

Nos diretórios da VPS já existem clones separados.

Por isso não é necessário executar `git clone`.

A atualização pode continuar aproximadamente assim:

```bash
git fetch origin
git checkout staging
git reset --hard origin/staging
```

e:

```bash
git fetch origin
git checkout main
git reset --hard origin/main
```

Avalie se isso é adequado.

A intenção é garantir que o conteúdo local da VPS corresponda exatamente ao commit remoto.

Não deve haver alterações manuais de código dentro desses clones.

Arquivos de ambiente e dados persistentes não devem ser versionados.

## Persistência

Tenha cuidado com volumes Docker.

Não utilize algo como:

```bash
docker compose down -v
```

porque isso pode remover volumes persistentes, inclusive PostgreSQL.

O deploy deve preservar dados.

Preferimos algo como:

```bash
docker compose up -d --build
```

para recriar apenas os serviços necessários.

## Concorrência

Inclua proteção contra deploys simultâneos da mesma branch, provavelmente:

```yaml
concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: false
```

Assim um segundo push não executa outro deploy simultaneamente sobre o mesmo diretório/Compose.

## Segurança

Não exponha secrets nos logs.

Não imprima:

```text
DATABASE_URL
senhas
SSH private key
tokens
```

O workflow deve continuar utilizando GitHub Secrets.

Não há necessidade de armazenar a chave privada na VPS.

## Produção versus staging

Os dois ambientes precisam permanecer isolados.

Staging:

```text
branch: staging
path: /opt/apps/vinum/staging
compose project: vinum-staging
```

Production:

```text
branch: main
path: /opt/apps/vinum/production
compose project: vinum-production
```

Não misture containers, volumes ou nomes de projeto entre os dois ambientes.

## O que eu quero como resultado

Primeiro faça uma análise do projeto.

Antes de editar qualquer arquivo, apresente:

1. como funciona atualmente o build;
2. como funcionam atualmente as migrations;
3. o papel de `scripts/container-start.mjs`;
4. o papel de `backend/scripts/deploy.ts`;
5. se esses scripts ainda são necessários;
6. como funciona a inicialização da API;
7. quais comandos de lint, typecheck, teste e build existem;
8. quais testes dependem de infraestrutura;
9. como funcionam os health checks;
10. quais riscos existem no deploy atual.

Depois proponha a arquitetura final do CI/CD.

Somente depois disso, edite:

```text
.github/workflows/deploy.yml
```

e, caso seja realmente necessário, outros arquivos relacionados.

Quero evitar mudanças desnecessárias.

A prioridade é:

```text
simplicidade
+
previsibilidade
+
segurança
+
baixo acoplamento
+
deploy reproduzível
```

O resultado ideal é que:

```text
merge/push staging
    ↓
CI passa
    ↓
deploy staging
    ↓
containers healthy
```

e:

```text
merge/push main
    ↓
CI passa
    ↓
deploy production
    ↓
containers healthy
```

Se migrations estiverem corretamente integradas ao startup do container, não as duplique no GitHub Actions.

Se não estiverem, proponha uma forma clara e idempotente de executá-las.

Também avalie se o atual mecanismo de startup via:

```text
scripts/container-start.mjs
```

é realmente a melhor abordagem ou se existe uma simplificação segura, mas não altere isso sem justificar tecnicamente o impacto.
