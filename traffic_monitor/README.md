# Traffic Monitor

This module contains the C/libpcap traffic monitor.

## Planned Features

- Capture IPv4 packets from a selected interface.
- Parse source IP, destination IP, protocol, and packet length.
- Aggregate traffic by flow.
- Show command-line statistics once per second.
- Calculate total traffic, peak rate, and recent average rates.
- Write JSON output to `/tmp/traffic_stats.json` for the backend.

## Files

- `traffic_monitor.c`: main C source file.
- `Makefile`: build script for OpenWrt/Linux.
- `sample_output.md`: records command-line output examples for the report.

## Build

Install dependencies on a Linux development environment:

```sh
sudo apt update
sudo apt install build-essential libpcap-dev
```

If compiling directly on OpenWrt, install the available build tools and libpcap
packages first:

```sh
opkg update
opkg install gcc make libpcap
```

For constrained OpenWrt images, cross-compilation with the OpenWrt SDK is preferred.

```sh
make
```

## Run

List interfaces:

```sh
ip link
```

Run the monitor:

```sh
./traffic_monitor br-lan
```

The default JSON output path is `/tmp/traffic_stats.json`. You can also pass a
custom path:

```sh
./traffic_monitor br-lan /tmp/traffic_stats.json
```

Generate test traffic in another SSH session:

```sh
ping -c 4 openwrt.org
wget -O /tmp/test.html http://example.com
```

Check JSON output:

```sh
cat /tmp/traffic_stats.json
```

The program writes to a temporary file first and then renames it to the final
JSON path, so the backend will not read a half-written JSON document.
