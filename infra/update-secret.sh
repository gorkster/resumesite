#!/bin/bash
set -e

# Default settings
SECRET_NAME="/resumesite/env"
REGION="us-east-2"

# Locate .env file if available
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE=""

if [ -f "$SCRIPT_DIR/.env" ]; then
    ENV_FILE="$SCRIPT_DIR/.env"
elif [ -f "$SCRIPT_DIR/../.env" ]; then
    ENV_FILE="$SCRIPT_DIR/../.env"
fi

echo "=================================================="
echo " AWS Secrets Manager: Update /resumesite/env"
echo "=================================================="

# Function to read variable from .env or prompt
get_var() {
    local var_name="$1"
    local prompt_desc="$2"
    local default_val="$3"
    local current_val=""

    if [ -n "$ENV_FILE" ]; then
        current_val=$(grep -E "^${var_name}=" "$ENV_FILE" | cut -d '=' -f2- | tr -d '"' | tr -d "'")
    fi

    if [ -z "$current_val" ]; then
        current_val="$default_val"
    fi

    if [ -t 0 ]; then
        read -p "$prompt_desc [$current_val]: " input_val
        if [ -n "$input_val" ]; then
            echo "$input_val"
        else
            echo "$current_val"
        fi
    else
        echo "$current_val"
    fi
}

echo "Configuring environment variables..."
if [ -n "$ENV_FILE" ]; then
    echo "Found local .env file at: $ENV_FILE"
fi

UMAMI_WEBSITE_ID=$(get_var "UMAMI_WEBSITE_ID" "Enter UMAMI_WEBSITE_ID (Analytics)" "6b6e8a7e-a049-4b24-b87e-7df42683cd4b")
HOSTED_ZONE_ID=$(get_var "HOSTED_ZONE_ID" "Enter HOSTED_ZONE_ID" "Z08594561ZFJW0YY4WF8W")
ZONE_NAME=$(get_var "ZONE_NAME" "Enter ZONE_NAME" "resume.grtmkr.com")
CODESTAR_CONNECTION_ARN=$(get_var "CODESTAR_CONNECTION_ARN" "Enter CODESTAR_CONNECTION_ARN" "")
GITHUB_OWNER=$(get_var "GITHUB_OWNER" "Enter GITHUB_OWNER" "gorkster")
GITHUB_REPO=$(get_var "GITHUB_REPO" "Enter GITHUB_REPO" "resumesite")
GITHUB_BRANCH=$(get_var "GITHUB_BRANCH" "Enter GITHUB_BRANCH" "main")
HUGO_CONTACT_EMAIL=$(get_var "HUGO_CONTACT_EMAIL" "Enter HUGO_CONTACT_EMAIL" "")
HUGO_CONTACT_PHONE=$(get_var "HUGO_CONTACT_PHONE" "Enter HUGO_CONTACT_PHONE" "")

echo ""
echo "Constructing JSON payload..."

JSON_PAYLOAD=$(node -e "
const data = {
  UMAMI_WEBSITE_ID: process.env.UMAMI_WEBSITE_ID || '',
  HOSTED_ZONE_ID: process.env.HOSTED_ZONE_ID || '',
  ZONE_NAME: process.env.ZONE_NAME || '',
  CODESTAR_CONNECTION_ARN: process.env.CODESTAR_CONNECTION_ARN || '',
  GITHUB_OWNER: process.env.GITHUB_OWNER || '',
  GITHUB_REPO: process.env.GITHUB_REPO || '',
  GITHUB_BRANCH: process.env.GITHUB_BRANCH || '',
  HUGO_CONTACT_EMAIL: process.env.HUGO_CONTACT_EMAIL || '',
  HUGO_CONTACT_PHONE: process.env.HUGO_CONTACT_PHONE || ''
};
console.log(JSON.stringify(data, null, 2));
" UMAMI_WEBSITE_ID="$UMAMI_WEBSITE_ID" \
  HOSTED_ZONE_ID="$HOSTED_ZONE_ID" \
  ZONE_NAME="$ZONE_NAME" \
  CODESTAR_CONNECTION_ARN="$CODESTAR_CONNECTION_ARN" \
  GITHUB_OWNER="$GITHUB_OWNER" \
  GITHUB_REPO="$GITHUB_REPO" \
  GITHUB_BRANCH="$GITHUB_BRANCH" \
  HUGO_CONTACT_EMAIL="$HUGO_CONTACT_EMAIL" \
  HUGO_CONTACT_PHONE="$HUGO_CONTACT_PHONE"
)

echo "Uploading secret to AWS Secrets Manager ($SECRET_NAME in $REGION)..."

aws secretsmanager put-secret-value \
    --secret-id "$SECRET_NAME" \
    --secret-string "$JSON_PAYLOAD" \
    --region "$REGION" > /dev/null

echo "✅ Secret $SECRET_NAME successfully updated in $REGION!"
