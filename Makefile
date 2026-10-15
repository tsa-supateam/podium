# Podium: common tasks. Windows users can run the commands inside each target directly.
.PHONY: setup models dev web engine test bench smoke build

setup: ## install Python + Node dependencies and download models (needs internet once)
	cd engine && uv sync --python 3.11
	cd engine && uv run python ../scripts/fetch_models.py
	cd apps/desktop && npm install

dev: ## run the desktop app (Electron + Vite dev server + engine)
	cd apps/desktop && npm run dev

engine: ## run the engine alone for browser dev mode (http://127.0.0.1:5173/?port=8765&token=dev)
	cd engine && uv run python -m podium_engine serve --port 8765 --token dev

web: ## renderer in a browser (pair with `make engine`)
	cd apps/desktop && npm run dev:web

test: ## all automated tests
	cd engine && uv run ruff check podium_engine tests ../scripts && uv run pytest -q
	cd apps/desktop && npx tsc --noEmit && npx vitest run

bench: ## performance table for the portfolio
	cd engine && uv run python ../scripts/benchmark.py

build: ## production renderer + Electron bundles
	cd apps/desktop && npm run build

smoke: build ## launch the built app hidden and check it connects to the engine
	cd apps/desktop && npm run smoke
