# 前端依赖

本目录存放前端用到的第三方库文件。

## Chart.js

项目使用 Chart.js 4.4.0 绘制流量监控折线图。

### 获取方式

**方式一：从 CDN 下载（推荐）**

```bash
cd frontend/vendor
wget https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js
```

**方式二：从 npm 下载**

```bash
npm install chart.js@4.4.0
cp node_modules/chart.js/dist/chart.umd.min.js frontend/vendor/
```

### 加载策略

页面优先加载本地 `vendor/chart.umd.min.js`；如果本地文件不存在，自动回退到 CDN（jsdelivr）。

### 路由器部署注意事项

如果路由器部署后电脑浏览器无法访问外网 CDN：
1. 提前下载 `chart.umd.min.js` 放到本目录
2. 上传时包含此文件：`scp -O .\frontend\vendor\chart.umd.min.js root@<路由器IP>:/root/openwrt/frontend/vendor/`
