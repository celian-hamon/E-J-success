# Common tasks. `make` or `make help` lists them.
# Recipes are plain commands so they run the same from cmd, PowerShell or a Unix shell.

COMPOSE ?= docker compose

.DEFAULT_GOAL := help
.PHONY: help install dev build start typecheck check-messages check \
        db-push db-seed db-reset db-studio \
        docker-build up down restart logs ps shell admin backup

help: ## List the targets
	$(info Development:  install dev build start typecheck check-messages check)
	$(info Database:     db-push db-seed db-reset db-studio)
	$(info Production:   docker-build up down restart logs ps shell backup)
	$(info $()              admin EMAIL=you@school.org NAME="Your Name" PASSWORD=...)

# ---- development ----

install: ## Install dependencies and generate the Prisma client
	npm ci
	npx prisma generate

dev: ## Start the dev server on http://localhost:3000
	npm run dev

build: ## Production build (Next.js standalone output)
	npm run build

start: ## Run the production build locally
	npm run start

typecheck: ## TypeScript check
	npm run typecheck

check-messages: ## Every locale has the same keys as messages/fr.json
	node scripts/check-messages.mjs

check: typecheck check-messages ## All checks

# ---- database (local) ----

db-push: ## Sync prisma/schema.prisma to the database
	npm run db:push

db-seed: ## Demo accounts and courses (never in production)
	npm run db:seed

db-reset: ## Wipe the local database and re-seed it
	npm run db:reset

db-studio: ## Browse the database
	npm run db:studio

# ---- production (Docker, see docker-compose.yml; needs a .env from .env.production.example) ----

docker-build: ## Build the app image
	$(COMPOSE) build

up: ## Build and start the stack in the background
	$(COMPOSE) up -d --build

down: ## Stop the stack (volumes are kept)
	$(COMPOSE) down

restart: ## Restart the app container
	$(COMPOSE) restart app

logs: ## Follow the app logs
	$(COMPOSE) logs -f app

ps: ## Container status
	$(COMPOSE) ps

shell: ## Shell inside the app container
	$(COMPOSE) exec app sh

admin: ## Create or reset an admin: make admin EMAIL=... NAME="..." PASSWORD=...
	$(if $(EMAIL),,$(error EMAIL is required))
	$(if $(PASSWORD),,$(error PASSWORD is required (8+ characters)))
	$(COMPOSE) exec -e ADMIN_PASSWORD=$(PASSWORD) app node scripts/create-admin.mjs $(EMAIL) "$(or $(NAME),Admin)"

backup: ## Copy the database and uploads out of the volumes into ./backups (stop the app first for a consistent copy)
	$(COMPOSE) cp app:/app/data ./backups/data
	$(COMPOSE) cp app:/app/uploads ./backups/uploads
