"""Local repository handoff checks; no network, tokens, or third-party packages required."""
from __future__ import annotations

import argparse
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NEEDED = (
    ".github/workflows/test.yml",
    "README.md",
    "SECURITY.md",
    "ACCESSIBILITY.md",
    "TESTING.md",
    "EVALUATION_EVIDENCE.md",
    "SUBMISSION_CHECKLIST.md",
    "backend/main.py",
    "backend/requirements.txt",
    "frontend/app/page.tsx",
    "frontend/package-lock.json",
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Check repository handoff basics")
    parser.add_argument("--submission", action="store_true", help="require filled deployment/repo placeholders")
    args = parser.parse_args()
    failures = []
    for name in NEEDED:
        if not (ROOT / name).is_file():
            failures.append(f"Required file missing: {name}")

    if (ROOT / "backend/.env").exists() or (ROOT / "frontend/.env").exists():
        # Local .env files are normal but should not be added to a public repo.
        print("WARNING: local .env exists; verify it is ignored before publishing")

    proc = subprocess.run(
        ["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=False
    ) if (ROOT / ".git").exists() else None
    if proc is not None and proc.returncode == 0:
        for path in proc.stdout.splitlines():
            filename = Path(path).name
            secret_env = filename == ".env" or (filename.startswith(".env.") and filename != ".env.example")
            uploaded_photo = path.startswith("backend/uploads/") and not path.endswith(".gitkeep")
            runtime_db = path.endswith(".db") and path.startswith("backend/")
            if secret_env or uploaded_photo or runtime_db:
                failures.append(f"Potentially sensitive tracked file: {path}")
        branch = subprocess.run(
            ["git", "branch", "--show-current"], cwd=ROOT,
            capture_output=True, text=True, check=False
        )
        if branch.returncode == 0 and branch.stdout.strip() != "main":
            failures.append("Expected a single working branch named main")
    else:
        print("INFO: git metadata not present; branch and tracked-file checks skipped")

    readme = (ROOT / "README.md").read_text(encoding="utf-8") if (ROOT / "README.md").exists() else ""
    for heading in ("Selected vertical and persona", "Approach: context-aware assistant", "Explicit assumptions"):
        if heading not in readme:
            failures.append(f"README must include: {heading}")
    if args.submission:
        for placeholder in ("<LIVE_URL>", "<REPLACE_WITH_HTTPS_GITHUB_LINK>"):
            if placeholder in readme:
                failures.append(f"Replace README placeholder before submission: {placeholder}")
        if "exact **vertical label** was not included" in readme:
            failures.append("Verify and fill the officially allowed vertical name in README")

    if failures:
        for failure in failures:
            print(f"FAIL: {failure}")
        return 1
    print("PASS: offline repository checks completed (not a substitute for CI or a public repo check)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
