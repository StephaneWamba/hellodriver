#!/bin/bash
# Setup infrastructure for integration testing
# Usage: ./scripts/test-infra-setup.sh [up|down|logs]

set -e

COMMAND=${1:-up}
DOCKER_COMPOSE="docker-compose -f docker-compose.test.yml"

case "$COMMAND" in
  up)
    echo "🚀 Starting test infrastructure (PostgreSQL + Redis)..."
    $DOCKER_COMPOSE up -d

    echo ""
    echo "⏳ Waiting for services to be healthy..."
    $DOCKER_COMPOSE exec -T postgres pg_isready -U postgres -d test > /dev/null 2>&1 || true
    sleep 5

    echo "✅ Infrastructure started!"
    echo ""
    echo "📝 Set these environment variables to run integration tests:"
    echo ""
    echo "export DATABASE_URL=\"postgresql://postgres:test@localhost:5433/test\""
    echo "export SUPABASE_URL=\"http://localhost:54321\""
    echo "export SUPABASE_ANON_KEY=\"test-anon-key\""
    echo "export SUPABASE_SERVICE_KEY=\"test-service-key\""
    echo "export SUPABASE_JWT_SECRET=\"test-jwt-secret-32-chars-minimum!!\""
    echo "export REDIS_URL=\"redis://localhost:6379\""
    echo ""
    echo "Then run:"
    echo "cd apps/api && npm test -- payments.integration.test.ts"
    ;;

  down)
    echo "🛑 Stopping test infrastructure..."
    $DOCKER_COMPOSE down
    echo "✅ Infrastructure stopped"
    ;;

  logs)
    echo "📋 Showing logs..."
    $DOCKER_COMPOSE logs -f
    ;;

  *)
    echo "Usage: $0 [up|down|logs]"
    exit 1
    ;;
esac
