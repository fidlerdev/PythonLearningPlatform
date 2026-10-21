"""Content schemas and deterministic graders. No execution of submitted Python."""
import ast
import copy


class ContentError(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise ContentError(message)


def integer(value):
    return isinstance(value, int) and not isinstance(value, bool)


def validate_world(world):
    require(isinstance(world, dict), "Карта должна быть объектом.")
    width, height = world.get("width"), world.get("height")
    require(integer(width) and integer(height) and 2 <= width <= 12 and 2 <= height <= 12,
            "Размер карты: от 2 до 12 клеток по каждой стороне.")

    def cell(value):
        return (isinstance(value, list) and len(value) == 2 and all(integer(n) for n in value)
                and 0 <= value[0] < width and 0 <= value[1] < height)

    start = world.get("start", {})
    require(isinstance(start, dict), "Задайте старт робота.")
    require(cell([start.get("x"), start.get("y")]), "Старт должен находиться на карте.")
    require(start.get("direction") in ["north", "east", "south", "west"], "Неизвестное направление робота.")
    require(cell(world.get("goal")), "Цель должна находиться на карте.")
    walls = world.get("walls", [])
    require(isinstance(walls, list) and len(walls) <= width * height and all(cell(c) for c in walls),
            "Препятствия должны находиться на карте.")
    require(len({tuple(c) for c in walls}) == len(walls), "Препятствия не должны повторяться.")
    require([start["x"], start["y"]] not in walls and world["goal"] not in walls,
            "Старт и цель не могут находиться на препятствии.")
    require([start["x"], start["y"]] != world["goal"], "Старт и цель должны отличаться.")
    # Authors get early feedback instead of publishing an impossible level.
    reachable = {(start["x"], start["y"])}
    pending = list(reachable)
    wall_set = {tuple(c) for c in walls}
    while pending:
        x, y = pending.pop()
        for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
            point = (x + dx, y + dy)
            if 0 <= point[0] < width and 0 <= point[1] < height and point not in wall_set and point not in reachable:
                reachable.add(point)
                pending.append(point)
    require(tuple(world["goal"]) in reachable, "До цели нельзя добраться: измените препятствия.")


def validate_exercise(data):
    require(isinstance(data, dict), "Задание должно быть объектом.")
    for name in ["title", "prompt"]:
        require(isinstance(data.get(name), str) and data[name].strip(), f"Заполните поле {name}.")
    require(len(data["title"]) <= 200 and len(data["prompt"]) <= 20000, "Текст задания слишком длинный.")
    require(isinstance(data.get("starter_code", ""), str) and len(data.get("starter_code", "")) <= 20000,
            "Стартовый код слишком длинный.")
    hints = data.get("hints", [])
    require(isinstance(hints, list) and len(hints) <= 4 and
            all(isinstance(h, str) and 0 < len(h.strip()) <= 4000 for h in hints),
            "Можно задать до четырёх непустых подсказок.")
    config, rules = data.get("config", {}), data.get("rules", {})
    require(isinstance(config, dict) and isinstance(rules, dict), "Настройки и проверка должны быть объектами.")
    kind = data.get("kind")
    if kind == "quiz":
        choices = config.get("choices")
        require(isinstance(choices, list) and 2 <= len(choices) <= 8, "Нужно от 2 до 8 вариантов ответа.")
        require(all(isinstance(c, dict) and isinstance(c.get("id"), str) and
                    0 < len(c["id"]) <= 40 and isinstance(c.get("text"), str) and
                    0 < len(c["text"].strip()) <= 2000 for c in choices), "Заполните варианты ответа.")
        ids = [c["id"] for c in choices]
        require(len(set(ids)) == len(ids), "Идентификаторы вариантов должны быть уникальными.")
        correct = rules.get("correct_options")
        require(isinstance(correct, list) and len(correct) > 0 and
                all(isinstance(c, str) and c in ids for c in correct) and len(set(correct)) == len(correct),
                "Выберите правильные ответы.")
        require(isinstance(config.get("multiple", False), bool), "multiple должен быть логическим значением.")
        require(config.get("multiple", False) or len(correct) == 1, "Для одного ответа выберите один вариант.")
    elif kind == "short_answer":
        answers = rules.get("answers")
        require(isinstance(answers, list) and 1 <= len(answers) <= 20 and
                all(isinstance(a, str) and 0 < len(a.strip()) <= 1000 for a in answers),
                "Задайте допустимые ответы.")
        require(isinstance(rules.get("case_sensitive", False), bool), "case_sensitive должен быть логическим значением.")
    elif kind == "robot":
        validate_world(config)
        require(isinstance(rules.get("require_loop", False), bool), "require_loop должен быть логическим значением.")
        if "max_commands" in rules:
            require(integer(rules["max_commands"]) and 1 <= rules["max_commands"] <= 1000,
                    "Лимит команд: от 1 до 1000.")
    else:
        raise ContentError("Неизвестный тип задания.")


def public_exercise(exercise):
    """Whitelist public fields; never serialize private rules or unopened hints."""
    result = {key: copy.deepcopy(exercise.get(key, "")) for key in
              ["id", "title", "kind", "prompt", "starter_code"]}
    config = exercise["config"]
    keys = {"quiz": ["choices", "multiple"], "short_answer": [],
            "robot": ["width", "height", "start", "goal", "walls"]}[exercise["kind"]]
    result["config"] = {key: copy.deepcopy(config[key]) for key in keys if key in config}
    result["hint_count"] = len(exercise.get("hints", []))
    if exercise["kind"] == "robot":
        result["requirements"] = {key: exercise["rules"][key] for key in
                                  ["require_loop", "max_commands"] if key in exercise["rules"]}
    return result


def public_snapshot(snapshot):
    result = copy.deepcopy(snapshot)
    for block in result["blocks"]:
        if block["kind"] == "exercise":
            block["exercise"] = public_exercise(block["exercise"])
    return result


def validate_answer(exercise, answer):
    require(isinstance(answer, dict), "Ответ должен быть объектом.")
    kind = exercise["kind"]
    if kind == "quiz":
        selected = answer.get("selected")
        ids = [c["id"] for c in exercise["config"]["choices"]]
        require(isinstance(selected, list) and len(selected) <= len(ids) and
                all(isinstance(c, str) and c in ids for c in selected) and len(set(selected)) == len(selected),
                "Некорректные варианты ответа.")
        require(exercise["config"].get("multiple", False) or len(selected) <= 1, "Выберите один ответ.")
        return {"selected": selected}
    if kind == "short_answer":
        value = answer.get("text")
        require(isinstance(value, str) and len(value) <= 2000, "Введите короткий текстовый ответ.")
        return {"text": value}
    code = answer.get("code")
    require(isinstance(code, str) and len(code) <= 20000, "Программа должна содержать не более 20000 символов.")
    # A draft may contain incomplete Python; syntax is checked only on submission.
    return {"code": code}


def grade(exercise, answer):
    normalized = validate_answer(exercise, answer)
    rules = exercise["rules"]
    if exercise["kind"] == "quiz":
        correct = set(normalized["selected"]) == set(rules["correct_options"])
        return correct, "Верно! Ты разобрался." if correct else "Попробуй мысленно выполнить программу по шагам.", "server"
    if exercise["kind"] == "short_answer":
        def norm(text):
            return text.strip() if rules.get("case_sensitive", False) else text.strip().casefold()
        correct = norm(normalized["text"]) in [norm(a) for a in rules["answers"]]
        return correct, "Верно!" if correct else "Пока не совпало. Проверь значения после каждого шага.", "server"
    code = normalized["code"]
    try:
        tree = ast.parse(code)
    except SyntaxError as exc:
        return False, f"Проверь синтаксис в строке {exc.lineno}: {exc.msg}", "client_trace"
    if rules.get("require_loop") and not any(isinstance(n, (ast.For, ast.While)) for n in ast.walk(tree)):
        return False, "Путь нужно пройти с помощью цикла. Какие команды повторяются?", "client_trace"
    commands = answer.get("commands")
    require(isinstance(commands, list) and len(commands) <= 1000 and
            all(isinstance(c, str) and c in ["forward", "left", "right"] for c in commands),
            "Сначала запусти программу, затем отправь результат проверки.")
    if len(commands) > rules.get("max_commands", 1000):
        return False, "Слишком много движений. Можно ли сократить путь?", "client_trace"
    world = exercise["config"]
    x, y = world["start"]["x"], world["start"]["y"]
    direction = ["north", "east", "south", "west"].index(world["start"]["direction"])
    walls = {tuple(c) for c in world.get("walls", [])}
    for command in commands:
        if command == "left":
            direction = (direction - 1) % 4
        elif command == "right":
            direction = (direction + 1) % 4
        else:
            dx, dy = [(0, -1), (1, 0), (0, 1), (-1, 0)][direction]
            x, y = x + dx, y + dy
            if not 0 <= x < world["width"] or not 0 <= y < world["height"]:
                return False, "Робот вышел за границу. Посчитай клетки до края.", "client_trace"
            if (x, y) in walls:
                return False, "На пути стена. Подумай, где нужно повернуть.", "client_trace"
    correct = [x, y] == world["goal"]
    return correct, "Робот добрался до цели!" if correct else "Робот ещё не у цели. Сколько шагов осталось?", "client_trace"
