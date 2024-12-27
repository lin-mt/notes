---
tags: [Docker Compose, EFK, Spring Boot]
---

# EFK

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

Windows 下的 filebeat 的配置文件

```yaml title="filebeat.yml"
###################### Filebeat Configuration Example #########################

# This file is an example configuration file highlighting only the most common
# options. The filebeat.reference.yml file from the same directory contains all the
# supported options with more comments. You can use it as a reference.
#
# You can find the full configuration reference here:
# https://www.elastic.co/guide/en/beats/filebeat/index.html

# For more available modules and options, please see the filebeat.reference.yml sample
# configuration file.

# ============================== Filebeat inputs ===============================

filebeat.inputs:
# 多个应用则多个日志配置，paths 好像不支持正则匹配
- type: log
  enabled: true
  paths:
    - C:\logs\dev\application\server.log
  exclude_lines: ["^\\s+[\\-`('.|_]"]
  multiline.pattern: "^(\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}\\.\\d{3} (ERROR|WARN|INFO|DEBUG|TRACE)\\s+\\[.*\\]).*"
  multiline.negate: true
  multiline.match: after
  fields:
    service:
      name: dev-application

# Each - is an input. Most options can be set at the input level, so
# you can use different inputs for various configurations.
# Below are the input-specific configurations.

# filestream is an input for collecting log messages from files.
- type: filestream

  # Unique ID among all inputs, an ID is required.
  id: my-filestream-id

  # Change to true to enable this input configuration.
  enabled: false

  # Paths that should be crawled and fetched. Glob based paths.
  paths:
    - /var/log/*.log
    #- c:\programdata\elasticsearch\logs\*

  # Exclude lines. A list of regular expressions to match. It drops the lines that are
  # matching any regular expression from the list.
  # Line filtering happens after the parsers pipeline. If you would like to filter lines
  # before parsers, use include_message parser.
  #exclude_lines: ['^DBG']

  # Include lines. A list of regular expressions to match. It exports the lines that are
  # matching any regular expression from the list.
  # Line filtering happens after the parsers pipeline. If you would like to filter lines
  # before parsers, use include_message parser.
  #include_lines: ['^ERR', '^WARN']

  # Exclude files. A list of regular expressions to match. Filebeat drops the files that
  # are matching any regular expression from the list. By default, no files are dropped.
  #prospector.scanner.exclude_files: ['.gz$']

  # Optional additional fields. These fields can be freely picked
  # to add additional information to the crawled log files for filtering
  #fields:
  #  level: debug
  #  review: 1

# ============================== Filebeat modules ==============================

filebeat.config.modules:
  # Glob pattern for configuration loading
  path: ${path.config}/modules.d/*.yml

  # Set to true to enable config reloading
  reload.enabled: false

  # Period on which files under path should be checked for changes
  #reload.period: 10s

# ======================= Elasticsearch template setting =======================

setup.template.settings:
  index.number_of_shards: 1
  #index.codec: best_compression
  #_source.enabled: false


# ================================== General ===================================

# The name of the shipper that publishes the network data. It can be used to group
# all the transactions sent by a single shipper in the web interface.
#name:

# The tags of the shipper are included in their field with each
# transaction published.
#tags: ["service-X", "web-tier"]

# Optional fields that you can specify to add additional information to the
# output.
#fields:
#  env: staging

# ================================= Dashboards =================================
# These settings control loading the sample dashboards to the Kibana index. Loading
# the dashboards is disabled by default and can be enabled either by setting the
# options here or by using the `setup` command.
#setup.dashboards.enabled: false

# The URL from where to download the dashboard archive. By default, this URL
# has a value that is computed based on the Beat name and version. For released
# versions, this URL points to the dashboard archive on the artifacts.elastic.co
# website.
#setup.dashboards.url:

setup.template.name: "windows"
setup.template.pattern: "windows-*"

# =================================== Kibana ===================================

# Starting with Beats version 6.0.0, the dashboards are loaded via the Kibana API.
# This requires a Kibana endpoint configuration.
setup.kibana:

  # Kibana Host
  # Scheme and port can be left out and will be set to the default (http and 5601)
  # In case you specify and additional path, the scheme is required: http://localhost:5601/path
  # IPv6 addresses should always be defined as: https://[2001:db8::1]:5601
  #host: "localhost:5601"

  # Kibana Space ID
  # ID of the Kibana Space into which the dashboards should be loaded. By default,
  # the Default Space will be used.
  #space.id:

# ================================== Outputs ===================================

# Configure what output to use when sending the data collected by the beat.

# ---------------------------- Elasticsearch Output ----------------------------
output.elasticsearch:
  # Array of hosts to connect to.
  hosts: ["192.168.1.191:9200"]
  index: "%{[fields.service.name]}"
  # Performance preset - one of "balanced", "throughput", "scale",
  # "latency", or "custom".
  preset: balanced

  # Protocol - either `http` (default) or `https`.
  #protocol: "https"

  # Authentication credentials - either API key or username/password.
  #api_key: "id:api_key"
  #username: "elastic"
  #password: "changeme"

# ------------------------------ Logstash Output -------------------------------
#output.logstash:
  # The Logstash hosts
  #hosts: ["localhost:5044"]

  # Optional SSL. By default is off.
  # List of root certificates for HTTPS server verifications
  #ssl.certificate_authorities: ["/etc/pki/root/ca.pem"]

  # Certificate for SSL client authentication
  #ssl.certificate: "/etc/pki/client/cert.pem"

  # Client Certificate Key
  #ssl.key: "/etc/pki/client/cert.key"

# ================================= Processors =================================
processors:
  # - add_host_metadata:
  #     when.not.contains.tags: forwarded
  # - add_cloud_metadata: ~
  # - add_docker_metadata: ~
  # - add_kubernetes_metadata: ~
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
      fields: ["agent", "ecs", "stream", "host", "input", "log", "timestamp"]
      ignore_missing: false

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
