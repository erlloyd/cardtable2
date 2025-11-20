#!/bin/bash
set -euo pipefail

# Fetches the URL for an existing Railway service
# Required environment variables:
# - RAILWAY_API_TOKEN: Project token scoped to target environment
# - RAILWAY_PROJECT_ID: Project ID
# - RAILWAY_ENVIRONMENT_ID: Environment ID
# - SERVICE_NAME: Name of the service

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

echo "Fetching URL for service: $SERVICE_NAME"

# Query for service ID
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
  echo "Error: Service '$SERVICE_NAME' not found"
  exit 1
fi

echo "Service ID: $SERVICE_ID"

# Query for service domain
DOMAIN_QUERY=$(cat <<EOF
query {
  serviceDomains(
    environmentId: "$RAILWAY_ENVIRONMENT_ID"
    serviceId: "$SERVICE_ID"
  ) {
    domain
  }
}
EOF
)

DOMAIN_RESPONSE=$(curl -s -X POST "$RAILWAY_API" \
  -H "Authorization: Bearer $RAILWAY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"query\":$(echo "$DOMAIN_QUERY" | jq -Rs .)}")

# Check for errors
if echo "$DOMAIN_RESPONSE" | jq -e '.errors' > /dev/null 2>&1; then
  echo "Error querying domain:"
  echo "$DOMAIN_RESPONSE" | jq '.errors'
  exit 1
fi

# Extract domain URL
DOMAIN_URL=$(echo "$DOMAIN_RESPONSE" | jq -r '.data.serviceDomains[0].domain')

if [ -z "$DOMAIN_URL" ] || [ "$DOMAIN_URL" = "null" ]; then
  echo "Error: Domain not found for service '$SERVICE_NAME'"
  exit 1
fi

echo "Domain: https://$DOMAIN_URL"

# Output URL for GitHub Actions
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "url=https://$DOMAIN_URL" >> "$GITHUB_OUTPUT"
fi
