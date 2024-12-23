---
tags: [Spring Boot, Windows]
---

# Windows 部署

## 部署结果

1. 服务器重启自动启动服务
2. 启动失败，自定义重启逻辑
3. 服务启停简单

## 借助第三方工具

借助 [winsw](https://github.com/winsw/winsw) 将SpringBoot服务包装成一个windows服务。

下载文件：https://github.com/winsw/winsw/releases ，将 exe 文件重命名为：`winsw.exe`

## 文件

```
server-config.xml
spring-boot-server.jar
winsw.exe
```

```xml title="server-config.xml"
<service>
  <id>spring-boot-server</id>
  <name>spring-boot-server</name>
  <description>Spring Boot Server</description>
  <executable>java</executable>
  <arguments>-jar --add-opens java.base/sun.net=ALL-UNNAMED -jar "%BASE%\spring-boot-server.jar" --spring.profiles.active=dev</arguments>
  <onfailure action="restart" delay="10 sec"/>
  <logmode>none</logmode>
</service>
```

重启策略：`<onfailure action="restart" delay="10 sec"/>`

关闭`winsw`日志（不影响服务日志）：`<logmode>none</logmode>`

其他配置：https://github.com/winsw/winsw/blob/v3/docs/xml-config-file.md

## 安装服务

```shell
./winsw.exe install server-config.xml
```

## 查看服务状态

```shell
./winsw.exe status server-config.xml
```

## 停止服务

```shell
./winsw.exe stop server-config.xml
```

## 卸载服务

```shell
./winsw.exe uninstall server-config.xml
```
