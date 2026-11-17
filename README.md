# Cadastro de clientes

Cadastro simples de clientes: API em Node.js com Fastify, Prisma e MongoDB, e interface em React.

## Estrutura

```
backend/    API (Fastify 5, Prisma 6, TypeScript)
frontend/   interface (React 19, Vite, Tailwind CSS)
docker-compose.yml   MongoDB local em modo réplica
```

## API

| Método | Rota | Resposta |
|---|---|---|
| `GET` | `/health` | `200` |
| `GET` | `/customers` | `200` com a lista, em ordem de cadastro |
| `POST` | `/customers` | `201` com o cliente criado; `400` com os campos inválidos; `409` se o e-mail já existe |
| `DELETE` | `/customers/:id` | `204`; `400` para id malformado; `404` se não existe |

- O corpo é validado com JSON Schema no próprio Fastify: nome de 2 a 120 caracteres e e-mail válido.
  Campos extras, como `status`, são descartados.
- O e-mail é guardado em minúsculas e tem índice único.
- Erros inesperados respondem `500` com mensagem genérica; o detalhe fica só no log. Nenhuma
  mensagem do banco chega ao cliente.
- O CORS libera só a origem do frontend (`CORS_ORIGIN`).

## Rodando localmente

Requer Node 22 e Docker.

```bash
docker compose up -d --wait
```

```bash
cd backend
cp .env.example .env
npm install
npm run db:push
npm run dev
```

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

O Prisma exige o MongoDB em modo réplica; o `docker-compose.yml` sobe um nó único já configurado.

## Testes

```bash
cd backend
npm test
```

Os testes rodam contra um banco separado (`cadastro_teste`) no MongoDB local: cadastro, normalização,
validação, e-mail repetido, ordem da lista, remoção, id malformado sem vazar erro do banco e CORS. A
integração contínua sobe o mesmo MongoDB com `docker compose` e roda os testes, o lint e o build.

## Histórico

O projeto começou em 2023. Em 2026 foi atualizado: Fastify 5, Prisma 6.19, React 19, Vite 8 e
Tailwind 4, com validação, tratamento de erro, testes e integração contínua.
