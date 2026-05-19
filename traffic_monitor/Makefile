TARGET := traffic_monitor
SRC := traffic_monitor.c

# Usage:
#   make
#       Build on a normal Linux system with local gcc and libpcap-dev.
#
#   make openwrt OPENWRT_SDK=$$HOME/openwrt-sdk-24.10.0-x86-64_gcc-13.3.0_musl.Linux-x86_64
#       Cross-compile for OpenWrt x86/64 with the OpenWrt SDK.

CFLAGS_COMMON := -Wall -Wextra -O2
LDLIBS_COMMON := -lpcap -lpthread

CC ?= gcc
CFLAGS ?= $(CFLAGS_COMMON)
LDLIBS ?= $(LDLIBS_COMMON)

OPENWRT_TRIPLET ?= x86_64-openwrt-linux-musl
OPENWRT_CC := $(OPENWRT_SDK)/staging_dir/toolchain-x86_64_gcc-13.3.0_musl/bin/$(OPENWRT_TRIPLET)-gcc
OPENWRT_TARGET_DIR := $(firstword $(wildcard $(OPENWRT_SDK)/staging_dir/target-*))

.PHONY: all openwrt check-openwrt-sdk clean

all: $(TARGET)

$(TARGET): $(SRC)
	$(CC) $(CFLAGS) -o $@ $^ $(LDLIBS)

openwrt: check-openwrt-sdk
	STAGING_DIR="$(OPENWRT_SDK)/staging_dir" \
	"$(OPENWRT_CC)" \
		$(CFLAGS_COMMON) \
		--sysroot="$(OPENWRT_TARGET_DIR)" \
		-I"$(OPENWRT_TARGET_DIR)/usr/include" \
		-L"$(OPENWRT_TARGET_DIR)/usr/lib" \
		-o "$(TARGET)" \
		"$(SRC)" \
		$(LDLIBS_COMMON)

check-openwrt-sdk:
ifndef OPENWRT_SDK
	$(error OPENWRT_SDK is not set. Example: make openwrt OPENWRT_SDK=$$HOME/openwrt-sdk-24.10.0-x86-64_gcc-13.3.0_musl.Linux-x86_64)
endif
	@test -x "$(OPENWRT_CC)" || (echo "OpenWrt compiler not found: $(OPENWRT_CC)" >&2; exit 1)
	@test -n "$(OPENWRT_TARGET_DIR)" || (echo "OpenWrt target staging directory not found under $(OPENWRT_SDK)/staging_dir" >&2; exit 1)
	@test -f "$(OPENWRT_TARGET_DIR)/usr/include/pcap.h" || (echo "pcap.h not found. Build libpcap in the SDK first." >&2; exit 1)

clean:
	rm -f $(TARGET)
