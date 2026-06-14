"""
Нормализаторы значений из staging → fact.

Сейчас один: ProjectNormalizer (грязное имя проекта → dim_projects.id
через project_aliases). В дальнейшем сюда же добавятся:

- PeriodNormalizer (различные форматы дат → period_month)
- MetricNormalizer (унификация названий метрик)
"""
from .projects import ProjectNormalizer, ProjectNormalizationResult

__all__ = ["ProjectNormalizer", "ProjectNormalizationResult"]
