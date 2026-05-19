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

#define MAX_FLOWS 512
#define HISTORY_SECONDS 40
#define PRINT_LIMIT 30
#define DEFAULT_JSON_PATH "/tmp/traffic_stats.json"

typedef struct {
    uint32_t src_ip;
    uint32_t dst_ip;
    uint8_t protocol;
} FlowKey;

typedef struct {
    int used;
    FlowKey key;
    uint64_t total_bytes;
    uint64_t total_packets;
    uint64_t peak_bytes_per_sec;
    uint64_t buckets[HISTORY_SECONDS];
    time_t bucket_times[HISTORY_SECONDS];
} FlowStat;

typedef struct {
    pcap_t *pcap_handle;
    FlowStat flows[MAX_FLOWS];
    pthread_mutex_t lock;
    volatile sig_atomic_t running;
} MonitorState;

static MonitorState g_state;

static const char *protocol_name(uint8_t protocol) {
    switch (protocol) {
    case IPPROTO_TCP:
        return "TCP";
    case IPPROTO_UDP:
        return "UDP";
    case IPPROTO_ICMP:
        return "ICMP";
    default:
        return "OTHER";
    }
}

static void ip_to_string(uint32_t ip, char *buf, size_t size) {
    struct in_addr addr;
    addr.s_addr = ip;
    if (inet_ntop(AF_INET, &addr, buf, size) == NULL) {
        snprintf(buf, size, "unknown");
    }
}

static int same_flow(const FlowKey *a, const FlowKey *b) {
    return a->src_ip == b->src_ip &&
           a->dst_ip == b->dst_ip &&
           a->protocol == b->protocol;
}

static FlowStat *find_or_create_flow(MonitorState *state, const FlowKey *key) {
    int free_index = -1;

    for (int i = 0; i < MAX_FLOWS; ++i) {
        if (state->flows[i].used && same_flow(&state->flows[i].key, key)) {
            return &state->flows[i];
        }
        if (!state->flows[i].used && free_index < 0) {
            free_index = i;
        }
    }

    if (free_index < 0) {
        return NULL;
    }

    FlowStat *flow = &state->flows[free_index];
    memset(flow, 0, sizeof(*flow));
    flow->used = 1;
    flow->key = *key;
    return flow;
}

static void add_flow_bytes(FlowStat *flow, time_t packet_sec, uint32_t bytes) {
    int index = (int)(packet_sec % HISTORY_SECONDS);

    if (flow->bucket_times[index] != packet_sec) {
        flow->bucket_times[index] = packet_sec;
        flow->buckets[index] = 0;
    }

    flow->buckets[index] += bytes;
    flow->total_bytes += bytes;
    flow->total_packets += 1;

    if (flow->buckets[index] > flow->peak_bytes_per_sec) {
        flow->peak_bytes_per_sec = flow->buckets[index];
    }
}

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

static void packet_handler(unsigned char *user,
                           const struct pcap_pkthdr *header,
                           const unsigned char *packet) {
    MonitorState *state = (MonitorState *)user;

    if (header->caplen < sizeof(struct ether_header)) {
        return;
    }

    const struct ether_header *eth = (const struct ether_header *)packet;
    if (ntohs(eth->ether_type) != ETHERTYPE_IP) {
        return;
    }

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

    FlowKey key;
    key.src_ip = ip_header->ip_src.s_addr;
    key.dst_ip = ip_header->ip_dst.s_addr;
    key.protocol = ip_header->ip_p;

    uint16_t ip_total_len = ntohs(ip_header->ip_len);
    uint32_t bytes = ip_total_len > 0 ? ip_total_len : header->len;
    time_t packet_sec = (time_t)header->ts.tv_sec;

    pthread_mutex_lock(&state->lock);
    FlowStat *flow = find_or_create_flow(state, &key);
    if (flow != NULL) {
        add_flow_bytes(flow, packet_sec, bytes);
    }
    pthread_mutex_unlock(&state->lock);
}

static void *capture_thread(void *arg) {
    MonitorState *state = (MonitorState *)arg;
    int rc = pcap_loop(state->pcap_handle, -1, packet_handler, (unsigned char *)state);

    if (rc == PCAP_ERROR && state->running) {
        fprintf(stderr, "pcap_loop failed: %s\n", pcap_geterr(state->pcap_handle));
    }

    return NULL;
}

static void print_rate(uint64_t bytes_per_sec) {
    if (bytes_per_sec < 1024) {
        printf("%8llu B/s", (unsigned long long)bytes_per_sec);
    } else if (bytes_per_sec < 1024 * 1024) {
        printf("%8.1f KB/s", (double)bytes_per_sec / 1024.0);
    } else {
        printf("%8.1f MB/s", (double)bytes_per_sec / 1024.0 / 1024.0);
    }
}

static void print_bytes(uint64_t bytes) {
    if (bytes < 1024) {
        printf("%8llu B", (unsigned long long)bytes);
    } else if (bytes < 1024 * 1024) {
        printf("%8.1f KB", (double)bytes / 1024.0);
    } else {
        printf("%8.1f MB", (double)bytes / 1024.0 / 1024.0);
    }
}

static int compare_flow_total_desc(const void *a, const void *b) {
    const FlowStat *fa = *(const FlowStat *const *)a;
    const FlowStat *fb = *(const FlowStat *const *)b;

    if (fa->total_bytes < fb->total_bytes) {
        return 1;
    }
    if (fa->total_bytes > fb->total_bytes) {
        return -1;
    }
    return 0;
}

static int collect_snapshot(MonitorState *state, FlowStat *snapshot, FlowStat **visible) {
    int count = 0;

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

static void print_stats(MonitorState *state, const char *iface, const char *json_path) {
    FlowStat snapshot[MAX_FLOWS];
    FlowStat *visible[MAX_FLOWS];
    time_t now = time(NULL);
    int count = collect_snapshot(state, snapshot, visible);

    printf("\033[2J\033[H");
    printf("OpenWrt libpcap traffic monitor\n");
    printf("Interface: %s | flows: %d | time: %ld\n", iface, count, (long)now);
    printf("JSON output: %s\n\n", json_path);
    printf("%-15s %-15s %-6s %10s %10s %13s %13s %13s %13s\n",
           "Source", "Destination", "Proto", "Packets", "Total",
           "Peak", "Avg-2s", "Avg-10s", "Avg-40s");
    printf("%-15s %-15s %-6s %10s %10s %13s %13s %13s %13s\n",
           "---------------", "---------------", "------", "----------",
           "----------", "-------------", "-------------", "-------------",
           "-------------");

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

static int write_json_stats(MonitorState *state, const char *iface, const char *json_path) {
    FlowStat snapshot[MAX_FLOWS];
    FlowStat *visible[MAX_FLOWS];
    char tmp_path[512];
    FILE *fp;
    time_t now = time(NULL);
    int count = collect_snapshot(state, snapshot, visible);

    if (snprintf(tmp_path, sizeof(tmp_path), "%s.tmp.%ld",
                 json_path, (long)getpid()) >= (int)sizeof(tmp_path)) {
        fprintf(stderr, "JSON path is too long: %s\n", json_path);
        return -1;
    }

    fp = fopen(tmp_path, "w");
    if (fp == NULL) {
        perror("fopen JSON temp file");
        return -1;
    }

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
        fprintf(fp, "      \"protocol\": \"%s\",\n", protocol_name(flow->key.protocol));
        fprintf(fp, "      \"protocol_number\": %u,\n", (unsigned int)flow->key.protocol);
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

    if (rename(tmp_path, json_path) != 0) {
        perror("rename JSON temp file");
        unlink(tmp_path);
        return -1;
    }

    return 0;
}

static void handle_signal(int signo) {
    (void)signo;
    g_state.running = 0;
    if (g_state.pcap_handle != NULL) {
        pcap_breakloop(g_state.pcap_handle);
    }
}

static int open_capture(const char *iface, pcap_t **handle_out) {
    char errbuf[PCAP_ERRBUF_SIZE];
    struct bpf_program filter;
    pcap_t *handle;
    bpf_u_int32 net = 0;
    bpf_u_int32 mask = 0;

    errbuf[0] = '\0';

    if (pcap_lookupnet(iface, &net, &mask, errbuf) == -1) {
        fprintf(stderr, "warning: pcap_lookupnet failed: %s\n", errbuf);
        net = 0;
        mask = 0;
    }

    handle = pcap_open_live(iface, 65535, 1, 1000, errbuf);
    if (handle == NULL) {
        fprintf(stderr, "pcap_open_live failed on %s: %s\n", iface, errbuf);
        return -1;
    }

    if (pcap_datalink(handle) != DLT_EN10MB) {
        fprintf(stderr, "unsupported datalink type: %d. This program expects Ethernet.\n",
                pcap_datalink(handle));
        pcap_close(handle);
        return -1;
    }

    if (pcap_compile(handle, &filter, "ip", 1, mask) == -1) {
        fprintf(stderr, "pcap_compile failed: %s\n", pcap_geterr(handle));
        pcap_close(handle);
        return -1;
    }

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

static void print_usage(const char *program) {
    fprintf(stderr, "Usage: %s <interface> [json_path]\n", program);
    fprintf(stderr, "Example: %s br-lan\n", program);
    fprintf(stderr, "Example: %s eth0 /tmp/traffic_stats.json\n", program);
}

int main(int argc, char **argv) {
    const char *iface;
    const char *json_path;
    pthread_t tid;

    if (argc < 2 || argc > 3) {
        print_usage(argv[0]);
        return 1;
    }
    iface = argv[1];
    json_path = argc == 3 ? argv[2] : DEFAULT_JSON_PATH;

    memset(&g_state, 0, sizeof(g_state));
    pthread_mutex_init(&g_state.lock, NULL);
    g_state.running = 1;

    signal(SIGINT, handle_signal);
    signal(SIGTERM, handle_signal);

    if (open_capture(iface, &g_state.pcap_handle) != 0) {
        pthread_mutex_destroy(&g_state.lock);
        return 1;
    }

    if (pthread_create(&tid, NULL, capture_thread, &g_state) != 0) {
        fprintf(stderr, "failed to create capture thread\n");
        pcap_close(g_state.pcap_handle);
        pthread_mutex_destroy(&g_state.lock);
        return 1;
    }

    while (g_state.running) {
        print_stats(&g_state, iface, json_path);
        write_json_stats(&g_state, iface, json_path);
        sleep(1);
    }

    pthread_join(tid, NULL);
    pcap_close(g_state.pcap_handle);
    pthread_mutex_destroy(&g_state.lock);
    printf("\ntraffic monitor stopped.\n");
    return 0;
}
