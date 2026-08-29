#!/usr/bin/env bash
#
# Toggles the kernel's unprivileged port floor between 502 and 1024, to get at
# the privileged port modal. At 1024 the server cannot bind Modbus' own port and
# offers to fix it; at 502 it stays quiet.
#
# Not persistent on purpose: a reboot puts it back at 1024, which is what a new
# Linux user starts from.
set -e
KEY=net.ipv4.ip_unprivileged_port_start
current=$(sysctl -n $KEY)
[ "$current" -le 502 ] && target=1024 || target=502
read -rp "  Currently $current. Set to $target? [Y/n] " answer
[[ ${answer:-y} =~ ^[Yy]$ ]] || exit 0
sudo sysctl -w $KEY=$target > /dev/null

# Read it back rather than trust the write.
now=$(sysctl -n $KEY)
[ "$now" -le 502 ] && say="502 binds, the modal stays away" \
                   || say="502 refuses, the server falls back to $now and the modal offers to fix it"
echo "  Now $now — $say"
