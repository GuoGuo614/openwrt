# OpenWrt 流量监控程序 —— Makefile
#
# 用法：
#   make
#       在普通 Linux 系统上使用本地 gcc 和 libpcap-dev 编译。
#
#   make openwrt OPENWRT_SDK=$$HOME/openwrt-sdk-24.10.0-ramips-mt7621_gcc-13.3.0_musl.Linux-x86_64
#       使用 OpenWrt SDK 交叉编译，生成目标架构的可执行文件。
#       替换 OPENWRT_SDK 为你的 SDK 实际路径。

# ========== 编译目标和源文件 ==========

TARGET := traffic_monitor     # 生成的可执行文件名
SRC    := traffic_monitor.c   # 源文件

# ========== 通用编译选项 ==========

CFLAGS_COMMON := -Wall -Wextra -O2   # 启用所有警告 + O2 优化
LDLIBS_COMMON := -lpcap -lpthread    # 依赖 libpcap 和 pthread

# ========== 本地编译（默认） ==========

CC     ?= gcc
CFLAGS ?= $(CFLAGS_COMMON)
LDLIBS ?= $(LDLIBS_COMMON)

.PHONY: all openwrt check-openwrt-sdk clean

all: $(TARGET)

$(TARGET): $(SRC)
	$(CC) $(CFLAGS) -o $@ $^ $(LDLIBS)

# ========== OpenWrt SDK 交叉编译 ==========

# 以下变量需配合 OPENWRT_SDK 使用，SDK 目录结构示例：
# openwrt-sdk-24.10.0-*-gcc-13.3.0_musl.Linux-x86_64/
#   ├── staging_dir/
#   │   ├── toolchain-*_gcc-13.3.0_musl/bin/<triplet>-gcc
#   │   └── target-*/usr/include/pcap.h

OPENWRT_TRIPLET    ?= x86_64-openwrt-linux-musl
OPENWRT_CC         := $(OPENWRT_SDK)/staging_dir/toolchain-x86_64_gcc-13.3.0_musl/bin/$(OPENWRT_TRIPLET)-gcc
OPENWRT_TARGET_DIR := $(firstword $(wildcard $(OPENWRT_SDK)/staging_dir/target-*))

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

# 交叉编译前置检查
check-openwrt-sdk:
ifndef OPENWRT_SDK
	$(error OPENWRT_SDK 未设置。用法：make openwrt OPENWRT_SDK=<SDK路径>)
endif
	@test -x "$(OPENWRT_CC)" || (echo "OpenWrt 编译器未找到: $(OPENWRT_CC)" >&2; exit 1)
	@test -n "$(OPENWRT_TARGET_DIR)" || (echo "OpenWrt target 路径未找到: $(OPENWRT_SDK)/staging_dir/target-*" >&2; exit 1)
	@test -f "$(OPENWRT_TARGET_DIR)/usr/include/pcap.h" || (echo "pcap.h 未找到，请先在 SDK 中编译 libpcap" >&2; exit 1)

# ========== 清理 ==========

clean:
	rm -f $(TARGET)
