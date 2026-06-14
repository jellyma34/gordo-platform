# Second pass: multiline ternaries that use `presentation` as a branch (not `presentation ?`).
import re
from pathlib import Path

path = Path(r"e:\Суслова М\ГОРДО. ГПР\components\marketing\SalesPlanPanel.tsx")
text = path.read_text(encoding="utf-8")
lines = text.splitlines(keepends=True)
needle = "export function SalesPlanPanel({ presentation, period, objectId, dealTypeId, initialPlanScenario }: Props) {"
idx = next((i for i, l in enumerate(lines) if needle in l), None)
if idx is None:
    raise SystemExit("marker not found")

branch_line = re.compile(r"^(\s*)(\? )?presentation\s*$")

def fix_line(line: str) -> str:
    m = branch_line.match(line.rstrip("\n"))
    if not m:
        return line
    indent, q = m.group(1), m.group(2) or ""
    nl = "\n" if line.endswith("\n") else ""
    return f"{indent}{q}presDark{nl}"

out = lines[: idx + 1]
for j in range(idx + 1, len(lines)):
    out.append(fix_line(lines[j]))
path.write_text("".join(out), encoding="utf-8")
print("pass2 ok")
