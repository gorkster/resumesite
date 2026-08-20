#!/bin/bash

# Path to your master markdown CV
CV_SOURCE="$HOME/career-ops/cv.md"

# Path to the Hugo content file
DESTINATION="content/_index.md"

echo "Syncing CV to Hugo site..."

# Create the required Hugo frontmatter and overwrite the existing file
cat <<EOF > "$DESTINATION"
---
title: "Andrew Gortmaker - Resume"
---
EOF

# Append the raw markdown contents, using sed to dynamically replace the email and phone with the Hugo obfuscation shortcode
cat "$CV_SOURCE" | \
    sed -E 's/\*\*Email:\*\* .*/\*\*Email:\*\* \{\{< contact "email" >\}\}/' | \
    sed -E 's/\*\*Phone:\*\* .*/\*\*Phone:\*\* \{\{< contact "phone" >\}\}/' \
    >> "$DESTINATION"


echo "Successfully updated $DESTINATION with contents from $CV_SOURCE!"
