# Deploy em containers na VPS

O host precisa de Docker, Docker Compose e Nginx; Node.js e npm ficam nas imagens. Cada ambiente usa uma cópia do repositório e seu próprio `.env`.

## Variáveis por ambiente

Além das variáveis de banco e aplicação descritas em `.env.example`, configure:

| Ambiente | `PORT` (API) | `FRONTEND_HOST_PORT` | `POSTGRES_HOST_PORT` | `PUBLIC_APP_URL`                       |
| -------- | -----------: | -------------------: | -------------------: | -------------------------------------- |
| Staging  |       `3006` |               `5176` |               `5436` | `https://vinum-staging.bitrium.com.br` |
| Produção |       `3005` |               `5175` |               `5435` | `https://vinum.bitrium.com.br`         |

Use `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` e `POSTGRES_VOLUME_NAME` diferentes em cada ambiente. A `DATABASE_URL` continua usando `localhost` e a porta publicada do banco, por exemplo `localhost:5436` em staging. Ao iniciar, o container da API troca somente o host e a porta dessa URL por `postgres:5432`; a senha e o banco permanecem os mesmos.

O container da API grava uploads em `backend/uploads` na pasta do ambiente. O usuário do container é `1000:1000` por padrão; se o usuário dono dessa pasta na VPS tiver outros IDs, configure `APP_UID` e `APP_GID` no `.env` usando `id -u` e `id -g`. Preserve essa pasta e o volume PostgreSQL nos backups.

## Iniciar e atualizar

Staging:

```bash
cd /opt/apps/vinum/staging
git pull --ff-only
docker compose -p vinum-staging --profile app up -d --build
docker compose -p vinum-staging --profile app ps
docker compose -p vinum-staging --profile app logs --tail=100 api
```

Produção: use `/opt/apps/vinum/production` e `-p vinum-production` nos mesmos comandos. O container da API aplica as migrações pendentes antes de iniciar o servidor; a inicialização da API cria os dados administrativos iniciais quando necessários. Não é preciso executar `npm ci`, `prisma:deploy`, `prisma:seed` ou `npm run build` no host.

As três portas publicadas pelo Compose ficam limitadas a `127.0.0.1`. Os containers têm reinício automático. Verifique staging com:

```bash
curl -fsS http://127.0.0.1:3006/api/health
curl -fsSI http://127.0.0.1:5176/
```

## Nginx do host

Mantenha os blocos HTTPS, certificados e as rotas `/api/` e `/uploads/` existentes. Dentro do bloco HTTPS de staging, troque apenas `location /` por:

```nginx
location / {
    proxy_pass http://127.0.0.1:5176;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

No bloco HTTPS de produção, use `127.0.0.1:5175`. As rotas `/api/` e `/uploads/` continuam apontando para `127.0.0.1:3006` em staging e `127.0.0.1:3005` em produção. As antigas diretivas `root`, `index` e `try_files` do frontend deixam de ser necessárias no Nginx do host.

Depois de editar os arquivos:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Não use `docker compose down -v`: isso remove o volume do banco.
