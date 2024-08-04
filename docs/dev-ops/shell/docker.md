# Dockcer 常用命令

## 创建容器

### MySQL

```shell copy
docker pull mysql:debian
docker run --name mysql -v mysql:/var/lib/mysql -p 3306:3306 -e MYSQL_ROOT_PASSWORD=KV753t0PpVmpjd2d -d mysql:debian
```

### Redis

```shell copy
docker pull redis
docker run --name redis -v redis:/data -p 6379:6379 -d redis
```