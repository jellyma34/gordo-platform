# Temporary script; patches SalesPlanPanel presentation ternaries inside main export only.
from pathlib import Path

path = Path(r"e:\Суслова М\ГОРДО. ГПР\components\marketing\SalesPlanPanel.tsx")
lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
needle = "export function SalesPlanPanel({ presentation, period, objectId, dealTypeId, initialPlanScenario }: Props) {"
idx = next((i for i, l in enumerate(lines) if needle in l), None)
if idx is None:
    raise SystemExit("marker not found")

skip_substrings = (
    "buildDynamicsKpiItems(dynamicsKpiInput, presentation",
    "isPresentationMode = presentation",
    "presentation={presentation}",
    "{presentation ? (",
    "mode={presentation",
    "[dynamicsKpiInput, presentation]",
    "const chartMode:",
)

out = lines[: idx + 1]
out.append('  const presDark = useMarketingPresVisual(presentation) === "presDark";\n')
for j in range(idx + 1, len(lines)):
    line = lines[j]
    if any(s in line for s in skip_substrings):
        out.append(line)
        continue
    out.append(line.replace("presentation ?", "presDark ?"))

path.write_text("".join(out), encoding="utf-8")
print("patched", path)
