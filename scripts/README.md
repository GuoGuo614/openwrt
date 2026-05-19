# Firewall Scripts

This directory contains scripts called by the backend to manage OpenWrt firewall rules.

## Files

- `firewall.sh`: unified command-line entry for add/list/delete/clear operations.
- `firewall_rules.conf`: reserved record file for experiment-managed rules if needed.

## Planned Commands

```sh
./firewall.sh add tcp 0.0.0.0/0 8.8.8.8 80 reject
./firewall.sh list
./firewall.sh delete 1
./firewall.sh clear
```

