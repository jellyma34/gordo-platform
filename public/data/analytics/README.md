# Analytics CSV (source of truth)

Файлы в этой папке коммитятся в Git и попадают в Railway deploy как static assets (`/data/analytics/*.csv`).

После загрузки CSV в режиме редактирования файлы сохраняются сюда автоматически.
Закоммитьте и push:

```bash
git add public/data/analytics/*.csv public/data/analytics/*.meta.json
git push
```

Реестр имён: `lib/analytics/analyticsCsvRegistry.ts`.

Проверка после deploy: `GET /api/analytics/status` — список файлов и `missing`.

Сейчас в репозитории (проверьте `GET /api/analytics/status`):

- `investors.csv`, `segment-execution.csv`, `units-execution.csv`
- `apartments.csv`, `parking.csv`, `storages.csv`
- `receipts-plan-fact.csv`, `marketing-leads.csv`, `revenue-fact.csv`
- `apartment-plan.csv`, `avg-price.csv`, `total-area.csv`, `reduced-area.csv`

**Нужно добавить в git** (блоки пустые без файла):

- `ddu-sales.csv` — Продажи по ДДУ
- `project-value.csv` — Общая стоимость проекта
- `installment-forecast.csv` — Прогноз поступлений
- `installment-area.csv` — рассрочка / площадь (если используется)

Полная таблица блоков: `lib/analytics/ANALYTICS_BLOCK_CSV_MAP.md`
