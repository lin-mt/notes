---
tags: [Spring Boot, GitLab, Jenkins, Docker]
---

# GitLab+Jenkins+Docker

> 只记录大概流程，详细配置看操作界面进行配置。

## 构建流程

开发者 push 代码到 GitLab 指定分支或者 pull request merge 到指定分支之后自动部署到相应的环境中。

## 准备工作

1. 安装 GitLab
2. 安装 Jenkins
3. 安装 Docker
4. Jenkins 安装 GitLab 插件，配置 GitLab 地址和账号
5. Jenkins 配置服务器地址和账号（如果部署的服务和Jenkins不在同一台服务器）
6. Jenkins 配置 JDK（JDK 版本需要跟 Jenkins 运行的JDK版本相同或者更高），如果项目的JDK版本比 Jenkins 的JDK版本低，可以使用 Pipeline 方式配置项目
7. Jenkins 配置 Maven 地址

## 配置 Jenkins

### 创建项目

`+ New Item` -> 输入项目名称 -> 选择 `Maven Project`

### 配置项目

进入 Jenkins 首页 -> 选择要配置的项目 -> 左侧选择 `Configure`

#### General

`Discard old builds`：构建记录保留策略

`GitLab Connection`：选择项目代码所在的 GitLab 链接

`JDK`：构建项目使用哪个JDK

#### Source Code Management

`Git`：项目 Git 配置

#### Build Triggers

`Build periodically`：定时构建

`Build when a change is pushed to GitLab. GitLab webhook URL:{JenkinsWebhookURL}`：GitLab 触发的 Webhook 地址和配置

> 展开 Advanced，生成一个 SecretToken，后面配置 GitLab 的 Webhook 的时候需要用到

#### Build

配置 pom.xml 文件地址和构建项目的命令

:::tip
-pl：多模块构建
> `clean package -pl server-core,server-api -am -Dmaven.test.skip=true`
:::

#### Post Steps

`Add post-build step` 选择 `Execute shell`：当构建成功的时候执行 shell 脚本

:::tip
如果 Jenkins 与 SpringBoot 服务不在同一台服务器，可以选择 `Send files or execute commands over SSH`
:::

```shell
#!/bin/bash

cd server-api
# 说明：在项目的 server-api 下已经配置好构建 Docker 镜像的 Dockerfile 文件
PROFILE=dev
CONTAINER_PORT=8080
SERVER_PORT=8080
SERVER_NAME=server-api
IMAGE_NAME=harbor.example.cn/$PROFILE/$SERVER_NAME
CONTAINER_NAME=$PROFILE-$SERVER_NAME
docker build -t $IMAGE_NAME .
# 以 Jenkins 的构建记录ID作为镜像的 Tag，从而进行备份 
docker tag $IMAGE_NAME $IMAGE_NAME:$BUILD_NUMBER
docker push $IMAGE_NAME
docker push $IMAGE_NAME:$BUILD_NUMBER
docker rmi $IMAGE_NAME:$BUILD_NUMBER

if docker ps -a --format '{{.Names}}' | grep -q "^$CONTAINER_NAME$"; then
    echo "容器 $CONTAINER_NAME 存在，正在删除..."
    docker stop $CONTAINER_NAME
    docker rm $CONTAINER_NAME
else
    echo "容器 $CONTAINER_NAME 不存在"
fi

docker run -e "SPRING_PROFILES_ACTIVE=$PROFILE" -itd --restart unless-stopped -p $CONTAINER_PORT:$SERVER_PORT -v /logs/$PROFILE/:/logs/$PROFILE/ --name $CONTAINER_NAME $IMAGE_NAME

if docker images --filter "dangling=true" --format "{{.Repository}}" | grep -q "^${IMAGE_NAME}$"; then
    echo "存在镜像名称为 ${IMAGE_NAME} 且标签为 <none> 的镜像，正在删除..."
    
    # 删除指定镜像名称且标签为 <none> 的镜像
    docker rmi $(docker images --filter "dangling=true" --format "{{.Repository}} {{.ID}}" | awk -v image="$IMAGE_NAME" '$1 == image {print $2}')
    
    if [ $? -eq 0 ]; then
        echo "镜像名称为 ${IMAGE_NAME} 且标签为 <none> 的镜像删除成功。"
    else
        echo "镜像名称为 ${IMAGE_NAME} 且标签为 <none> 的镜像删除失败。"
    fi
else
    echo "不存在镜像名称为 ${IMAGE_NAME} 且标签为 <none> 的镜像。"
fi
```

配置完成后点击 Apply 保存并应用配置。

## 配置 GitLab

1. 在 GitLab 项目的左侧选择：`Settings` -> `Webhooks`
2. 添加一个新的 webhook，输入 url，url在配置 jenkins 的时候有一个 `{JenkinsWebhookURL}`
3. `Secret token` 输入 Jenkins 生成的 SecretToken
4. 选择并配置触发这个 Webhook 的事件和分支
5. 配置完成后 Add Webhook，然后 Test 一下
