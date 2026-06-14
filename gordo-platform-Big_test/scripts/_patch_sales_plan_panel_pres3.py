from pathlib import Path

path = Path(r"e:\Суслова М\ГОРДО. ГПР\components\marketing\SalesPlanPanel.tsx")
lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
needle = "export function SalesPlanPanel({ presentation, period, objectId, dealTypeId, initialPlanScenario }: Props) {"
idx = next((i for i, l in enumerate(lines) if needle in l), None)
if idx is None:
    raise SystemExit("marker not found")

out = lines[: idx + 1]
for j in range(idx + 1, len(lines)):
    line = lines[j]
    if ": presentation" in line and "presentation ?" not in line:
        line = line.replace(": presentation", ": presDark")
    out.append(line)
path.write_text("".join(out), encoding="utf-8")
print("pass3 ok")
