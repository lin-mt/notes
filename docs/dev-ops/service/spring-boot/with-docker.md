---
tags: [Spring Boot, Docker]
---

# Docker 部署

目标，借助Docker实现服务部署。

## 准备工作

1. 安装 Docker
2. 安装 Harbor（可选）

## 文件

```
spring-boot-server.jar
Dockerfile
```

## 创建 Dockerfile

```dockerfile
FROM openjdk:21-jdk-alpine as builder

WORKDIR /application
COPY ./target/spring-boot-server.jar application.jar
RUN java -Djarmode=layertools -jar application.jar extract

FROM openjdk:21-jdk-alpine
WORKDIR /application
COPY --from=builder application/dependencies/ ./
COPY --from=builder application/spring-boot-loader/ ./
COPY --from=builder application/snapshot-dependencies/ ./
COPY --from=builder application/application/ ./
ENTRYPOINT ["java", "-Xms2g", "-Xmx8g", "--add-opens=java.base/sun.net=ALL-UNNAMED", "-XX:CompressedClassSpaceSize=512m", "-XX:MetaspaceSize=800m", "-XX:MaxMetaspaceSize=800m", "org.springframework.boot.loader.launch.JarLauncher"]
```

## 构建镜像

```shell
docker build -t spring-boot-server .
```

## 启动服务

```shell
docker run -e "SPRING_PROFILES_ACTIVE=dev" -itd --restart unless-stopped -p 8080:8080 -v /logs/:/logs/ --name server spring-boot-server
```
