# Analytics block → CSV file

| UI block | `MarketingImportKind` | File in `public/data/analytics/` |
|----------|----------------------|----------------------------------|
| Продажи по заключенным ДДУ | `ddu_revenue` | `ddu-sales.csv` |
| Общая стоимость проекта | `project_value` | `project-value.csv` |
| Исполнение плана продаж (plan/fact) | `receipts_plan_fact` | `receipts-plan-fact.csv` |
| Динамика поступлений | payment-plan API | *(не CSV analytics)* |
| Прогноз поступлений по договорам | `installment_forecast` | `installment-forecast.csv` |
| Выполнение плана отчётного периода | `apartment_plan` | `apartment-plan.csv` |
| Средняя стоимость объекта | `average_price_per_sqm` | `avg-price.csv` |
| Общая площадь | `total_area` | `total-area.csv` |
| Приведенная площадь | `reduced_area` | `reduced-area.csv` |
| Segment execution charts | `segment_execution` | `segment-execution.csv` |

Loader: `loadAnalyticsCsv` → `fetch('/data/analytics/<file>')` → `POST /api/analytics/parse`.
