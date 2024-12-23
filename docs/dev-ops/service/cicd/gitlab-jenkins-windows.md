---
tags: [Spring Boot, GitLab, Jenkins, Windows]
---

# GitLab+Jenkins+Windows

> 只记录大概流程，详细配置看操作界面进行配置。

## 构建流程

开发者 push 代码到 GitLab 指定分支或者 pull request merge 到指定分支之后自动部署到Windows服务器。

## 准备工作

1. 安装 GitLab
2. 安装 Jenkins
3. [了解如何将 SpringBoot 部署为 windows 服务](../spring-boot/on-windows.md)，并且已经安装好 windows 服务

## 前置步骤

前置步骤除了创建项目的时候选择的是 `Freestyle project`，其他步骤与[GitLab+Jenkins+Docker](./gitlab-jenkins-docker.md)基本相同。

::: tip
使用 Maven project 应该也是可以的。
:::

## 后置步骤

### Build Steps

选择：`Invoke top-level Maven targets`

选择项目构建需要的且在 Jenkins 已经配置好的 Maven。

`Goals`：`clean compile package -Dmaven.test.skip=true`

:::tip
如果使用的是 Maven project，则 Build 的配置与[GitLab+Jenkins+Docker](./gitlab-jenkins-docker.md)相同。
:::

### Post-build Actions

选择：`Send build artifacts over SSH`

选择要部署的 windows 服务配置（准备工作）

选择部署需要的文件：

`Source files`：target/service.jar

`Remove prefix`：target/

`Remote directory`：java-server/service/dev

:::tip
这个目录地址是在配置的 windows SSH 用户的 Home 目录下，其他文件夹下确保SSH用户有权限访问
:::

`Exec command`：C:\Users\admin\java-server\service\dev\service.bat

:::tip
文件发送到 windows 服务器之后执行的脚本
:::

```bat title="service.bat"
@echo off
setlocal enabledelayedexpansion
set "env=dev"
set "service_name=service"

REM 假设 Jenkins 配置的 windows SSH 的用户为 admin
set "server_dir=C:\Users\admin\java-server"
set "winsw=winsw.exe"

cd "%server_dir%\%service_name%\%env%"

set "source_jar_name=%service_name%.jar"
set "jar_name=%service_name%-%env%.jar"

if not exist "%source_jar_name%" (
    echo "jar 文件不存在"
    goto :eof
)

REM 注意：winsw.exe的文件位置、服务的winsw的配置文件名的格式和位置

for /f "delims=" %%a in ('%server_dir%\%winsw% status %server_dir%\%service_name%\%env%\%service_name%-%env%.xml') do (
    set result=%%a
    goto :gettedStatus
)

:gettedStatus

echo "服务状态：%result%"

if "%result%" == "Active (running)" (
    echo "停止服务..."
    %server_dir%\%winsw% stop %server_dir%\%service_name%\%env%\%service_name%-%env%.xml
)

echo "开始备份文件..."

set "backup_dir=backup_jar"

if not exist "%backup_dir%" (mkdir "%backup_dir%")

for /f "tokens=1-3 delims=:" %%a in ("%time%") do (
   set hours=%%a
   set minutes=%%b
   set seconds=%%c
)
for /f "tokens=2 delims==" %%a in ('wmic os get localdatetime /format:list') do set "localdatetime=%%a"
set "timestamp=%localdatetime:~0,8%_%hours: =0%%minutes%%seconds:~0,2%"

set "new_jar_name=%timestamp%.jar"

if exist "%jar_name%" (
    move /y "%jar_name%" "%backup_dir%\%new_jar_name%"
)

ren "%source_jar_name%" "%jar_name%"

echo "完成备份..."

for /f %%i in ('powershell -Command "& {$a = Get-Date; $a = $a.AddMonths(-1); $a.ToString('yyyyMM')}"') do set lastMonth=%%i

echo "删除备份文件%lastMonth%"

del /Q "%server_dir%\%service_name%\%env%\%backup_dir%\%lastMonth%*.jar"

echo "删除日志文件"

del /Q "%server_dir%\%service_name%\%env%\%service_name%-%env%.err.log"
del /Q "%server_dir%\%service_name%\%env%\%service_name%-%env%.out.log"
del /Q "%server_dir%\%service_name%\%env%\%service_name%-%env%.wrapper.log"

echo "启动服务..."

for /f "delims=" %%a in ('%server_dir%\%winsw% start %server_dir%\%service_name%\%env%\%service_name%-%env%.xml') do (
    echo %%a
)

for /f "delims=" %%a in ('%server_dir%\%winsw% status %server_dir%\%service_name%\%env%\%service_name%-%env%.xml') do (
    set result=%%a
)

echo "服务状态：%result%"

exit
```

Jenkins 点击 Apply 保存并应用配置

## GitLab 配置

与 [GitLab+Jenkins+Docker](./gitlab-jenkins-docker.md)相同。
