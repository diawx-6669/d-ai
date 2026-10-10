<div align="center">
  <h1>d-ai — AI Website Audit Ecosystem</h1>
  <p>Аудит сайтов: измеримые проблемы от краулера, рекомендации от LLM, чат по результатам.</p>

  ![Go](https://img.shields.io/badge/Go-1.25-00ADD8?style=flat-square&logo=go)
  ![Python](https://img.shields.io/badge/Python-3.12-3776AB?style=flat-square&logo=python)
  ![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react)
  ![License](https://img.shields.io/badge/license-MIT-ff3344?style=flat-square)
</div>

---

## Как это устроено

```
d-ai/
├── core-backend/      Go API: аккаунты, задачи аудита, прокси к AI
├── crawler-engine/    Python: загрузка страницы и измеримые проблемы
├── ai-assistant/      Python: рекомендации и чат (Groq, OpenAI-совместимый API)
├── frontend-ui/       React: интерфейс
└── system-tools/      скрипты и SQL
```

Браузер всегда обращается к `/api/...` на своём же origin: в разработке это
проксирует Vite, в продакшене — nginx. Хардкодить хост API не нужно нигде.

```
browser → nginx :$PORT ──┬── /           → статика React
                         └── /api/*      → core-backend :8080
                                            ├── :5001 crawler-engine
                                            └── :5002 ai-assistant
```

| Сервис | Порт | Язык | Что делает |
|---|---|---|---|
| core-backend | 8080 | Go | аккаунты, JWT, задачи аудита, SSE-прокси чата |
| crawler-engine | 5001 | Python | загружает страницу, считает метрики, находит проблемы |
| ai-assistant | 5002 | Python | текстовые рекомендации и чат |
| frontend-ui | 3000 | React | интерфейс (в проде отдаётся nginx) |

## Быстрый старт

```bash
cp .env.example .env     # ключ API можно оставить пустым
bash system-tools/scripts/dev-start.sh
```

Откройте http://localhost:3000 и зарегистрируйтесь.

Либо всё в контейнерах:

```bash
docker compose up --build       # http://localhost:3000
```

## Что нужно из настроек

Ничего обязательного — стек поднимется и без переменных окружения, но с
ограничениями:

| Переменная | Если не задана |
|---|---|
| `DATABASE_URL` | данные хранятся в памяти и теряются при перезапуске |
| `JWT_SECRET` | генерируется случайный; все сессии рвутся при перезапуске |
| `GROQ_API_KEY` | аудит работает (рекомендации по правилам), чат — нет |

Задан `DATABASE_URL`, но база недоступна — это ошибка конфигурации, и сервер
осознанно падает с понятным сообщением, а не делает вид, что всё хорошо.

Полный список — в [`.env.example`](.env.example).

## Деплой

Один образ со всеми четырьмя сервисами: [`Dockerfile`](Dockerfile) +
[`render.yaml`](render.yaml). nginx слушает `$PORT` (его и проверяет платформа),
Go — фиксированный внутренний 8080, Python-сервисы — 5001 и 5002.
Проверка состояния: `GET /health` — отвечает 200, пока API жив, и перечисляет
состояние каждого сервиса:

```json
{"status":"ok","store":{"kind":"postgres","status":"ok"},"crawler":"ok","ai":"ok"}
```

## API

| Метод | Путь | Авторизация | Описание |
|---|---|---|---|
| POST | `/api/auth/register` | — | создать аккаунт, вернуть JWT |
| POST | `/api/auth/login` | — | войти, вернуть JWT |
| POST | `/api/audit` | Bearer | запустить аудит, вернуть задачу с `id` |
| GET | `/api/audit/:id` | Bearer | статус и, когда готово, отчёт |
| GET | `/api/history` | Bearer | последние аудиты пользователя |
| POST | `/api/chat` | Bearer | чат по отчёту, ответ потоком (SSE) |
| GET | `/health` | — | состояние сервисов |

Задачи аудита видны только своему владельцу.

## Оценка

Начинается со 100: critical −15, warning −7, info −2, не ниже нуля. Проблемы
находит краулер по измеримым признакам — LLM их не придумывает и не меняет.

## Разработка

```bash
bash system-tools/scripts/build-all.sh    # сборка + все тесты
```

Краулер по умолчанию отказывается ходить на localhost и приватные адреса —
он стоит рядом с API, и иначе через него можно было бы читать внутренние
сервисы (SSRF). Чтобы проверять сайт на своей машине, поставьте
`CRAWLER_ALLOW_PRIVATE=1`; в публичном развёртывании — никогда.

## License

MIT © d-ai contributors
