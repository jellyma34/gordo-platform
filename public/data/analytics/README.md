# Analytics CSV (source of truth)

Файлы в этой папке коммитятся в Git и попадают в Railway deploy как static assets.

После загрузки CSV в режиме редактирования маркетинга файлы сохраняются сюда автоматически.
Закоммитьте изменения (`git add public/data/analytics/*.csv`) и выполните push.

Имена файлов см. в `lib/analytics/analyticsCsvRegistry.ts`.
