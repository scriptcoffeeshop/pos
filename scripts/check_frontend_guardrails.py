#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"

FORBIDDEN = [
    ("inline DOM handler", re.compile(r"\bon(?:click|change|input|submit)\s*=", re.IGNORECASE)),
    ("legacy data-action bridge", re.compile(r"\bdata-action\b", re.IGNORECASE)),
    ("window global API", re.compile(r"\bwindow\.", re.IGNORECASE)),
    ("manual HTML mutation", re.compile(r"\.innerHTML\b|\binnerHTML\s*=", re.IGNORECASE)),
    ("ts-ignore escape hatch", re.compile(r"@ts-ignore")),
]


def iter_source_files() -> list[Path]:
    return sorted(path for path in SRC.rglob("*") if path.suffix in {".ts", ".vue"})


def main() -> int:
    violations: list[str] = []
    for path in iter_source_files():
        text = path.read_text(encoding="utf-8")
        for label, pattern in FORBIDDEN:
            for match in pattern.finditer(text):
                line = text.count("\n", 0, match.start()) + 1
                rel = path.relative_to(ROOT)
                violations.append(f"{rel}:{line}: blocked {label}")

    if violations:
        print("Frontend guardrails failed:")
        for violation in violations:
            print(f"- {violation}")
        return 1

    print("Frontend guardrails passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
