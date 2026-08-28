#!/usr/bin/env bash
#
# Sets up the manual test for the dialout modal, which only appears for a user
# who is not in the group. A session keeps the groups it was handed at login and
# there is no way to drop one from a running process, so this takes you out of
# /etc/group and logs you out. The next login has no dialout, everywhere.
#
#   1. run this, log back in
#   2. yarn dev, pick RTU      -> the modal appears, no ports listed
#   3. Run command             -> pkexec, then it asks you to log out
#   4. Log out now             -> the desktop confirms first
#   5. log back in, yarn dev   -> no modal, the port is there
#
# Step 3 already puts you back in /etc/group. To undo it without the round trip:
# sudo gpasswd -a "$USER" dialout, then log out and back in.
set -e
sudo gpasswd -d "$USER" dialout
cinnamon-session-quit --logout
