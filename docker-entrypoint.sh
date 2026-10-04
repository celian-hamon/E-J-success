#!/bin/sh
set -e

: "${AUTH_SECRET:?AUTH_SECRET must be set}"

# Sync the schema to the database. Refuses destructive changes; run
# `prisma db push --accept-data-loss` by hand if a change really needs it.
prisma db push --schema=prisma/schema.prisma --skip-generate

exec "$@"
