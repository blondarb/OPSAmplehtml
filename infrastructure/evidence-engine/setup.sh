#!/usr/bin/env bash
# =============================================================================
# Sevaro Evidence Engine — Setup Script
#
# Deploys the SAM stack, uploads placeholder documents to S3, creates the
# Bedrock Knowledge Base via CLI, and triggers the initial ingestion sync.
#
# Prerequisites:
#   - AWS CLI configured with `sevaro-sandbox` profile (SSO)
#   - AWS SAM CLI installed (`brew install aws-sam-cli`)
#   - Logged in: `aws sso login --profile sevaro-sandbox`
#
# Usage:
#   chmod +x setup.sh
#   ./setup.sh [staging|production]
#
# The BEDROCK_KB_ID output must be added manually to Amplify env vars
# after this script completes.
# =============================================================================

set -euo pipefail

ENVIRONMENT="${1:-staging}"
PROFILE="sevaro-sandbox"
REGION="us-east-2"
STACK_NAME="sevaro-evidence-engine-${ENVIRONMENT}"
TEMPLATE="$(dirname "$0")/template.yaml"
DOCS_DIR="$(dirname "$0")/docs"

# Embedding model for the Knowledge Base
EMBEDDING_MODEL_ARN="arn:aws:bedrock:${REGION}::foundation-model/amazon.titan-embed-text-v2:0"
# Retrieval model for RetrieveAndGenerate calls from the app
RETRIEVAL_MODEL_ARN="arn:aws:bedrock:${REGION}::foundation-model/us.anthropic.claude-sonnet-4-6"

log() { echo "[$(date '+%H:%M:%S')] $*"; }
fail() { echo "[ERROR] $*" >&2; exit 1; }

# ── 1. Validate prerequisites ─────────────────────────────────────────────────
log "Checking prerequisites..."
command -v sam  >/dev/null 2>&1 || fail "AWS SAM CLI not found. Install: brew install aws-sam-cli"
command -v aws  >/dev/null 2>&1 || fail "AWS CLI not found."
command -v jq   >/dev/null 2>&1 || fail "jq not found. Install: brew install jq"

aws sts get-caller-identity --profile "${PROFILE}" --region "${REGION}" > /dev/null 2>&1 \
  || fail "AWS SSO session expired or profile '${PROFILE}' not configured. Run: aws sso login --profile ${PROFILE}"

log "Deploying to environment: ${ENVIRONMENT} (stack: ${STACK_NAME})"

# ── 2. Deploy SAM stack ───────────────────────────────────────────────────────
log "Deploying CloudFormation stack..."
sam deploy \
  --template-file "${TEMPLATE}" \
  --stack-name "${STACK_NAME}" \
  --parameter-overrides "Environment=${ENVIRONMENT}" \
  --capabilities CAPABILITY_NAMED_IAM \
  --profile "${PROFILE}" \
  --region "${REGION}" \
  --no-fail-on-empty-changeset

log "Stack deployed. Fetching outputs..."

get_output() {
  local key="$1"
  aws cloudformation describe-stacks \
    --stack-name "${STACK_NAME}" \
    --profile "${PROFILE}" \
    --region "${REGION}" \
    --query "Stacks[0].Outputs[?OutputKey=='${key}'].OutputValue" \
    --output text
}

BUCKET_NAME="$(get_output BucketName)"
COLLECTION_ARN="$(get_output CollectionArn)"
KB_ROLE_ARN="$(get_output KBRoleArn)"

log "  Bucket:         ${BUCKET_NAME}"
log "  Collection ARN: ${COLLECTION_ARN}"
log "  KB Role ARN:    ${KB_ROLE_ARN}"

# ── 3. Upload placeholder documents to S3 ────────────────────────────────────
log "Uploading guideline documents to s3://${BUCKET_NAME}..."

if [ -d "${DOCS_DIR}" ]; then
  # Upload any PDFs or text files found in docs/
  find "${DOCS_DIR}" -type f \( -name "*.pdf" -o -name "*.txt" -o -name "*.md" \) | while read -r file; do
    filename="$(basename "${file}")"
    log "  Uploading: ${filename}"
    aws s3 cp "${file}" "s3://${BUCKET_NAME}/guidelines/${filename}" \
      --profile "${PROFILE}" \
      --region "${REGION}"
  done
  log "Document upload complete."
else
  log "  No docs/ directory found — bucket is empty. Add PDFs per docs/README.md and re-run or sync manually."
fi

# ── 4. Create Bedrock Knowledge Base ─────────────────────────────────────────
log ""
log "============================================================"
log "STEP 4: Create Bedrock Knowledge Base"
log "============================================================"
log ""
log "CloudFormation cannot provision Bedrock Knowledge Bases directly."
log "Run the following CLI command to create the KB:"
log ""
cat << EOF
aws bedrock-agent create-knowledge-base \\
  --name "sevaro-neuro-kb-${ENVIRONMENT}" \\
  --description "Sevaro neurology clinical guidelines KB (${ENVIRONMENT})" \\
  --role-arn "${KB_ROLE_ARN}" \\
  --knowledge-base-configuration '{
    "type": "VECTOR",
    "vectorKnowledgeBaseConfiguration": {
      "embeddingModelArn": "${EMBEDDING_MODEL_ARN}"
    }
  }' \\
  --storage-configuration '{
    "type": "OPENSEARCH_SERVERLESS",
    "opensearchServerlessConfiguration": {
      "collectionArn": "${COLLECTION_ARN}",
      "vectorIndexName": "sevaro-neuro-index",
      "fieldMapping": {
        "vectorField": "embedding",
        "textField": "text",
        "metadataField": "metadata"
      }
    }
  }' \\
  --profile ${PROFILE} \\
  --region ${REGION}
EOF

log ""
log "After running the above command, note the knowledgeBaseId in the response."
log ""

# ── 5. Automated KB creation (optional — uncomment if KB doesn't exist yet) ──
# Uncomment this block if you want setup.sh to create the KB automatically.
# The OpenSearch index must exist before creation — if AOSS is brand-new,
# wait 2-3 minutes after stack deploy before running this.
#
# log "Creating Bedrock Knowledge Base automatically..."
# KB_RESPONSE=$(aws bedrock-agent create-knowledge-base \
#   --name "sevaro-neuro-kb-${ENVIRONMENT}" \
#   --description "Sevaro neurology clinical guidelines KB (${ENVIRONMENT})" \
#   --role-arn "${KB_ROLE_ARN}" \
#   --knowledge-base-configuration "{\"type\":\"VECTOR\",\"vectorKnowledgeBaseConfiguration\":{\"embeddingModelArn\":\"${EMBEDDING_MODEL_ARN}\"}}" \
#   --storage-configuration "{\"type\":\"OPENSEARCH_SERVERLESS\",\"opensearchServerlessConfiguration\":{\"collectionArn\":\"${COLLECTION_ARN}\",\"vectorIndexName\":\"sevaro-neuro-index\",\"fieldMapping\":{\"vectorField\":\"embedding\",\"textField\":\"text\",\"metadataField\":\"metadata\"}}}" \
#   --profile "${PROFILE}" --region "${REGION}" 2>&1)
#
# KB_ID=$(echo "${KB_RESPONSE}" | jq -r '.knowledgeBase.knowledgeBaseId')
# log "Knowledge Base created: ${KB_ID}"

# ── 6. Create Data Source + Trigger Ingestion ─────────────────────────────────
log ""
log "After creating the KB, add an S3 data source and trigger ingestion:"
log ""
cat << 'INSTRUCTIONS'
# Replace KB_ID with the knowledgeBaseId from the create-knowledge-base response.
export KB_ID="<your-kb-id-here>"

# Create the S3 data source pointing to the guidelines bucket
aws bedrock-agent create-data-source \
  --knowledge-base-id "$KB_ID" \
  --name "sevaro-neuro-guidelines-s3" \
  --data-source-configuration "{
    \"type\": \"S3\",
    \"s3Configuration\": {
      \"bucketArn\": \"$(aws cloudformation describe-stacks --stack-name ${STACK_NAME} --query 'Stacks[0].Outputs[?OutputKey==`BucketArn`].OutputValue' --output text --profile sevaro-sandbox --region us-east-2)\",
      \"inclusionPrefixes\": [\"guidelines/\"]
    }
  }" \
  --profile sevaro-sandbox --region us-east-2

# Trigger the initial ingestion job (replace DATA_SOURCE_ID from the response above)
export DATA_SOURCE_ID="<data-source-id>"
aws bedrock-agent start-ingestion-job \
  --knowledge-base-id "$KB_ID" \
  --data-source-id "$DATA_SOURCE_ID" \
  --profile sevaro-sandbox --region us-east-2

# Monitor ingestion status
aws bedrock-agent get-ingestion-job \
  --knowledge-base-id "$KB_ID" \
  --data-source-id "$DATA_SOURCE_ID" \
  --ingestion-job-id "<job-id-from-start-ingestion-response>" \
  --profile sevaro-sandbox --region us-east-2

# Smoke test — verify the KB can retrieve content
aws bedrock-agent-runtime retrieve \
  --knowledge-base-id "$KB_ID" \
  --retrieval-query '{"text": "migraine treatment first line therapy"}' \
  --profile sevaro-sandbox --region us-east-2
INSTRUCTIONS

# ── 7. Final instructions ─────────────────────────────────────────────────────
log ""
log "============================================================"
log "FINAL STEP: Set BEDROCK_KB_ID in Amplify"
log "============================================================"
log ""
log "Once you have the KB ID:"
log "  1. Go to AWS Amplify Console → sevaro-clinical app"
log "  2. Navigate to: Hosting → Environment variables"
log "  3. Add: BEDROCK_KB_ID = <your-kb-id>"
log "  4. Add to both 'staging' and 'production' branches"
log "  5. Redeploy the app (or wait for next push to main)"
log ""
log "Setup complete. Next: add guideline PDFs per docs/README.md"
