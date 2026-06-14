# 后端

本模块为前端提供 HTTP API。

## 规划的 API

- `GET /api/traffic`
- `POST /api/firewall/add`
- `GET /api/firewall/list`
- `POST /api/firewall/delete`
- `POST /api/firewall/clear`

## 文件说明

- `app.py`：HTTP 服务入口。
- `config.py`：共享路径与配置。
- `requirements.txt`：本地开发的 Python 依赖。

## 运行

```sh
python3 app.py
```
