# Harbor

:::tip
推送 Docker 镜像到 harbor，如果 harbor 的域名没有证书，则需要在 Docker 配置：

```json
{
  "insecure-registries": [
    "harbor.domain.com",
    "harbor.domain.com:6443"
  ]
}
```
https://docs.docker.com/engine/daemon/
:::

## Docker Compose

https://goharbor.io/

## K8S

> TBD：https://github.com/goharbor/harbor-helm
