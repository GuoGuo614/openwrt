# OpenWrt Network Application Lab

This project is for Experiment 2: network application development based on OpenWrt.

It contains a C/libpcap traffic monitor, a lightweight HTTP backend, a web frontend,
firewall management scripts, and experiment notes for AI-assisted development records.

## Directory Structure

```text
.
├── traffic_monitor/        # C/libpcap traffic monitor
├── backend/                # HTTP API service
├── frontend/               # Web UI for traffic and firewall modules
├── scripts/                # OpenWrt firewall rule scripts
└── report_notes/           # AI prompts, setup notes, test records, screenshots
```

## Modules

### traffic_monitor

Captures packets on an OpenWrt network interface, parses IP traffic, calculates flow
statistics, prints command-line output, and writes real-time JSON data to
`/tmp/traffic_stats.json`.

### backend

Provides HTTP APIs for the frontend:

- `GET /api/traffic`: read traffic statistics from `/tmp/traffic_stats.json`.
- `POST /api/firewall/add`: add a firewall rule.
- `GET /api/firewall/list`: list experiment firewall rules.
- `POST /api/firewall/delete`: delete a rule.
- `POST /api/firewall/clear`: clear experiment firewall rules.

### frontend

Displays traffic statistics and provides a firewall rule configuration page.

### scripts

Contains shell scripts called by the backend to manage firewall rules on OpenWrt.

### report_notes

Stores the experiment process and AI interaction records required by the lab report.

## Suggested Development Order

1. Finish OpenWrt VM network and SSH setup.
2. Implement and test the command-line C traffic monitor.
3. Add JSON output to the traffic monitor.
4. Implement backend traffic API.
5. Implement traffic monitor web page.
6. Implement firewall shell script.
7. Implement firewall backend APIs.
8. Implement firewall web page.
9. Write README, lab report notes, and demo video script.

## Build And Run

Detailed commands will be added as each module is implemented.

For the C module:

```sh
cd traffic_monitor
make
./traffic_monitor br-lan
```

For the backend:

```sh
cd backend
python3 app.py
```

For the frontend, open `frontend/index.html` or serve it through the backend.

