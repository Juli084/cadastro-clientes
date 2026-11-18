# Carteira de clientes

Cadastro de clientes para pequeno negócio, como assistência técnica, loja, clínica ou
prestador de serviço. Junta o contato, o histórico de cada atendimento e o dia de retornar,
para nenhum orçamento ficar esquecido.

API em Node.js com Fastify, Prisma e MongoDB; interface em React.

## O que faz

- **Painel do dia.** Mostra quantos retornos são para hoje e quantos estão atrasados, os
  clientes e leads, e as vendas do mês. Os números de retorno funcionam como filtro.
- **Ficha do cliente.** Guarda telefone, e-mail, CPF ou CNPJ, cidade e como o cliente conheceu o
  negócio, além de etiquetas livres (vip, revenda, iphone) e da situação: lead, cliente ou
  inativo. Tem botão para abrir o WhatsApp e para ligar.
- **Histórico.** Cada contato fica registrado: anotação, ligação, WhatsApp, visita, orçamento ou
  venda, com valor, data e quem atendeu. Ao registrar, dá para marcar o retorno em um toque
  (amanhã, 3 dias, 1 semana, 1 mês). Registrar uma venda para um lead já o transforma em
  cliente.
- **Busca.** Encontra por nome sem precisar de acento ("joao" acha "João"), por pedaço do
  telefone, por e-mail ou por documento. Filtra por situação, etiqueta e retorno.
- **Sem cadastro duplicado.** Telefone ou e-mail que já existe é recusado, com um atalho para
  abrir o cadastro existente.
- **Planilha.** Exporta tudo em CSV que o Excel em português abre direto.

## Segurança

Cadastro de cliente é dado pessoal. As decisões abaixo têm teste automatizado.

- **Login obrigatório.** No primeiro acesso, o sistema pede para criar o usuário dono. Depois
  disso, a rota de criação fecha.
- **Senha com scrypt**, que já vem no Node, com os parâmetros recomendados pela OWASP
  (N = 2^17, r = 8, p = 1) e sal aleatório. O formato guardado inclui os parâmetros, para poder
  endurecer depois sem invalidar senhas antigas.
- **Sessão em cookie `HttpOnly`, `Secure` e `SameSite=Strict`.** O token tem 256 bits, e o banco
  guarda só o SHA-256 dele: quem copiar o banco não consegue usar as sessões. A sessão vence
  em 7 dias, e "Sair" apaga a sessão no servidor.
- **Mesma resposta para e-mail inexistente e senha errada**, e no mesmo tempo: com e-mail
  inexistente, a senha é comparada com um hash falso. Assim não dá para descobrir quem tem
  conta.
- **Limite de 5 tentativas de login por minuto**, por IP e e-mail.
- **CSRF em três camadas:** o cookie `SameSite=Strict`; a recusa de pedido que altera dados vindo
  de outra origem; e a aceitação só de corpo em JSON, que um formulário de outro site não
  consegue enviar.
- **Busca sem injeção.** O `contains` do Prisma no MongoDB vira expressão regular sem escape:
  uma busca por `.*` trazia a carteira inteira. Agora o texto é escapado antes, e há teste
  com `.*`, `(a+)+$` e `[`.
- **CSV sem injeção de fórmula.** Célula que começa com `=`, `+`, `-` ou `@` ganha um apóstrofo
  na frente. Um cliente cadastrado como `=HYPERLINK(...)` não vira link ao abrir a planilha.
- **Respostas filtradas pelo schema.** Campos internos, como o `nomeBusca` e o hash da senha,
  nunca saem da API. Erro inesperado responde mensagem genérica, e o detalhe fica só no log, já
  sem o cookie.
- **Exclusão definitiva.** Excluir um cliente apaga também o histórico dele, o que atende ao
  pedido de eliminação da LGPD. O campo "aceita receber promoções" registra o consentimento
  para mensagens de divulgação.

## Uma armadilha que os testes pegaram

No MongoDB, o Prisma traduz `proximoContato < hoje` de um jeito em que `null` conta como menor
que qualquer data. Cliente sem retorno marcado aparecia como "atrasado" no painel e na lista.
Os filtros agora pedem `not: null` explicitamente, e um teste de regressão cobre o caso.

## Rodando localmente

Requer Node 22.12 ou mais novo e Docker.

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
npm install
npm run dev
```

Abra `http://localhost:5173`. O Vite repassa `/api` para a API na porta 3333, então interface
e API ficam na mesma origem e o cookie de sessão funciona sem CORS. O Prisma exige o MongoDB
em modo réplica; o `docker-compose.yml` sobe um nó único já configurado.

## Testes

```bash
cd backend && npm test          # 36 testes: regras, CSV, datas, senha e a API contra o MongoDB
cd frontend && npm run test:e2e # o fluxo inteiro no navegador
```

O teste de ponta a ponta sobe a API e a interface e percorre o uso real:

1. criar a conta no primeiro acesso;
2. cadastrar um cliente, com CPF inválido recusado;
3. registrar uma venda com retorno;
4. ser impedido de cadastrar o mesmo telefone;
5. buscar sem acento e exportar a planilha;
6. sair, errar a senha e entrar de novo;
7. excluir o cliente.

Os testes só apagam dados de um MongoDB local cujo banco tenha nome terminado em `_teste` ou
`_e2e`. Com qualquer outro endereço, recusam antes de começar.

A integração contínua roda tudo isso em cada push e pull request.

## Publicando

- A interface (`frontend/dist`) e a API precisam responder no mesmo site, com `/api` apontando
  para a API. Funciona com um proxy reverso (Nginx, Caddy) ou com uma hospedagem que faça
  esse roteamento.
- Se a interface ficar em outro domínio, preencha `ORIGEM_DO_FRONTEND` com o endereço dela.
- Em produção, mantenha `COOKIE_SEGURO` ligado: é o padrão quando a variável não existe.
- Atrás de proxy, use `ATRAS_DE_PROXY=true`, para o limite de tentativas usar o IP real de
  quem acessa.

## Limitações

- **Um negócio por instalação.** Todos os usuários veem todos os clientes. Ainda não há tela
  para convidar outros usuários: hoje existe só o dono.
- **Sem lembrete ativo.** O retorno aparece no painel, mas não chega por e-mail ou notificação.
- **Sem importação.** Por enquanto, a planilha só sai; não entra.
- **MongoDB com Prisma 6.** O Prisma 7 ainda não tem conector de MongoDB, e a própria
  documentação do Prisma orienta usar o 6.19 com esse banco.

## Histórico

O projeto começou em 2023 como um cadastro de nome e e-mail. Em 2026, foi atualizado para
Fastify 5, React 19 e Vite 8, com validação e testes. Depois, virou a carteira de clientes,
com login, histórico, retornos, painel e exportação.
