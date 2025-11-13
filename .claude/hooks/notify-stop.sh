#!/bin/bash
# macOS notification hook for when Claude stops/completes work

# Send notification when Claude stops
osascript -e 'display notification "Claude has completed the task" with title "Claude Code" sound name "Glass"'

exit 0
