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

Обязательные файлы для основных блоков:

- `ddu-sales.csv` — Продажи по ДДУ
- `project-value.csv` — Стоимость проекта
- `avg-price.csv`, `total-area.csv`, `reduced-area.csv`
- `apartment-plan.csv`, `installment-forecast.csv`, `installment-area.csv`
- и др. по реестру
