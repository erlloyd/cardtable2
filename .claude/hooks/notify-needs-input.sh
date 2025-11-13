#!/bin/bash
# macOS notification hook for when Claude needs user input

# Send notification when Claude needs something from the user
osascript -e 'display notification "Claude needs your input to continue" with title "Claude Code" sound name "Ping"'

exit 0
