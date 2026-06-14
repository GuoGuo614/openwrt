## 交叉编译

- 使用 Ubuntu 进入 /traffic_monitor 目录，使用 make 命令编译文件。

## 编译文件拷贝

- scp -O -P 2222 .\traffic_monitor root@127.0.0.1:/root/openwrt/traffic_monitor，上传文件
- ssh -p 2222 root@127.0.0.1 "chmod +x /root/openwrt/traffic_monitor"，上传后加执行权限

## 虚拟机远程连接
- ssh root@127.0.0.1 -p 2222，通过 powershell 连接 openwrt 虚拟机（不同人参数可能不同）

## 运行
- Usage: ./traffic_monitor <interface> [json_path]
    - Example: ./traffic_monitor br-lan
    - Example: ./traffic_monitor eth0 /tmp/traffic_stats.json
