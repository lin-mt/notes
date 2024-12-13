---
tags: [Pulsar, Security, JWT]
---

# 使用 JWT 进行身份验证

Pulsar 支持使用 JSON WEB TOKEN 进行身份验证。

## 生成`secret.key`文件

```shell
bin/pulsar tokens create-secret-key --output secret.key
```
生成文件到指定目录
```shell
bin/pulsar tokens create-secret-key --output /opt/pulsar/secret.key
```
生成 base64 的`secret.key`
```shell
bin/pulsar tokens create-secret-key --output /opt/pulsar/secret.key --base64
```

## 生成`token`

```shell
bin/pulsar tokens create --secret-key file:///path/to/secret.key \
            --subject admin
```
生成时设置 token 的过期时间
```shell
bin/pulsar tokens create --secret-key file:///path/to/my-secret.key \
            --subject admin \
            --expiry-time 1y
```

## `Broker`开启授权
在 broker 的配置文件（`conf/broker.conf` 或 `conf/standalone.conf`）中开启认证并配置超级用户
```yml
# Configuration to enable authentication
authenticationEnabled=true
authenticationProviders=org.apache.pulsar.broker.authentication.AuthenticationProviderToken

# Authentication settings of the broker itself. Used when the broker connects to other brokers, or when the proxy connects to brokers, either in same or other clusters
brokerClientAuthenticationPlugin=org.apache.pulsar.client.impl.auth.AuthenticationToken
brokerClientAuthenticationParameters={"token":"eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0LXVzZXIifQ.9OHgE9ZUDeBTZs7nSMEFIuGNEX18FLR3qvy8mqxSxXw"}
# Either configure the token string or specify to read it from a file. The following three available formats are all valid:
# brokerClientAuthenticationParameters={"token":"your-token-string"}
# brokerClientAuthenticationParameters=token:your-token-string
# brokerClientAuthenticationParameters=file:///path/to/token

# If using secret key (Note: key files must be DER-encoded)
tokenSecretKey=file:///path/to/secret.key
# The key can also be passed inline:
# tokenSecretKey=data:;base64,FLFyW0oLJ2Fi22KKCm21J18mbAdztfSHN/lAT5ucEKU=

# If using public/private (Note: key files must be DER-encoded)
# tokenPublicKey=file:///path/to/public.key
```

## `manager`连接 broker
在`application.properties`中配置`token`。
``` properties
backend.jwt.token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0LXVzZXIifQ.9OHgE9ZUDeBTZs7nSMEFIuGNEX18FLR3qvy8mqxSxXw
```

## 服务连接`broker`

```yml
spring:
  pulsar:
    client:
      service-url: pulsar://localhost:6650
      authentication:
        plugin-class-name: org.apache.pulsar.client.impl.auth.AuthenticationToken
        param:
          token: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0LXVzZXIifQ.9OHgE9ZUDeBTZs7nSMEFIuGNEX18FLR3qvy8mqxSxXw
```

## 部署文件

```yaml title="docker-compose.yml" showLineNumbers {88-92,102,103,112,114}
version: '3'
networks:
  pulsar:
    driver: bridge
services:
  # Start zookeeper
  zookeeper:
    image: apachepulsar/pulsar:3.1.1
    container_name: zookeeper
    restart: on-failure
    networks:
      - pulsar
    volumes:
      - ./data/zookeeper:/pulsar/data/zookeeper
    environment:
      - metadataStoreUrl=zk:zookeeper:2181
      - PULSAR_MEM=-Xms256m -Xmx256m -XX:MaxDirectMemorySize=256m
    command: >
      bash -c "bin/apply-config-from-env.py conf/zookeeper.conf && \
             bin/generate-zookeeper-config.sh conf/zookeeper.conf && \
             exec bin/pulsar zookeeper"
    healthcheck:
      test: ["CMD", "bin/pulsar-zookeeper-ruok.sh"]
      interval: 10s
      timeout: 5s
      retries: 30

  # Init cluster metadata
  pulsar-init:
    container_name: pulsar-init
    hostname: pulsar-init
    image: apachepulsar/pulsar:3.1.1
    networks:
      - pulsar
    command: >
      bin/pulsar initialize-cluster-metadata \
               --cluster cluster-a \
               --zookeeper zookeeper:2181 \
               --configuration-store zookeeper:2181 \
               --web-service-url http://broker:8080 \
               --broker-service-url pulsar://broker:6650
    depends_on:
      zookeeper:
        condition: service_healthy

  # Start bookie
  bookie:
    image: apachepulsar/pulsar:3.1.1
    container_name: bookie
    restart: on-failure
    networks:
      - pulsar
    environment:
      - clusterName=cluster-a
      - zkServers=zookeeper:2181
      - metadataServiceUri=metadata-store:zk:zookeeper:2181
      # otherwise every time we run docker compose uo or down we fail to start due to Cookie
      # See: https://github.com/apache/bookkeeper/blob/405e72acf42bb1104296447ea8840d805094c787/bookkeeper-server/src/main/java/org/apache/bookkeeper/bookie/Cookie.java#L57-68
      - advertisedAddress=bookie
      - BOOKIE_MEM=-Xms512m -Xmx512m -XX:MaxDirectMemorySize=256m
    depends_on:
      zookeeper:
        condition: service_healthy
      pulsar-init:
        condition: service_completed_successfully
    # Map the local directory to the container to avoid bookie startup failure due to insufficient container disks.
    volumes:
      - ./data/bookkeeper:/pulsar/data/bookkeeper
    command: bash -c "bin/apply-config-from-env.py conf/bookkeeper.conf && exec bin/pulsar bookie"

  # Start broker
  broker:
    image: apachepulsar/pulsar:3.1.1
    container_name: broker
    hostname: broker
    restart: on-failure
    networks:
      - pulsar
    environment:
      - metadataStoreUrl=zk:zookeeper:2181
      - zookeeperServers=zookeeper:2181
      - clusterName=cluster-a
      - managedLedgerDefaultEnsembleSize=1
      - managedLedgerDefaultWriteQuorum=1
      - managedLedgerDefaultAckQuorum=1
      - advertisedAddress=broker
      - advertisedListeners=external:pulsar://127.0.0.1:6650
      - authenticationEnabled=true
      - authenticationProviders=org.apache.pulsar.broker.authentication.AuthenticationProviderToken
      - brokerClientAuthenticationPlugin=org.apache.pulsar.client.impl.auth.AuthenticationToken
      - brokerClientAuthenticationParameters={"token":"eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiJ9.CqAbQW0-35E0Xg_7IwMqQuOdu1bAAH7LiP5QI-zZeXU"}
      - tokenSecretKey=file:///pulsar/secret.key
      - PULSAR_MEM=-Xms512m -Xmx512m -XX:MaxDirectMemorySize=256m
    depends_on:
      zookeeper:
        condition: service_healthy
      bookie:
        condition: service_started
    ports:
      - "6650:6650"
      - "8080:8080"
    volumes:
      - ./secret.key:/pulsar/secret.key
    command: bash -c "bin/apply-config-from-env.py conf/broker.conf && exec bin/pulsar broker"
  pulsar-manager:
    image: apachepulsar/pulsar-manager:v0.4.0
    container_name: pulsar-manager
    ports:
      - "9527:9527"
      - "7750:7750"
    volumes:
      - ./secret.key:/pulsar-manager/pulsar-manager/secret.key
      - ./pulsar-manager/log:/pulsar-manager/pulsar-manager/log
      - ./pulsar-manager/application.properties:/pulsar-manager/pulsar-manager/application.properties
      - ./pulsar-manager/dbdata:/pulsar-manager/pulsar-manager/dbdata
    depends_on:
      broker:
        condition: service_started
    networks:
      - pulsar
    environment:
      SPRING_CONFIGURATION_FILE: /pulsar-manager/pulsar-manager/application.properties
```

```properties cpoy title="application.properties" showLineNumbers {19,20,78,97,98}
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#

spring.cloud.refresh.refreshable=none
server.port=7750

# configuration log
logging.path=/pulsar-manager/pulsar-manager/log
logging.file=

# DEBUG print execute sql
logging.level.org.apache=INFO

mybatis.type-aliases-package=org.apache.pulsar.manager

# database connection

# SQLLite
#spring.datasource.driver-class-name=org.sqlite.JDBC
#spring.datasource.url=jdbc:sqlite:pulsar_manager.db
#spring.datasource.initialization-mode=always
#spring.datasource.schema=classpath:/META-INF/sql/sqlite-schema.sql
#spring.datasource.username=
#spring.datasource.password=

#HerdDB JDBC Driver
spring.datasource.driver-class-name=herddb.jdbc.Driver
# HerdDB - local in memory-only
#spring.datasource.url=jdbc:herddb:local
# HerdDB - start embedded server, data persisted on local disk (directory 'dbdata'), listening on localhost:7000
spring.datasource.url=jdbc:herddb:server:localhost:7000?server.start=true&server.base.dir=dbdata
# HerdDB - start embedded server 'diskless-cluster' mode, WAL and Data persisted on Bookies, Metadata on ZooKeeper in '/herd', listening on localhost:7000
#spring.datasource.url=jdbc:herddb:zookeeper:localhost:2181?server.start=true&server.base.dir=dbdata&server.mode=diskless-cluster&server.node.id=localhost
# HerdDB - connect to standalone server at localhost:7000
#spring.datasource.url=jdbc:herddb:server:localhost:7000
# HerdDB - connect to cluster, uses ZooKeeper for service discovery
#spring.datasource.url=jdbc:herddb:zookeeper:localhost:2181/herd


spring.datasource.schema=classpath:/META-INF/sql/herddb-schema.sql
spring.datasource.username=sa
spring.datasource.password=hdb
spring.datasource.initialization-mode=always

# postgresql configuration
#spring.datasource.driver-class-name=org.postgresql.Driver
#spring.datasource.url=jdbc:postgresql://127.0.0.1:5432/pulsar_manager
#spring.datasource.username=postgres
#spring.datasource.password=postgres

# zuul config
# https://cloud.spring.io/spring-cloud-static/Dalston.SR5/multi/multi__router_and_filter_zuul.html
# By Default Zuul adds  Authorization to be dropped headers list. Below we are manually setting it
zuul.sensitive-headers=Cookie,Set-Cookie
zuul.routes.admin.path=/admin/**
zuul.routes.admin.url=http://localhost:8080/admin/
zuul.routes.lookup.path=/lookup/**
zuul.routes.lookup.url=http://localhost:8080/lookup/

# pagehelper plugin
#pagehelper.helperDialect=sqlite
# force 'mysql' for HerdDB, comment out for postgresql
pagehelper.helperDialect=mysql

backend.directRequestBroker=true
backend.directRequestHost=http://localhost:8080
backend.jwt.token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiJ9.CqAbQW0-35E0Xg_7IwMqQuOdu1bAAH7LiP5QI-zZeXU
backend.broker.pulsarAdmin.authPlugin=
backend.broker.pulsarAdmin.authParams=
backend.broker.pulsarAdmin.tlsAllowInsecureConnection=false
backend.broker.pulsarAdmin.tlsTrustCertsFilePath=
backend.broker.pulsarAdmin.tlsEnableHostnameVerification=false

jwt.secret=dab1c8ba-b01b-11e9-b384-186590e06885
jwt.sessionTime=2592000
# If user.management.enable is true, the following account and password will no longer be valid.
pulsar-manager.account=pulsar
pulsar-manager.password=pulsar
# If true, the database is used for user management
user.management.enable=true

# Optional -> SECRET, PRIVATE, default -> PRIVATE, empty -> disable auth
# SECRET mode -> bin/pulsar tokens create --secret-key file:///path/to/my-secret.key --subject test-user
# PRIVATE mode -> bin/pulsar tokens create --private-key file:///path/to/my-private.key --subject test-user
# Detail information: http://pulsar.apache.org/docs/en/security-token-admin/
jwt.broker.token.mode=SECRET
jwt.broker.secret.key=file:///pulsar-manager/pulsar-manager/secret.key
jwt.broker.public.key=file:///path/pulsar/broker-public.key
jwt.broker.private.key=file:///path/broker-private.key

# bookie
bookie.host=http://localhost:8050
bookie.enable=false

redirect.scheme=http
redirect.host=localhost
redirect.port=9527

# Stats interval
# millisecond
insert.stats.interval=30000
# millisecond
clear.stats.interval=300000
init.delay.interval=0

# cluster data reload
cluster.cache.reload.interval.ms=60000

user.access.token.expire=604800

# thymeleaf configuration for third login.
spring.thymeleaf.cache=false
spring.thymeleaf.prefix=classpath:/templates/
spring.thymeleaf.check-template-location=true
spring.thymeleaf.suffix=.html
spring.thymeleaf.encoding=UTF-8
spring.thymeleaf.servlet.content-type=text/html
spring.thymeleaf.mode=HTML5

# default environment configuration
default.environment.name=
default.environment.service_url=
default.environment.bookie_url=
# enable tls encryption
# keytool -import -alias test-keystore -keystore ca-certs -file certs/ca.cert.pem
tls.enabled=false
tls.keystore=keystore-file-path
tls.keystore.password=keystore-password
tls.hostname.verifier=false
tls.pulsar.admin.ca-certs=ca-client-path

# support peek message, default false
pulsar.peek.message=true

# swagger configuration
swagger.enabled=true

# casdoor configuration
casdoor.endpoint = http://localhost:8000
casdoor.clientId = 6ba06c1e1a30929fdda7
casdoor.clientSecret = df92bbf913225ebbae9af7ba8d41fe19507eb079
casdoor.certificate=\
-----BEGIN CERTIFICATE-----\n\
MIIE+TCCAuGgAwIBAgIDAeJAMA0GCSqGSIb3DQEBCwUAMDYxHTAbBgNVBAoTFENh\n\
c2Rvb3IgT3JnYW5pemF0aW9uMRUwEwYDVQQDEwxDYXNkb29yIENlcnQwHhcNMjEx\n\
MDE1MDgxMTUyWhcNNDExMDE1MDgxMTUyWjA2MR0wGwYDVQQKExRDYXNkb29yIE9y\n\
Z2FuaXphdGlvbjEVMBMGA1UEAxMMQ2FzZG9vciBDZXJ0MIICIjANBgkqhkiG9w0B\n\
AQEFAAOCAg8AMIICCgKCAgEAsInpb5E1/ym0f1RfSDSSE8IR7y+lw+RJjI74e5ej\n\
rq4b8zMYk7HeHCyZr/hmNEwEVXnhXu1P0mBeQ5ypp/QGo8vgEmjAETNmzkI1NjOQ\n\
CjCYwUrasO/f/MnI1C0j13vx6mV1kHZjSrKsMhYY1vaxTEP3+VB8Hjg3MHFWrb07\n\
uvFMCJe5W8+0rKErZCKTR8+9VB3janeBz//zQePFVh79bFZate/hLirPK0Go9P1g\n\
OvwIoC1A3sarHTP4Qm/LQRt0rHqZFybdySpyWAQvhNaDFE7mTstRSBb/wUjNCUBD\n\
PTSLVjC04WllSf6Nkfx0Z7KvmbPstSj+btvcqsvRAGtvdsB9h62Kptjs1Yn7GAuo\n\
I3qt/4zoKbiURYxkQJXIvwCQsEftUuk5ew5zuPSlDRLoLByQTLbx0JqLAFNfW3g/\n\
pzSDjgd/60d6HTmvbZni4SmjdyFhXCDb1Kn7N+xTojnfaNkwep2REV+RMc0fx4Gu\n\
hRsnLsmkmUDeyIZ9aBL9oj11YEQfM2JZEq+RVtUx+wB4y8K/tD1bcY+IfnG5rBpw\n\
IDpS262boq4SRSvb3Z7bB0w4ZxvOfJ/1VLoRftjPbLIf0bhfr/AeZMHpIKOXvfz4\n\
yE+hqzi68wdF0VR9xYc/RbSAf7323OsjYnjjEgInUtRohnRgCpjIk/Mt2Kt84Kb0\n\
wn8CAwEAAaMQMA4wDAYDVR0TAQH/BAIwADANBgkqhkiG9w0BAQsFAAOCAgEAn2lf\n\
DKkLX+F1vKRO/5gJ+Plr8P5NKuQkmwH97b8CS2gS1phDyNgIc4/LSdzuf4Awe6ve\n\
C06lVdWSIis8UPUPdjmT2uMPSNjwLxG3QsrimMURNwFlLTfRem/heJe0Zgur9J1M\n\
8haawdSdJjH2RgmFoDeE2r8NVRfhbR8KnCO1ddTJKuS1N0/irHz21W4jt4rxzCvl\n\
2nR42Fybap3O/g2JXMhNNROwZmNjgpsF7XVENCSuFO1jTywLaqjuXCg54IL7XVLG\n\
omKNNNcc8h1FCeKj/nnbGMhodnFWKDTsJcbNmcOPNHo6ixzqMy/Hqc+mWYv7maAG\n\
Jtevs3qgMZ8F9Qzr3HpUc6R3ZYYWDY/xxPisuKftOPZgtH979XC4mdf0WPnOBLqL\n\
2DJ1zaBmjiGJolvb7XNVKcUfDXYw85ZTZQ5b9clI4e+6bmyWqQItlwt+Ati/uFEV\n\
XzCj70B4lALX6xau1kLEpV9O1GERizYRz5P9NJNA7KoO5AVMp9w0DQTkt+LbXnZE\n\
HHnWKy8xHQKZF9sR7YBPGLs/Ac6tviv5Ua15OgJ/8dLRZ/veyFfGo2yZsI+hKVU5\n\
nCCJHBcAyFnm1hdvdwEdH33jDBjNB6ciotJZrf/3VYaIWSalADosHAgMWfXuWP+h\n\
8XKXmzlxuHbTMQYtZPDgspS5aK+S4Q9wb8RRAYo=\n\
-----END CERTIFICATE-----\n\
casdoor.organizationName = pulsar
casdoor.applicationName = app-pulsar
```
