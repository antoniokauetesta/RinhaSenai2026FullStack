# Gateway de Pagamentos Fake — Rinha SENAI 2026

Implementação completa: backend (Node.js + Fastify), frontend (React + Vite + React Router) e
banco SQLite (Prisma ORM + adapter `@libsql/client`), servidos juntos na porta `3000`.

> ⚠️ **Importante**: este código foi escrito e revisado estaticamente (sintaxe verificada,
> JSX balanceado, lógica auditada linha a linha), mas **não pôde ser instalado nem executado**
> no ambiente onde foi gerado, pois ele não tem acesso à rede/registro npm. Rode os comandos
> abaixo na sua máquina antes de submeter, e ajuste qualquer detalhe que o `npm install`
> revelar (ex: pequenas diferenças de versão de pacote).

## Como rodar

```bash
cd participants/seu-time
npm install
npm run build
npm start
# http://localhost:3000
```

O `npm install` na raiz instala as dependências dos dois workspaces (`backend` e `frontend`).
O `postinstall` do backend já roda `prisma generate` e `prisma db push` automaticamente,
criando `backend/data.db` com o schema aplicado.

Se preferir rodar cada parte separadamente em dev:

```bash
# terminal 1
npm run dev:backend     # Fastify com --watch, porta 3000

# terminal 2
npm run dev:frontend    # Vite dev server, porta 5173, com proxy /api -> :3000
```

## Estrutura

```
participants/seu-time/
├── backend/
│   ├── src/
│   │   ├── index.js          # bootstrap Fastify, serve frontend + API, SPA fallback
│   │   ├── db.js             # PrismaClient + libsql adapter + PRAGMAs de tuning
│   │   ├── lock.js           # withLock() — exclusão mútua em memória por chave
│   │   ├── rules.js          # regras de negócio puras (bandeira, juros, taxa, validação)
│   │   └── routes/
│   │       ├── transactions.js  # POST/GET/refund
│   │       ├── balance.js       # GET /api/balance
│   │       └── health.js        # GET /api/health
│   ├── prisma/schema.prisma
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   ├── index.css          # design system (ver seção abaixo)
│   │   ├── api.js             # helper fetch + formatação de moeda/data
│   │   └── pages/
│   │       ├── Dashboard.jsx  # formulário de cobrança + saldo + preview de taxa
│   │       ├── History.jsx    # lista paginada (deep link via query params)
│   │       └── Detail.jsx     # detalhe de uma transação + refund
│   ├── vite.config.js
│   └── package.json
├── package.json   (workspaces root)
├── info.json
└── .gitignore
```

## Regras de negócio implementadas (`backend/src/rules.js`)

- **Bandeira** pelo 1º dígito do `card_number`: `4`→visa 2.5%, `5`→mastercard 3%, `3`→amex 3.5%,
  `6`→elo 4%. Qualquer outro dígito → `422`.
- **Juros compostos**: 1x = 0%; 2–6x = 2%/mês; 7–12x = 4%/mês.
  `total_with_interest = ceil(amount_cents * (1+rate)^installments)`.
  `installment_amount = ceil(total_with_interest / installments)`.
  Parcela `< 1000` centavos → `422`.
- **Taxa da bandeira incide sobre `total_with_interest`** (valor com juros), não sobre
  `amount_cents` — essa é a pegadinha citada no enunciado, e está implementada corretamente em
  `calculateFee()`.
- **Limite diário**: R$ 5.000,00 por `card_last4`, somando apenas transações `approved` do dia
  corrente (UTC 00:00–23:59). Calculado e checado **dentro do lock por cartão**, então duas
  requisições concorrentes no mesmo cartão não conseguem furar o limite.
- **Cartão começando com `9999`** → sempre `declined` (mas a transação é salva).
- **Refund**: só transações `approved` podem virar `refunded`; usa `updateMany` com
  `WHERE status = 'approved'` + lock por ID, então de N requests concorrentes de estorno
  apenas uma terá sucesso — as demais recebem `422 not_refundable`.
- **Idempotência**: chave vem do header `Idempotency-Key` ou do campo `idempotency_key` no
  body. Buscada e criada dentro de `withLock('idem:<key>')`, então 10 requests concorrentes
  com a mesma chave resultam em **uma única transação** (as demais recebem `200` com a
  transação já existente, em vez de `201`).

## Concorrência (`backend/src/lock.js`)

`withLock(key, fn)` serializa execuções por chave usando uma fila de Promises encadeadas.
Usado em três contextos: `idem:<key>`, `card:<last4>` e `refund:<id>`. Isso evita corridas
sem precisar de transações distribuídas — adequado para o single-process do Fastify rodando
sobre SQLite local.

## SQLite tuning (`backend/src/db.js`)

Aplica, na inicialização, os PRAGMAs pedidos: `journal_mode=WAL`, `busy_timeout=10000`,
`synchronous=NORMAL`, `cache_size=-64000` (64MB), `temp_store=MEMORY`.

## Frontend

Todas as classes CSS exigidas pelo benchmark estão presentes nos três componentes de página
(`Dashboard`, `History`, `Detail`), incluindo os atributos `data-value` com os valores brutos
(centavos, status, ISO 8601 etc.) conforme especificado.

- **Deep linking**: `/history?page=N&limit=M` é lido via `useSearchParams` e atualizado a cada
  troca de página — recarregar a URL direto funciona porque o backend serve `index.html` para
  qualquer rota não-API (`setNotFoundHandler` em `index.js`), e o React Router assume o
  roteamento client-side a partir daí.
- **Item de transação**: implementado como `<div role="link" tabIndex={0}>` (em vez de um `<a>`
  literal) para poder conter um `<button>` de estorno sem aninhar `<button>` dentro de `<a>`
  (inválido em HTML). Mantém a classe `transaction-item`, navegação por clique e por teclado
  (Enter), e o botão de estorno chama `stopPropagation()` para não disparar a navegação.

### Direção visual

Pensado como um "ledger de pagamentos": fundo quase-preto com leve textura de pontos, tipografia
mono (`JetBrains Mono`) para todo valor monetário/ID, `Space Grotesk` para títulos. O elemento de
assinatura é a **cadeia de taxa** no formulário (`valor → total com juros → taxa → líquido`),
que torna visível em tempo real a regra de negócio mais importante do sistema (e a que mais
derruba times, segundo o enunciado) antes mesmo de enviar a cobrança.

## Checklist de validação manual sugerida

Depois de rodar `npm start`:

```bash
curl http://localhost:3000/api/health
# {"status":"ok"}

curl -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "card_number":"4000000000000001",
    "holder_name":"Maria Silva",
    "expiration":"12/30",
    "cvv":"123",
    "amount_cents":10000,
    "installments":1,
    "description":"Teste Visa 1x"
  }'
# status approved, fee_cents=250, net_amount=9750

curl -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "card_number":"4000000000000002",
    "holder_name":"Joao Souza",
    "expiration":"12/30",
    "cvv":"123",
    "amount_cents":15000,
    "installments":3,
    "description":"Teste Visa 3x"
  }'
# total_with_interest=15919, installment_amount=5307, fee_cents=398, net_amount=15521

curl -X POST http://localhost:3000/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "card_number":"9999000000000001",
    "holder_name":"Cartao Bloqueado",
    "expiration":"12/30",
    "cvv":"123",
    "amount_cents":5000,
    "installments":1,
    "description":"Teste declined"
  }'
# status declined (HTTP 201, transação salva)
```

Os números acima foram verificados manualmente (`ceil(15000 * 1.02^3) = 15919`,
`ceil(15919/3) = 5307`, `round(15919 * 0.025) = 398`, `15919 - 398 = 15521`) e batem
exatamente com o checklist do enunciado original.
