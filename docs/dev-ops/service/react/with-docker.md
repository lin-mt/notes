---
tags: [React, Nginx, Docker]
---

# Docker 部署

## 文件

```
Dockerfile
default.conf
dist
```

> dist 文件夹下的文件为 React 项目打包后的静态文件。

``` title="default.config"
server {
    listen       80;
    listen  [::]:80;
    server_name  localhost;

    root /usr/share/nginx/html/;

    gzip on;
    gzip_types text/plain text/css application/javascript text/xml application/xml application/xml+rss text/javascript;
    gzip_min_length 1000;
    gzip_comp_level 6;
    gzip_vary on;
    gzip_disable "msie6";

    client_header_buffer_size 32k;
    large_client_header_buffers 4 32k;
    client_max_body_size     300m;
    client_body_buffer_size  128k;
    client_body_timeout 600s;
    client_header_timeout 600s;
    send_timeout 600s;
    proxy_connect_timeout    900s;
    keepalive_timeout  900s;
    proxy_read_timeout       900s;
    proxy_send_timeout       900s;
    proxy_buffer_size        8k;
    proxy_buffers            4 32k;
    proxy_busy_buffers_size 64k;
    proxy_temp_file_write_size 64k;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header HOST $host:$server_port;

    location / {
        try_files $uri $uri/ /index.html;
        index  index.html;
        error_page 404 /index.html;
    }

}
```

```dockerfile
FROM nginx:latest

COPY ./dist/* /usr/share/nginx/html/
COPY ./default.conf /etc/nginx/conf.d/default.conf

WORKDIR /usr/share/nginx/html/
```

## 构建镜像

```shell
docker build -t web-server .
```

## 启动服务

```shell
docker run -itd --restart unless-stopped -p 80:80 --name web-server web-server
```
