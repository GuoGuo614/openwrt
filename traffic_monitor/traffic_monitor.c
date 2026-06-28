/**
 * OpenWrt 流量监控程序 —— 基于 libpcap 实时抓包统计
 *
 * 功能：
 *   - 捕获指定网络接口上的 IPv4 数据包
 *   - 按"源 IP → 目的 IP → 协议"三元组聚合为流（flow）
 *   - 统计累计流量、峰值速率、近期平均速率（2s / 10s / 40s）
 *   - 每 1 秒刷新终端仪表盘
 *   - 每 1 秒将统计数据原子写入 JSON 文件，供后端 API 读取
 *
 * 设计要点：
 *   - 使用独立线程处理 pcap 抓包，主线程负责打印和写 JSON
 *   - 40 个 1 秒滑动窗口桶计算多时间尺度平均速率
 *   - JSON 先写临时文件再 rename，保证后端不会读到半截数据
 *   - 支持 SIGINT / SIGTERM 信号优雅退出
 *
 * 依赖：libpcap, pthread
 * 编译：cd traffic_monitor && make
 */

#include <arpa/inet.h>
#include <net/ethernet.h>
#include <netinet/ip.h>
#include <pcap.h>
#include <pthread.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>

/* ==================== 常量定义 ==================== */

#define MAX_FLOWS        512    /* 最多同时跟踪的流数量 */
#define HISTORY_SECONDS   40    /* 滑动窗口总秒数 */
#define PRINT_LIMIT       30    /* 终端最多展示行数 */
#define DEFAULT_JSON_PATH "/tmp/traffic_stats.json"

/* ==================== 数据结构 ==================== */

/** 流的三元组标识：源 IP + 目的 IP + 协议 */
typedef struct {
    uint32_t src_ip;       /* 源 IP（网络字节序） */
    uint32_t dst_ip;       /* 目的 IP（网络字节序） */
    uint8_t  protocol;     /* IP 协议号（6=TCP, 17=UDP, 1=ICMP） */
} FlowKey;

/** 一条流的统计信息 */
typedef struct {
    int      used;                       /* 此槽位是否被占用 */
    FlowKey  key;                        /* 流标识 */
    uint64_t total_bytes;                /* 累计字节数 */
    uint64_t total_packets;              /* 累计包数 */
    uint64_t peak_bytes_per_sec;         /* 历史峰值速率（B/s） */
    uint64_t buckets[HISTORY_SECONDS];   /* 滑动窗口：每秒一个桶 */
    time_t   bucket_times[HISTORY_SECONDS]; /* 每个桶对应的时间戳 */
} FlowStat;

/** 全局监控状态 */
typedef struct {
    pcap_t             *pcap_handle;    /* libpcap 句柄 */
    FlowStat            flows[MAX_FLOWS]; /* 流表 */
    pthread_mutex_t     lock;           /* 保护流表的互斥锁 */
    volatile sig_atomic_t running;      /* 运行标志（信号安全） */
} MonitorState;

/** 全局单例 */
static MonitorState g_state;

/* ==================== 工具函数 ==================== */

/** 将 IP 协议号转为可读字符串 */
static const char *protocol_name(uint8_t protocol) {
    switch (protocol) {
    case IPPROTO_TCP:  return "TCP";
    case IPPROTO_UDP:  return "UDP";
    case IPPROTO_ICMP: return "ICMP";
    default:           return "OTHER";
    }
}

/** 将 32 位网络字节序 IP 转为点分十进制字符串 */
static void ip_to_string(uint32_t ip, char *buf, size_t size) {
    struct in_addr addr;
    addr.s_addr = ip;
    if (inet_ntop(AF_INET, &addr, buf, size) == NULL) {
        snprintf(buf, size, "unknown");
    }
}

/** 判断两个流标识是否相同 */
static int same_flow(const FlowKey *a, const FlowKey *b) {
    return a->src_ip == b->src_ip &&
           a->dst_ip == b->dst_ip &&
           a->protocol == b->protocol;
}

/* ==================== 流表管理 ==================== */

/**
 * 在流表中查找或创建流条目
 * - 已存在：返回已有条目
 * - 不存在且有空位：创建新条目
 * - 流表满：返回 NULL
 */
static FlowStat *find_or_create_flow(MonitorState *state, const FlowKey *key) {
    int free_index = -1;

    for (int i = 0; i < MAX_FLOWS; ++i) {
        if (state->flows[i].used && same_flow(&state->flows[i].key, key)) {
            return &state->flows[i];   /* 找到已有流 */
        }
        if (!state->flows[i].used && free_index < 0) {
            free_index = i;            /* 记录第一个空闲位置 */
        }
    }

    if (free_index < 0) {
        return NULL;                   /* 流表已满 */
    }

    FlowStat *flow = &state->flows[free_index];
    memset(flow, 0, sizeof(*flow));
    flow->used = 1;
    flow->key  = *key;
    return flow;
}

/**
 * 向流条目追加流量数据
 *
 * 滑动窗口机制：
 *   使用 40 个桶（buckets），hash = timestamp % 40。
 *   如果新时间戳和旧的不同 → 新的一秒开始，桶清零。
 *   这样最近 40 秒的数据可以按秒精度独立保存，用于计算 2s/10s/40s 平均。
 */
static void add_flow_bytes(FlowStat *flow, time_t packet_sec, uint32_t bytes) {
    int index = (int)(packet_sec % HISTORY_SECONDS);

    /* 新的秒区间 → 重置该桶 */
    if (flow->bucket_times[index] != packet_sec) {
        flow->bucket_times[index] = packet_sec;
        flow->buckets[index] = 0;
    }

    flow->buckets[index] += bytes;
    flow->total_bytes    += bytes;
    flow->total_packets  += 1;

    /* 更新峰值 */
    if (flow->buckets[index] > flow->peak_bytes_per_sec) {
        flow->peak_bytes_per_sec = flow->buckets[index];
    }
}

/**
 * 计算最近 N 秒的平均速率（B/s）
 * 滑动窗口长度为 HISTORY_SECONDS（40 秒），取其中 [now - seconds + 1, now] 范围的桶求平均。
 */
static uint64_t recent_average_bps(const FlowStat *flow, time_t now, int seconds) {
    uint64_t sum = 0;
    time_t oldest = now - seconds + 1;

    for (int i = 0; i < HISTORY_SECONDS; ++i) {
        if (flow->bucket_times[i] >= oldest && flow->bucket_times[i] <= now) {
            sum += flow->buckets[i];
        }
    }

    return sum / (uint64_t)seconds;
}

/* ==================== 数据包处理 ==================== */

/**
 * libpcap 回调函数 —— 每收到一个数据包就调用一次
 *
 * 处理流程：
 *   以太网帧 → 检查是否为 IPv4 → 解析 IP 头 → 提取五元组 → 更新流表
 */
static void packet_handler(unsigned char *user,
                           const struct pcap_pkthdr *header,
                           const unsigned char *packet) {
    MonitorState *state = (MonitorState *)user;

    /* 1) 检查以太网帧头长度 */
    if (header->caplen < sizeof(struct ether_header)) {
        return;
    }

    /* 2) 仅处理 IPv4 包 */
    const struct ether_header *eth = (const struct ether_header *)packet;
    if (ntohs(eth->ether_type) != ETHERTYPE_IP) {
        return;
    }

    /* 3) 解析 IP 头 */
    const unsigned char *ip_packet = packet + sizeof(struct ether_header);
    uint32_t ip_packet_len = header->caplen - sizeof(struct ether_header);

    if (ip_packet_len < sizeof(struct ip)) {
        return;
    }

    const struct ip *ip_header = (const struct ip *)ip_packet;
    uint32_t ip_header_len = (uint32_t)ip_header->ip_hl * 4U;

    if (ip_header->ip_v != 4 || ip_header_len < sizeof(struct ip) ||
        ip_packet_len < ip_header_len) {
        return;
    }

    /* 4) 提取三元组（源 IP、目的 IP、协议） */
    FlowKey key;
    key.src_ip   = ip_header->ip_src.s_addr;
    key.dst_ip   = ip_header->ip_dst.s_addr;
    key.protocol = ip_header->ip_p;

    /* 5) 计算载荷字节数 */
    uint16_t ip_total_len = ntohs(ip_header->ip_len);
    uint32_t bytes = ip_total_len > 0 ? ip_total_len : header->len;
    time_t packet_sec = (time_t)header->ts.tv_sec;

    /* 6) 加锁更新流表 */
    pthread_mutex_lock(&state->lock);
    FlowStat *flow = find_or_create_flow(state, &key);
    if (flow != NULL) {
        add_flow_bytes(flow, packet_sec, bytes);
    }
    pthread_mutex_unlock(&state->lock);
}

/* ==================== 抓包线程 ==================== */

/** 后台线程：阻塞式循环抓包，直到 running 标志被清除 */
static void *capture_thread(void *arg) {
    MonitorState *state = (MonitorState *)arg;
    int rc = pcap_loop(state->pcap_handle, -1, packet_handler,
                       (unsigned char *)state);

    if (rc == PCAP_ERROR && state->running) {
        fprintf(stderr, "pcap_loop failed: %s\n",
                pcap_geterr(state->pcap_handle));
    }

    return NULL;
}

/* ==================== 输出格式化 ==================== */

/** 打印速率（自动选择 B/s / KB/s / MB/s） */
static void print_rate(uint64_t bytes_per_sec) {
    if (bytes_per_sec < 1024) {
        printf("%8llu B/s", (unsigned long long)bytes_per_sec);
    } else if (bytes_per_sec < 1024 * 1024) {
        printf("%8.1f KB/s", (double)bytes_per_sec / 1024.0);
    } else {
        printf("%8.1f MB/s", (double)bytes_per_sec / 1024.0 / 1024.0);
    }
}

/** 打印字节数（自动选择 B / KB / MB） */
static void print_bytes(uint64_t bytes) {
    if (bytes < 1024) {
        printf("%8llu B", (unsigned long long)bytes);
    } else if (bytes < 1024 * 1024) {
        printf("%8.1f KB", (double)bytes / 1024.0);
    } else {
        printf("%8.1f MB", (double)bytes / 1024.0 / 1024.0);
    }
}

/** 按累计流量降序排序（用于 qsort） */
static int compare_flow_total_desc(const void *a, const void *b) {
    const FlowStat *fa = *(const FlowStat *const *)a;
    const FlowStat *fb = *(const FlowStat *const *)b;

    if (fa->total_bytes < fb->total_bytes) return  1;
    if (fa->total_bytes > fb->total_bytes) return -1;
    return 0;
}

/**
 * 采集流表快照
 * 加锁复制流表 → 过滤出已使用的条目 → 按流量降序排列。
 * 返回活跃流数量。
 */
static int collect_snapshot(MonitorState *state, FlowStat *snapshot,
                            FlowStat **visible) {
    int count = 0;

    /* 加锁复制整张流表，最小化持锁时间 */
    pthread_mutex_lock(&state->lock);
    memcpy(snapshot, state->flows, sizeof(FlowStat) * MAX_FLOWS);
    pthread_mutex_unlock(&state->lock);

    for (int i = 0; i < MAX_FLOWS; ++i) {
        if (snapshot[i].used) {
            visible[count++] = &snapshot[i];
        }
    }

    qsort(visible, count, sizeof(visible[0]), compare_flow_total_desc);
    return count;
}

/**
 * 终端输出：全屏刷新仪表盘
 * 使用 ANSI 转义码 \033[2J\033[H 清屏并移动光标到左上角。
 */
static void print_stats(MonitorState *state, const char *iface,
                        const char *json_path) {
    FlowStat  snapshot[MAX_FLOWS];
    FlowStat *visible[MAX_FLOWS];
    time_t now = time(NULL);
    int count = collect_snapshot(state, snapshot, visible);

    printf("\033[2J\033[H");                         /* 清屏 */
    printf("OpenWrt libpcap traffic monitor\n");
    printf("Interface: %s | flows: %d | time: %ld\n", iface, count, (long)now);
    printf("JSON output: %s\n\n", json_path);

    /* 表头 */
    printf("%-15s %-15s %-6s %10s %10s %13s %13s %13s %13s\n",
           "Source", "Destination", "Proto", "Packets", "Total",
           "Peak", "Avg-2s", "Avg-10s", "Avg-40s");
    printf("%-15s %-15s %-6s %10s %10s %13s %13s %13s %13s\n",
           "---------------", "---------------", "------", "----------",
           "----------", "-------------", "-------------", "-------------",
           "-------------");

    /* 只打印流量最大的前 PRINT_LIMIT 条 */
    int rows = count < PRINT_LIMIT ? count : PRINT_LIMIT;
    for (int i = 0; i < rows; ++i) {
        char src[INET_ADDRSTRLEN];
        char dst[INET_ADDRSTRLEN];
        FlowStat *flow = visible[i];

        ip_to_string(flow->key.src_ip, src, sizeof(src));
        ip_to_string(flow->key.dst_ip, dst, sizeof(dst));

        printf("%-15s %-15s %-6s %10llu ",
               src, dst, protocol_name(flow->key.protocol),
               (unsigned long long)flow->total_packets);
        print_bytes(flow->total_bytes);
        printf(" ");
        print_rate(flow->peak_bytes_per_sec);
        printf(" ");
        print_rate(recent_average_bps(flow, now, 2));
        printf(" ");
        print_rate(recent_average_bps(flow, now, 10));
        printf(" ");
        print_rate(recent_average_bps(flow, now, 40));
        printf("\n");
    }

    if (count > PRINT_LIMIT) {
        printf("\nOnly top %d flows are displayed. Total tracked flows: %d\n",
               PRINT_LIMIT, count);
    }
    printf("\nPress Ctrl+C to stop.\n");
    fflush(stdout);
}

/**
 * JSON 输出：原子写入 /tmp/traffic_stats.json
 *
 * 写入流程（保证后端不会读到半截文件）：
 *   1) 写入临时文件  /tmp/traffic_stats.json.tmp.<PID>
 *   2) fflush + fsync 确保数据落盘
 *   3) fclose 关闭临时文件
 *   4) rename 临时文件 → 最终路径（同一文件系统内 rename 是原子操作）
 *
 * 任何一步失败都会清理临时文件并返回错误。
 */
static int write_json_stats(MonitorState *state, const char *iface,
                            const char *json_path) {
    FlowStat  snapshot[MAX_FLOWS];
    FlowStat *visible[MAX_FLOWS];
    char   tmp_path[512];
    FILE  *fp;
    time_t now = time(NULL);
    int count = collect_snapshot(state, snapshot, visible);

    /* 构造临时文件名 */
    if (snprintf(tmp_path, sizeof(tmp_path), "%s.tmp.%ld",
                 json_path, (long)getpid()) >= (int)sizeof(tmp_path)) {
        fprintf(stderr, "JSON path is too long: %s\n", json_path);
        return -1;
    }

    /* 打开临时文件 */
    fp = fopen(tmp_path, "w");
    if (fp == NULL) {
        perror("fopen JSON temp file");
        return -1;
    }

    /* 写入 JSON */
    fprintf(fp, "{\n");
    fprintf(fp, "  \"ok\": true,\n");
    fprintf(fp, "  \"timestamp\": %ld,\n", (long)now);
    fprintf(fp, "  \"interface\": \"%s\",\n", iface);
    fprintf(fp, "  \"flow_count\": %d,\n", count);
    fprintf(fp, "  \"flows\": [\n");

    for (int i = 0; i < count; ++i) {
        char src[INET_ADDRSTRLEN];
        char dst[INET_ADDRSTRLEN];
        FlowStat *flow = visible[i];

        ip_to_string(flow->key.src_ip, src, sizeof(src));
        ip_to_string(flow->key.dst_ip, dst, sizeof(dst));

        fprintf(fp, "    {\n");
        fprintf(fp, "      \"src_ip\": \"%s\",\n", src);
        fprintf(fp, "      \"dst_ip\": \"%s\",\n", dst);
        fprintf(fp, "      \"protocol\": \"%s\",\n",
                protocol_name(flow->key.protocol));
        fprintf(fp, "      \"protocol_number\": %u,\n",
                (unsigned int)flow->key.protocol);
        fprintf(fp, "      \"total_packets\": %llu,\n",
                (unsigned long long)flow->total_packets);
        fprintf(fp, "      \"total_bytes\": %llu,\n",
                (unsigned long long)flow->total_bytes);
        fprintf(fp, "      \"peak_bps\": %llu,\n",
                (unsigned long long)flow->peak_bytes_per_sec);
        fprintf(fp, "      \"avg_2s_bps\": %llu,\n",
                (unsigned long long)recent_average_bps(flow, now, 2));
        fprintf(fp, "      \"avg_10s_bps\": %llu,\n",
                (unsigned long long)recent_average_bps(flow, now, 10));
        fprintf(fp, "      \"avg_40s_bps\": %llu\n",
                (unsigned long long)recent_average_bps(flow, now, 40));
        fprintf(fp, "    }%s\n", i == count - 1 ? "" : ",");
    }

    fprintf(fp, "  ]\n");
    fprintf(fp, "}\n");

    /* 三步确保落盘：fflush → fsync → fclose */
    if (fflush(fp) != 0) {
        perror("fflush JSON temp file");
        fclose(fp);
        unlink(tmp_path);
        return -1;
    }

    if (fsync(fileno(fp)) != 0) {
        perror("fsync JSON temp file");
        fclose(fp);
        unlink(tmp_path);
        return -1;
    }

    if (fclose(fp) != 0) {
        perror("fclose JSON temp file");
        unlink(tmp_path);
        return -1;
    }

    /* 原子替换：同一文件系统内 rename 保证原子性 */
    if (rename(tmp_path, json_path) != 0) {
        perror("rename JSON temp file");
        unlink(tmp_path);
        return -1;
    }

    return 0;
}

/* ==================== 信号处理 ==================== */

/** SIGINT / SIGTERM 处理：设置退出标志 + 中断 pcap_loop */
static void handle_signal(int signo) {
    (void)signo;
    g_state.running = 0;
    if (g_state.pcap_handle != NULL) {
        pcap_breakloop(g_state.pcap_handle);
    }
}

/* ==================== 网卡初始化 ==================== */

/**
 * 打开网络接口开始抓包
 * - 获取接口网络号和掩码
 * - 打开实时捕获（混杂模式，1 秒超时）
 * - 检查数据链路类型（必须是以太网 DLT_EN10MB）
 * - 编译并设置 BPF 过滤器 "ip"（只抓 IP 包）
 */
static int open_capture(const char *iface, pcap_t **handle_out) {
    char errbuf[PCAP_ERRBUF_SIZE];
    struct bpf_program filter;
    pcap_t *handle;
    bpf_u_int32 net  = 0;
    bpf_u_int32 mask = 0;

    errbuf[0] = '\0';

    /* 获取接口网络号（可能失败，不影响后续） */
    if (pcap_lookupnet(iface, &net, &mask, errbuf) == -1) {
        fprintf(stderr, "warning: pcap_lookupnet failed: %s\n", errbuf);
        net  = 0;
        mask = 0;
    }

    /* 打开实时捕获：最大包长 65535、混杂模式、1 秒超时 */
    handle = pcap_open_live(iface, 65535, 1, 1000, errbuf);
    if (handle == NULL) {
        fprintf(stderr, "pcap_open_live failed on %s: %s\n", iface, errbuf);
        return -1;
    }

    /* 确保数据链路层是以太网 */
    if (pcap_datalink(handle) != DLT_EN10MB) {
        fprintf(stderr,
                "unsupported datalink type: %d. "
                "This program expects Ethernet.\n",
                pcap_datalink(handle));
        pcap_close(handle);
        return -1;
    }

    /* 编译 BPF 过滤器：只抓 IPv4 包 */
    if (pcap_compile(handle, &filter, "ip", 1, mask) == -1) {
        fprintf(stderr, "pcap_compile failed: %s\n", pcap_geterr(handle));
        pcap_close(handle);
        return -1;
    }

    /* 应用过滤器 */
    if (pcap_setfilter(handle, &filter) == -1) {
        fprintf(stderr, "pcap_setfilter failed: %s\n", pcap_geterr(handle));
        pcap_freecode(&filter);
        pcap_close(handle);
        return -1;
    }

    pcap_freecode(&filter);
    *handle_out = handle;
    return 0;
}

/** 打印用法 */
static void print_usage(const char *program) {
    fprintf(stderr, "Usage: %s <interface> [json_path]\n", program);
    fprintf(stderr, "Example: %s br-lan\n", program);
    fprintf(stderr, "Example: %s eth0 /tmp/traffic_stats.json\n", program);
}

/* ==================== 主函数 ==================== */

int main(int argc, char **argv) {
    const char *iface;
    const char *json_path;
    pthread_t tid;

    /* 解析命令行参数 */
    if (argc < 2 || argc > 3) {
        print_usage(argv[0]);
        return 1;
    }
    iface     = argv[1];
    json_path = argc == 3 ? argv[2] : DEFAULT_JSON_PATH;

    /* 初始化全局状态 */
    memset(&g_state, 0, sizeof(g_state));
    pthread_mutex_init(&g_state.lock, NULL);
    g_state.running = 1;

    /* 注册信号处理：Ctrl+C 和 kill 均可优雅退出 */
    signal(SIGINT,  handle_signal);
    signal(SIGTERM, handle_signal);

    /* 打开网卡 */
    if (open_capture(iface, &g_state.pcap_handle) != 0) {
        pthread_mutex_destroy(&g_state.lock);
        return 1;
    }

    /* 启动抓包线程 */
    if (pthread_create(&tid, NULL, capture_thread, &g_state) != 0) {
        fprintf(stderr, "failed to create capture thread\n");
        pcap_close(g_state.pcap_handle);
        pthread_mutex_destroy(&g_state.lock);
        return 1;
    }

    /* 主循环：每秒刷新终端 + 写 JSON */
    while (g_state.running) {
        print_stats(&g_state, iface, json_path);
        write_json_stats(&g_state, iface, json_path);
        sleep(1);
    }

    /* 清理资源 */
    pthread_join(tid, NULL);
    pcap_close(g_state.pcap_handle);
    pthread_mutex_destroy(&g_state.lock);
    printf("\ntraffic monitor stopped.\n");
    return 0;
}
