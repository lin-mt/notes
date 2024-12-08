# Dockcer 常用命令

## 创建容器

### MySQL

```shell copy
docker run --name mysql -v mysql:/var/lib/mysql -p 3306:3306 -e MYSQL_ROOT_PASSWORD=KV753t0PpVmpjd2d -d mysql:8.0-debian
```

### Redis

```shell copy
docker run --name redis -v redis:/data -p 6379:6379 -d redis:bookworm
```

### Postgres

```shell copy
docker run -d --name postgres -e POSTGRES_USER=quiet -e POSTGRES_PASSWORD=KV753t0PpVmpjd2d -v postgres:/var/lib/postgresql/data -p 5432:5432 postgres:17-bookworm
```