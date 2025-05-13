---
sidebar_position: 1
tags: [Docker Compose, RocketMQ]
---

# Docker Compose 部署

## 环境准备

安装 Docker 和 Docker Compose

## 创建文件夹

```shell
mkdir -p ./logs/namesrv ./logs/broker ./broker_master/store
```

设置文件夹的权限：
```shell
chmod 777 ./logs/namesrv ./logs/broker ./broker_master/store 
```

## 准备broker配置文件

```properties title="broker.conf"
# 集群配置
brokerClusterName=DefaultCluster
brokerName=Broker-A
brokerId=0

# 定时删除时间，删除已超过保留期限（fileReservedTime）的 CommitLog 和 ConsumeQueue 文件。
deleteWhen=03
# 设置消息文件的保留时间，单位为小时。这里设置为 48 小时，表示消息存储文件会保留 48 小时，之后会被删除。
fileReservedTime=48

# 设置 Broker 的角色。`ASYNC_MASTER` 表示该 Broker 为异步主节点，所有写操作都会异步地提交到磁盘。
brokerRole=ASYNC_MASTER
# 如果是 `SYNC_MASTER`，则表示同步主节点，会等待所有数据写入磁盘后才返回成功；如果是 `SLAVE`，表示从节点。

# 设置刷盘的方式。`ASYNC_FLUSH` 表示异步刷盘，写数据时不等待磁盘刷写完成后再返回，性能更好，但可能存在数据丢失风险。
flushDiskType=ASYNC_FLUSH
# 另外一个选项是 `SYNC_FLUSH`，表示同步刷盘，数据写入时会等待磁盘刷写完成，保证数据可靠性，但性能较差。

# 网络配置
# 设置 Broker 监听的端口号，客户端和其他 Broker 会通过此端口与该 Broker 进行通信。
listenPort=10911
# 设置 Broker 对外暴露的 IP 地址。客户端和其他 Broker 会通过这个 IP 地址来访问此 Broker。
brokerIP1=192.168.30.12

# 这个地址一般设置为宿主机的 IP 地址或者外部可访问的地址。确保在多个 Broker 之间互相访问时能够正常连接。
# 设置 NameServer 的地址。NameServer 是 RocketMQ 的注册中心，Broker 会注册到 NameServer 上，客户端通过它来找到 Broker。
namesrvAddr=192.168.30.12:9876

# 是否自动创建 topic
autoCreateTopicEnable=true
```

## 准备 docker-compose.yml 文件

```yaml title="docker-compose.yml"
services:
  namesrv:
    image: apache/rocketmq:5.3.1
    container_name: rmqnamesrv
    restart: on-failure
    volumes:
      - ./logs/namesrv:/home/rocketmq/logs
    ports:
      - 9876:9876
    networks:
      - rocketmq
    command: sh mqnamesrv

  broker:
    image: apache/rocketmq:5.3.1
    container_name: rmqbroker
    restart: on-failure
    ports:
      - 10909:10909
      - 10911:10911
      - 10912:10912
    environment:
      - NAMESRV_ADDR=namesrv:9876
      - JAVA_OPT_EXT=-server -Xms512m -Xmx512m -Duser.home=/home/rocketmq
    volumes:
      - ./broker_master/store:/home/rocketmq/store
      - ./broker_master/broker.conf:/home/rocketmq/rocketmq-5.3.1/conf/broker.conf
      - ./logs/broker:/home/rocketmq/logs
    depends_on:
      - namesrv
    networks:
      - rocketmq
    command: sh mqbroker -c ../conf/broker.conf

  console:
    image: apache/rocketmq-dashboard
    container_name: rmqconsole
    restart: on-failure
    ports:
      - 9080:8080
    environment:
      - JAVA_OPTS=-Dserver.port=8080 -Drocketmq.config.namesrvAddr=namesrv:9876
    depends_on:
      - namesrv
    networks:
      - rocketmq
networks:
  rocketmq:
    name: rocketmq
    driver: bridge
```

## 部署 RocketMQ

```shell
docker compose up -d
```
