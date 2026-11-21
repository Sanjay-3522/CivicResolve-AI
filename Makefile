# CivicResolve developer commands. CI runs the same targets.
.PHONY: install lint typecheck test test-backend test-frontend e2e audit build docker

install:
	cd backend && pip install -r requirements-dev.txt
	cd frontend && npm ci

lint:            ## ruff (lint + format check), ESLint (next + jsx-a11y), Prettier
	cd backend && ruff check . && ruff format --check .
	cd frontend && npm run lint

typecheck:       ## mypy + tsc --noEmit
	cd backend && mypy .
	cd frontend && npm run typecheck

test: test-backend test-frontend

test-backend:    ## pytest with the 90% coverage gate
	cd backend && pytest --cov --cov-fail-under=90

test-frontend:   ## Jest with the 80% coverage gate (jest.config.js)
	cd frontend && npm run test:coverage

e2e:             ## Playwright happy path against the production build (starts the app itself)
	cd frontend && npm run build && npx playwright test

audit:           ## dependency audits with reviewed exceptions in security/
	bash security/run-pip-audit.sh
	bash security/run-npm-audit.sh

build:
	cd frontend && npm run build

docker:
	docker build -t civicresolve .
