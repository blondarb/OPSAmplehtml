#!/usr/bin/env bash
# Grant the OPSAmple Amplify SSR compute role read access to the Asana PAT so
# /launchpad can pull live open items in production.
#
# Steve runs this (IAM writes are blocked from Claude sessions):
#   aws sso login --profile sevaro-sandbox
#   bash scripts/ops/launchpad-asana-iam-policy.sh          # dry run: prints the new policy
#   bash scripts/ops/launchpad-asana-iam-policy.sh --apply  # writes it
#
# What it does: appends arn:...:secret:sevaro/asana/* to the existing
# secretsmanager:GetSecretValue Resource list on the role's inline policy
# `OPSAmpleAccess`. Nothing else in the policy changes. Idempotent.
#
# Alternative (no IAM change): set ASANA_PAT as an Amplify environment variable
# on app d3ietjwgco4g2t and rebuild — the code reads the env var first.
set -euo pipefail

PROFILE="${AWS_PROFILE:-sevaro-sandbox}"
ROLE="OPSAmple-AmplifySSR"
POLICY="OPSAmpleAccess"
NEW_ARN="arn:aws:secretsmanager:us-east-2:873370528823:secret:sevaro/asana/*"
APPLY=0
[[ "${1:-}" == "--apply" ]] && APPLY=1

current=$(aws iam get-role-policy --profile "$PROFILE" --role-name "$ROLE" \
  --policy-name "$POLICY" --query PolicyDocument --output json)

updated=$(python3 - "$current" "$NEW_ARN" <<'PY'
import json, sys
doc = json.loads(sys.argv[1]); new_arn = sys.argv[2]
hit = False
for st in doc["Statement"]:
    actions = st.get("Action", [])
    actions = [actions] if isinstance(actions, str) else actions
    if any(a.startswith("secretsmanager:") for a in actions):
        res = st.get("Resource", [])
        res = [res] if isinstance(res, str) else list(res)
        if new_arn not in res:
            res.append(new_arn)
        st["Resource"] = res
        hit = True
        break
if not hit:
    sys.exit("no secretsmanager statement found in policy — inspect by hand")
print(json.dumps(doc, indent=2))
PY
)

if [[ $APPLY -eq 0 ]]; then
  echo "DRY RUN — would put this policy document on $ROLE/$POLICY:"
  echo "$updated"
  echo; echo "Re-run with --apply to write it."
  exit 0
fi

aws iam put-role-policy --profile "$PROFILE" --role-name "$ROLE" \
  --policy-name "$POLICY" --policy-document "$updated"
echo "Applied. Verify:"
aws iam get-role-policy --profile "$PROFILE" --role-name "$ROLE" --policy-name "$POLICY" \
  --query "PolicyDocument.Statement[?contains(to_string(Action),'secretsmanager')].Resource" --output json
echo "Then: open https://app.neuroplans.app/api/launchpad/open-items while logged in — expect ok:true."
