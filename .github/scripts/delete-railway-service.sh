#!/bin/bash
set -euo pipefail

# Railway API service deletion script
# Deletes a service by name from a specific environment

# Required environment variables:
# - RAILWAY_API_TOKEN: Project token scoped to target environment
# - RAILWAY_PROJECT_ID: Project ID where service exists
# - RAILWAY_ENVIRONMENT_ID: Environment ID where service exists
# - SERVICE_NAME: Name of the service to delete

RAILWAY_API="https://backboard.railway.com/graphql/v2"

# Validate required variables
if [ -z "${RAILWAY_API_TOKEN:-}" ]; then
  echo "Error: RAILWAY_API_TOKEN environment variable is required"
  exit 1
fi

if [ -z "${RAILWAY_PROJECT_ID:-}" ]; then
  echo "Error: RAILWAY_PROJECT_ID environment variable is required"
  exit 1
fi

if [ -z "${RAILWAY_ENVIRONMENT_ID:-}" ]; then
  echo "Error: RAILWAY_ENVIRONMENT_ID environment variable is required"
  exit 1
fi

if [ -z "${SERVICE_NAME:-}" ]; then
  echo "Error: SERVICE_NAME environment variable is required"
  exit 1
fi

# Query to find service by name
echo "Looking for service: $SERVICE_NAME..."
QUERY=$(cat <<EOF
query {
  project(id: "$RAILWAY_PROJECT_ID") {
    services {
      edges {
        node {
          id
          name
        }
      }
    }
  }
}
EOF
)

RESPONSE=$(curl -s -X POST "$RAILWAY_API" \
  -H "Authorization: Bearer $RAILWAY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"query\":$(echo "$QUERY" | jq -Rs .)}")

# Check for errors
if echo "$RESPONSE" | jq -e '.errors' > /dev/null 2>&1; then
  echo "Error querying services:"
  echo "$RESPONSE" | jq '.errors'
  exit 1
fi

# Find service ID by name
SERVICE_ID=$(echo "$RESPONSE" | jq -r --arg name "$SERVICE_NAME" '.data.project.services.edges[] | select(.node.name == $name) | .node.id')

if [ -z "$SERVICE_ID" ] || [ "$SERVICE_ID" = "null" ]; then
  echo "Service '$SERVICE_NAME' not found in project"
  exit 1
fi

echo "Found service ID: $SERVICE_ID"

# Delete the service
echo "Deleting service..."
DELETE_MUTATION=$(cat <<EOF
mutation {
  serviceDelete(id: "$SERVICE_ID")
}
EOF
)

DELETE_RESPONSE=$(curl -s -X POST "$RAILWAY_API" \
  -H "Authorization: Bearer $RAILWAY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"query\":$(echo "$DELETE_MUTATION" | jq -Rs .)}")

# Check for errors
if echo "$DELETE_RESPONSE" | jq -e '.errors' > /dev/null 2>&1; then
  echo "Error deleting service:"
  echo "$DELETE_RESPONSE" | jq '.errors'
  exit 1
fi

echo "✅ Service '$SERVICE_NAME' deleted successfully!"
