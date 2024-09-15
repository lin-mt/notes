---
sidebar_position: 2
---

# 部署 EFK

## Spring Boot日志配置

```xml title="logback-spring.xml"
<?xml version="1.0" encoding="UTF-8"?>
<configuration scan="true">

    <springProperty name="activeProfile" source="spring.profiles.active" defaultValue="dev"/>
    <springProperty name="serverId" source="server.id" defaultValue=""/>
    <property name="CONSOLE_LOG_CHARSET" value="UTF-8"/>
    <property name="APPLICATION_NAME" value="application_name"/>
    <property name="LOG_FILE_NAME" value="server"/>
    <property name="LOG_FILE" value="/logs/${activeProfile}/${APPLICATION_NAME}/${serverId}/${LOG_FILE_NAME}.log"/>

    <include resource="org/springframework/boot/logging/logback/defaults.xml"/>
    <include resource="org/springframework/boot/logging/logback/console-appender.xml"/>

    <appender name="FILE" class="ch.qos.logback.core.rolling.RollingFileAppender">
        <file>${LOG_FILE}</file>
        <rollingPolicy class="ch.qos.logback.core.rolling.SizeAndTimeBasedRollingPolicy">
            <fileNamePattern>
                /logs/${activeProfile}/${APPLICATION_NAME}/${serverId}/${LOG_FILE_NAME}.%d{yyyy-MM-dd}.%i.log
            </fileNamePattern>
            <maxFileSize>50MB</maxFileSize>
            <maxHistory>30</maxHistory>
        </rollingPolicy>
        <encoder>
            <charset>UTF-8</charset>
            <pattern>%d{yyyy-MM-dd HH:mm:ss.SSS} %-5level [%thread] %logger{36} - %msg%n</pattern>
        </encoder>
    </appender>

    <root level="INFO">
        <appender-ref ref="CONSOLE"/>
        <appender-ref ref="FILE"/>
    </root>

</configuration>
```

## 配置文件

```
docker-compose.yml
elasticsearch
└──data
└──logs
└──elasticsearch.yml
filebeat
└──filebeat.yml
kibana
└──data
└──logs
└──kibana.yml
```

## DockerCompose

```yaml title="docker-compose.yml"
services:
  elasticsearch:
    image: elastic/elasticsearch:8.13.4
    container_name: efk-elasticsearch
    restart: unless-stopped
    environment:
    - discovery.type=single-node
    - ES_JAVA_OPTS=-Xms1g -Xmx1g
    - bootstrap.memory_lock=true
    - network.publish_host=0.0.0.0
    ports:
    - 9200:9200
    - 9600:9300
    ulimits:
      memlock:
        soft: -1
        hard: -1
    volumes:
    - ./elasticsearch/data:/usr/share/elasticsearch/data
    - ./elasticsearch/logs:/usr/share/elasticsearch/logs
    - ./elasticsearch/elasticsearch.yml:/usr/share/elasticsearch/config/elasticsearch.yml
    networks:
      - efk

  kibana:
    image: elastic/kibana:8.13.4
    container_name: efk-kibana
    restart: unless-stopped
    ports:
    - 5601:5601
    volumes:
    - ./kibana/kibana.yml:/usr/share/kibana/config/kibana.yml
    - ./kibana/data:/usr/share/kibana/data
    - ./kibana/logs:/usr/share/kibana/logs
    depends_on:
    - elasticsearch
    networks:
      - efk

  filebeat:
    image: elastic/filebeat:8.13.4
    container_name: efk-filebeat
    restart: unless-stopped
    user: root
    volumes:
    - "/logs:/logs"
    - "./filebeat/log:/var/log/filebeat"
    - "./filebeat/filebeat.yml:/usr/share/filebeat/filebeat.yml:ro"
    - "/var/lib/docker/containers:/var/lib/docker/containers:ro"
    - "/var/run/docker.sock:/var/run/docker.sock:ro"
    depends_on:
    - elasticsearch
    networks:
      - efk

networks:
  efk:
    name: efk
    driver: bridge
```

## Elasticsearch
```yaml title="elasticsearch/elasticsearch.yml"
network.host: 0.0.0.0
# xpack.license.self_generated.type: trial
xpack.security.enabled: false
# xpack.monitoring.collection.enabled: true
# xpack.security.transport.ssl.enabled: true
# xpack.security.transport.ssl.keystore.type: PKCS12
# xpack.security.transport.ssl.verification_mode: certificate
# xpack.security.transport.ssl.keystore.path: elastic-certificates.p12
# xpack.security.transport.ssl.truststore.path: elastic-certificates.p12
# xpack.security.transport.ssl.truststore.type: PKCS12

# xpack.security.audit.enabled: true
```

## Filebeat

```yaml title="filebeat/filebeat.yml"
filebeat.config:
  modules:
    path: ${path.config}/modules.d/*.yml
    reload.enabled: false

filebeat.autodiscover:
  providers:
    - type: docker
      enable: true
      templates:
        - condition:
            regexp:
              docker.container.name: "^(dev-|test-).*"
          config:
            - type: container
              containers.ids:
                - "${data.docker.container.id}"
              exclude_lines: ["^\\s+[\\-`('.|_]"]
              multiline.pattern: "^(\\d{4}/\\d{2}/\\d{2}|\\d+\\.\\d+\\.\\d+\\.\\d+).*"
              multiline.negate: true
              multiline.match: after
              paths:
                - /var/lib/docker/containers/${data.docker.container.id}/*.log

filebeat.inputs:
- type: log
  enabled: true
  paths:
    - /logs/*/*/server.log
  exclude_lines: ["^\\s+[\\-`('.|_]"]
  multiline.pattern: "^(\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}\\.\\d{3} (ERROR|WARN|INFO|DEBUG|TRACE)\\s+\\[.*\\]).*"
  multiline.negate: true
  multiline.match: after

processors:
  - dissect:
      tokenizer: "/logs/%{env}/%{name}/server.log"
      field: "log.file.path"
      target_prefix: "server"
  - script:
      when:
        regexp:
          message: "^(\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}\\.\\d{3}).*"
      lang: javascript
      source: >
        function process(event) {
          var log = event.Get("message");
          var parts = log.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}) ((ERROR|WARN|INFO|DEBUG|TRACE)\s+\[(.*?)\]\s+(.*?)\s+-\s+(.*))$/);
          if (parts) {
            event.Put("timestamp", parts[1]);
            event.Put("level", parts[3]);
            event.Put("threadName", parts[4]);
            event.Put("className", parts[5]);
            event.Put("message", parts[2]);
          }
        }
  - timestamp:
      field: timestamp
      layouts:
        - '2006-01-02 15:04:05'
        - '2006-01-02 15:04:05.999'
      test:
        - '2019-06-22 16:33:51'
      timezone: "Asia/Shanghai"
  - drop_fields:
      fields: ["agent", "ecs", "stream", "host", "input", "log", "container.image.name", "container.id", "timestamp"]
      ignore_missing: false

output.elasticsearch:
  hosts: 'http://elasticsearch:9200'
  indices:
    - index: "%{[server.env]}-%{[server.name]}"
      when.has_fields: ['server.env', 'server.name']
    - index: "%{[container.name]:filebeat}"
      when.regexp:
        container.name: "^(dev-|test-).*"
```

## Kibana
```yaml title="kibana/kibana.yml"
server.name: kibana
server.host: 0.0.0.0
elasticsearch.hosts: [ "http://elasticsearch:9200" ]
monitoring.ui.container.elasticsearch.enabled: true
```

## 启动部署

```shell
docker-compose up -d
```

## 问题

### 权限不够启动失败

```shell
chmod 777 ./elasticsearch/data
chmod 777 ./elasticsearch/logs
chmod 777 ./kibina/data
chmod 777 ./kibina/logs
```