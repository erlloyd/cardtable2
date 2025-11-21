#!/bin/bash
set -euo pipefail

# Railway API service deployment script
# Creates a new service or redeploys an existing one from a Docker image

# Required environment variables:
# - RAILWAY_API_TOKEN: Project token scoped to target environment
# - RAILWAY_PROJECT_ID: Project ID where service will be created
# - RAILWAY_ENVIRONMENT_ID: Environment ID where service will be created
# - DOCKER_IMAGE: Full Docker image URL (e.g., ghcr.io/user/repo:tag)
# - SERVICE_NAME: Name for the new service (optional, defaults to image name)

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

if [ -z "${DOCKER_IMAGE:-}" ]; then
  echo "Error: DOCKER_IMAGE environment variable is required"
  exit 1
fi

# Extract service name from image if not provided
if [ -z "${SERVICE_NAME:-}" ]; then
  SERVICE_NAME=$(echo "$DOCKER_IMAGE" | sed 's|.*/||' | sed 's|:.*||')
  echo "Using service name: $SERVICE_NAME"
fi

# Check if service already exists
echo "Checking if service '$SERVICE_NAME' already exists..."
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

if [ -n "$SERVICE_ID" ] && [ "$SERVICE_ID" != "null" ]; then
  # Service exists, trigger redeploy
  echo "✅ Service found (ID: $SERVICE_ID), triggering redeploy..."

  # Ensure PORT environment variable is set
  echo "Setting PORT=80 environment variable..."
  PORT_MUTATION=$(cat <<EOF
mutation {
  variableCollectionUpdate(
    input: {
      environmentId: "$RAILWAY_ENVIRONMENT_ID"
      serviceId: "$SERVICE_ID"
      variables: {
        PORT: "80"
      }
    }
  )
}
EOF
  )

  PORT_RESPONSE=$(curl -s -X POST "$RAILWAY_API" \
    -H "Authorization: Bearer $RAILWAY_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"query\":$(echo "$PORT_MUTATION" | jq -Rs .)}")

  # Check for errors
  if echo "$PORT_RESPONSE" | jq -e '.errors' > /dev/null 2>&1; then
    echo "Warning: Failed to set PORT variable:"
    echo "$PORT_RESPONSE" | jq '.errors'
  else
    echo "✅ PORT=80 set successfully!"
  fi

  REDEPLOY_MUTATION=$(cat <<EOF
mutation {
  serviceInstanceRedeploy(
    environmentId: "$RAILWAY_ENVIRONMENT_ID"
    serviceId: "$SERVICE_ID"
  )
}
EOF
  )

  REDEPLOY_RESPONSE=$(curl -s -X POST "$RAILWAY_API" \
    -H "Authorization: Bearer $RAILWAY_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"query\":$(echo "$REDEPLOY_MUTATION" | jq -Rs .)}")

  # Check for errors
  if echo "$REDEPLOY_RESPONSE" | jq -e '.errors' > /dev/null 2>&1; then
    echo "Error triggering redeploy:"
    echo "$REDEPLOY_RESPONSE" | jq '.errors'
    exit 1
  fi

  echo "✅ Redeploy triggered successfully!"

  # Query for existing service domain
  echo "Fetching service domain..."
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

  DOMAIN_QUERY_RESPONSE=$(curl -s -X POST "$RAILWAY_API" \
    -H "Authorization: Bearer $RAILWAY_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"query\":$(echo "$DOMAIN_QUERY" | jq -Rs .)}")

  # Extract domain URL
  DOMAIN_URL=$(echo "$DOMAIN_QUERY_RESPONSE" | jq -r '.data.serviceDomains[0].domain')

  if [ -z "$DOMAIN_URL" ] || [ "$DOMAIN_URL" = "null" ]; then
    echo "Warning: Could not fetch domain URL"
  else
    echo "Domain URL: https://$DOMAIN_URL"
  fi
else
  # Service doesn't exist, create it
  echo "Service not found, creating new service..."

  CREATE_MUTATION=$(cat <<EOF
mutation {
  serviceCreate(
    input: {
      name: "$SERVICE_NAME"
      projectId: "$RAILWAY_PROJECT_ID"
      environmentId: "$RAILWAY_ENVIRONMENT_ID"
      source: {
        image: "$DOCKER_IMAGE"
      }
    }
  ) {
    id
    name
  }
}
EOF
  )

  CREATE_RESPONSE=$(curl -s -X POST "$RAILWAY_API" \
    -H "Authorization: Bearer $RAILWAY_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"query\":$(echo "$CREATE_MUTATION" | jq -Rs .)}")

  # Check for errors
  if echo "$CREATE_RESPONSE" | jq -e '.errors' > /dev/null 2>&1; then
    echo "Error creating service:"
    echo "$CREATE_RESPONSE" | jq '.errors'
    exit 1
  fi

  # Extract service ID
  SERVICE_ID=$(echo "$CREATE_RESPONSE" | jq -r '.data.serviceCreate.id')

  if [ -z "$SERVICE_ID" ] || [ "$SERVICE_ID" = "null" ]; then
    echo "Failed to create service. Response:"
    echo "$CREATE_RESPONSE" | jq '.'
    exit 1
  fi

  echo "✅ Service created successfully!"
  echo "Service ID: $SERVICE_ID"
  echo "Service Name: $SERVICE_NAME"

  # Set PORT environment variable for the service
  echo "Setting PORT=80 environment variable..."
  PORT_MUTATION=$(cat <<EOF
mutation {
  variableCollectionUpdate(
    input: {
      environmentId: "$RAILWAY_ENVIRONMENT_ID"
      serviceId: "$SERVICE_ID"
      variables: {
        PORT: "80"
      }
    }
  )
}
EOF
  )

  PORT_RESPONSE=$(curl -s -X POST "$RAILWAY_API" \
    -H "Authorization: Bearer $RAILWAY_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"query\":$(echo "$PORT_MUTATION" | jq -Rs .)}")

  # Check for errors
  if echo "$PORT_RESPONSE" | jq -e '.errors' > /dev/null 2>&1; then
    echo "Warning: Failed to set PORT variable:"
    echo "$PORT_RESPONSE" | jq '.errors'
  else
    echo "✅ PORT=80 set successfully!"
  fi

  # Create public domain for the new service
  echo "Creating public domain for service..."
  DOMAIN_MUTATION=$(cat <<EOF
mutation {
  serviceDomainCreate(
    input: {
      environmentId: "$RAILWAY_ENVIRONMENT_ID"
      serviceId: "$SERVICE_ID"
    }
  ) {
    id
    domain
  }
}
EOF
  )

  DOMAIN_RESPONSE=$(curl -s -X POST "$RAILWAY_API" \
    -H "Authorization: Bearer $RAILWAY_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"query\":$(echo "$DOMAIN_MUTATION" | jq -Rs .)}")

  # Check for errors
  if echo "$DOMAIN_RESPONSE" | jq -e '.errors' > /dev/null 2>&1; then
    echo "Error creating domain:"
    echo "$DOMAIN_RESPONSE" | jq '.errors'
    exit 1
  fi

  # Extract domain URL
  DOMAIN_URL=$(echo "$DOMAIN_RESPONSE" | jq -r '.data.serviceDomainCreate.domain')

  if [ -z "$DOMAIN_URL" ] || [ "$DOMAIN_URL" = "null" ]; then
    echo "Failed to create domain. Response:"
    echo "$DOMAIN_RESPONSE" | jq '.'
    exit 1
  fi

  echo "✅ Public domain created successfully!"
  echo "Domain URL: https://$DOMAIN_URL"
fi

# Wait for deployment to complete
echo "Waiting for deployment to complete (timeout: 3 minutes)..."
TIMEOUT=180  # 3 minutes in seconds
ELAPSED=0
POLL_INTERVAL=5  # Check every 5 seconds

while [ $ELAPSED -lt $TIMEOUT ]; do
  # Query for the latest deployment status
  DEPLOYMENT_QUERY=$(cat <<EOF
query {
  deployments(
    input: {
      environmentId: "$RAILWAY_ENVIRONMENT_ID"
      serviceId: "$SERVICE_ID"
    }
    first: 1
  ) {
    edges {
      node {
        id
        status
        createdAt
      }
    }
  }
}
EOF
  )

  DEPLOYMENT_RESPONSE=$(curl -s -X POST "$RAILWAY_API" \
    -H "Authorization: Bearer $RAILWAY_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"query\":$(echo "$DEPLOYMENT_QUERY" | jq -Rs .)}")

  # Check for errors
  if echo "$DEPLOYMENT_RESPONSE" | jq -e '.errors' > /dev/null 2>&1; then
    echo "Error querying deployment status:"
    echo "$DEPLOYMENT_RESPONSE" | jq '.errors'
    exit 1
  fi

  # Extract deployment status
  DEPLOYMENT_STATUS=$(echo "$DEPLOYMENT_RESPONSE" | jq -r '.data.deployments.edges[0].node.status')

  if [ -z "$DEPLOYMENT_STATUS" ] || [ "$DEPLOYMENT_STATUS" = "null" ]; then
    echo "No deployment found yet, waiting..."
  else
    echo "Deployment status: $DEPLOYMENT_STATUS"

    if [ "$DEPLOYMENT_STATUS" = "SUCCESS" ]; then
      echo "✅ Deployment completed successfully!"

      # Output URL for GitHub Actions
      if [ -n "$DOMAIN_URL" ] && [ "$DOMAIN_URL" != "null" ] && [ -n "${GITHUB_OUTPUT:-}" ]; then
        echo "url=https://$DOMAIN_URL" >> "$GITHUB_OUTPUT"
        echo "Deployment URL exported to GitHub Actions: https://$DOMAIN_URL"
      fi

      exit 0
    elif [ "$DEPLOYMENT_STATUS" = "FAILED" ] || [ "$DEPLOYMENT_STATUS" = "CRASHED" ]; then
      echo "❌ Deployment failed with status: $DEPLOYMENT_STATUS"
      exit 1
    fi
  fi

  sleep $POLL_INTERVAL
  ELAPSED=$((ELAPSED + POLL_INTERVAL))
  echo "Elapsed time: ${ELAPSED}s / ${TIMEOUT}s"
done

echo "❌ Deployment timed out after 3 minutes"
exit 1
