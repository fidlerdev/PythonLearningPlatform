"""Editable catalogue metadata, separate from immutable learning snapshots."""
from .domain import ContentError


def normalize_classification(section, tags):
    if not isinstance(section, str) or len(section.strip()) > 80:
        raise ContentError("Раздел должен быть строкой не длиннее 80 символов.")
    if not isinstance(tags, list) or len(tags) > 10:
        raise ContentError("Укажите список не более чем из 10 тегов.")
    result = []
    seen = set()
    for tag in tags:
        if not isinstance(tag, str) or not tag.strip() or len(tag.strip()) > 32:
            raise ContentError("Каждый тег должен содержать от 1 до 32 символов.")
        tag = tag.strip()
        if tag.casefold() not in seen:
            result.append(tag)
            seen.add(tag.casefold())
    return section.strip(), result
