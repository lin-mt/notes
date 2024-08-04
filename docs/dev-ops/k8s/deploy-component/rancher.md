# Rancher

## 介绍
Rancher 是一个 Kubernetes 管理工具，让我们能在任何地方和任何提供商上部署和运行集群。

## 准备
一个安装了 Helm 的 Kubernetes 集群，集群版本要跟安装的 Rancher 版本兼容，具体可以查询：https://www.suse.com/suse-rancher/support-matrix/all-supported-versions 或者查看[Github Release](https://github.com/rancher/rancher/releases)。

## 部署 Rancher

### 下载 Rancher
添加 Rancher 仓库
```shell
helm repo add rancher-stable https://releases.rancher.com/server-charts/stable
```
下载最新稳定版 Rancher
```shell
mkdir ~/rancher && cd ~/rancher && helm fetch rancher-stable/rancher
```

### 部署`cert-manager`
添加 cert-manager 仓库
```shell
helm repo add jetstack https://charts.jetstack.io && helm repo update
```
下载 cert-manager
```shell {2}
mkdir ~/cert-manager && cd ~/cert-manager
helm fetch jetstack/cert-manager --version v1.13.3
```
部署 cert-manager
```shell {1,5}
curl -L -o cert-manager.crds.yaml https://github.com/cert-manager/cert-manager/releases/download/v1.13.3/cert-manager.crds.yaml
kubectl create namespace cert-manager
kubectl apply -f cert-manager.crds.yaml
helm install cert-manager ./cert-manager-v1.13.3.tgz \
  --namespace cert-manager \
  --set image.repository=quay.io/jetstack/cert-manager-controller \
  --set webhook.image.repository=quay.io/jetstack/cert-manager-webhook \
  --set cainjector.image.repository=quay.io/jetstack/cert-manager-cainjector \
  --set startupapicheck.image.repository=quay.io/jetstack/cert-manager-ctl
```

### 安装 Rancher
创建命名空间
```shell
kubectl create namespace cattle-system
```
```shell {1,3,4}
helm install rancher ./rancher-2.7.9.tgz \
  --namespace cattle-system \
  --set hostname=rancher.linmt.cn \
  --set cert-manager.version=v1.13.3 \
  --set rancherImage=docker.io/rancher/rancher \
  --set systemDefaultRegistry=registry.cn-hangzhou.aliyuncs.com \
  --set useBundledSystemChart=true
```

查看安装结果
```shell
kubectl -n cattle-system get pod
```
获取默认管理员账号（admin）密码
```shell
kubectl get secret --namespace cattle-system bootstrap-secret -o go-template='{{ .data.bootstrapPassword|base64decode}}{{ "\n" }}'
```

## 升级 Rancher

导出安装时的自定义信息：
```shell
helm get values rancher -n cattle-system -o yaml > values.yaml
```
升级 Rancher
```shell
helm upgrade rancher rancher-<CHART_REPO>/rancher \
  --namespace cattle-system \
  -f values.yaml \
  --version=2.6.8
```

## 重置管理员密码

Docker 重置管理员密码
```shell
$ docker exec -ti <container_id> reset-password
New password for default administrator (user-xxxxx):
<new_password>
```

Kubernetes 安装 (Helm):
```shell
$ KUBECONFIG=./kube_config_cluster.yml
$ kubectl --kubeconfig $KUBECONFIG -n cattle-system exec $(kubectl --kubeconfig $KUBECONFIG -n cattle-system get pods -l app=rancher --no-headers | head -1 | awk '{ print $1 }') -c rancher -- reset-password
New password for default administrator (user-xxxxx):
<new_password>
```


## 参考

[Ubuntu系统离线安装RKE2+Rancher2.7.5全过程记录](https://blog.csdn.net/u010438035/article/details/131684587)

[Install/Upgrade Rancher on a Kubernetes Cluster](https://ranchermanager.docs.rancher.com/getting-started/installation-and-upgrade/install-upgrade-on-a-kubernetes-cluster)

[cert-manager Release](https://github.com/cert-manager/cert-manager/releases)

[Upgrades](https://ranchermanager.docs.rancher.com/getting-started/installation-and-upgrade/install-upgrade-on-a-kubernetes-cluster/upgrades)

[Technical](https://ranchermanager.docs.rancher.com/faq/technical-items)
