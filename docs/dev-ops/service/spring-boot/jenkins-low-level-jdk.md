---
tags: [Spring Boot, Jenkins, Docker]
---

# Jenkins 构建低版本 JDK 项目

起源：Jenkins 运行环境的 JDK 版本比构建的项目的 JDK 版本高，Jenkins 无法使用 Maven Project 构建。

## 前置步骤

除了创建项目的时候选择 `Pipeline` 以外，其他配置与[GitLab+Jenkins+Docker](../cicd/gitlab-jenkins-docker.md)基本相同。

## Pipeline

### Definition

1. 选择：`Pipeline script from SCM`
2. 配置 SCM（git地址等信息）
3. `Script Path`：Jenkinsfile

### 项目配置 Jenkinsfile

在项目的根目录下创建文件：`Jenkinsfile`

``` title="Jenkinsfile"
pipeline {
    agent any

    environment {
        // 从 Jenkins 配置中获取 MAVEN_HOME 和 JDK_HOME（准备步骤需要在 Jenkins 全局配置）
        MAVEN_HOME = tool name: 'Maven', type: 'maven'
        JDK_HOME = tool name: 'JDK1.8', type: 'jdk'
    }

    stages {
        stage('Checkout') {
            steps {
                // 从版本控制系统中检出代码
                checkout scm
            }
        }

        stage('Build') {
            steps {
                // 设置 MAVEN_HOME 和 JDK_HOME 环境变量
                withEnv(["MAVEN_HOME=${MAVEN_HOME}", "JAVA_HOME=${JDK_HOME}"]) {
                    // 使用 Maven 构建项目
                    sh "${MAVEN_HOME}/bin/mvn clean package -Dmaven.test.skip=true"
                }
            }
        }

        stage('Docker Build and Deploy') {
            steps {
                // 执行 Docker 相关命令
                sh '''
                    #!/bin/bash
                    PROFILE=dev
                    SERVER_NAME=server
                    CONTAINER_PORT=8080
                    SERVER_PORT=8080
                    IMAGE_NAME=example.harbor.cn/$PROFILE/$SERVER_NAME
                    CONTAINER_NAME=$PROFILE-$SERVER_NAME

                    # 构建 Docker 镜像
                    docker build -t $IMAGE_NAME .

                    # 标记镜像并推送至仓库
                    docker tag $IMAGE_NAME $IMAGE_NAME:$BUILD_NUMBER
                    docker push $IMAGE_NAME
                    docker push $IMAGE_NAME:$BUILD_NUMBER

                    # 删除本地备份镜像
                    docker rmi $IMAGE_NAME:$BUILD_NUMBER

                    # 检查并删除现有容器
                    if docker ps -a --format '{{.Names}}' | grep -q "^$CONTAINER_NAME$"; then
                        echo "容器 $CONTAINER_NAME 存在，正在删除..."
                        docker stop $CONTAINER_NAME
                        docker rm $CONTAINER_NAME
                    else
                        echo "容器 $CONTAINER_NAME 不存在"
                    fi

                    # 运行新容器
                    docker run -itd --restart unless-stopped -p $CONTAINER_PORT:$SERVER_PORT --name $CONTAINER_NAME $IMAGE_NAME

                    # 检查并删除未使用的镜像
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
                '''
            }
        }
    }

    post {
        success {
            echo 'Build succeeded!'
        }
        failure {
            echo 'Build failed!'
        }
    }
}
```

