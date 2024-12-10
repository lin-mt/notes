---
sidebar_position: 2
---

# Debian 12 使用 RKE2 离线部署 k8s

:::tip
没有标记服务器 hostname 的 sh 命令需要在所有服务器执行。
:::

### 服务器配置

三台服务器，每一台服务器要求如下

- RAM：最低 4 GB（建议至少 8 GB）
- CPU：最少 2（建议至少 4 CPU）

详细要求：https://docs.rke2.io/zh/install/requirements

### 服务器设置

|      ip      | hostname |  role  |
|:------------:|:--------:|:------:|
| 10.211.55.10 |  node10  | master |
| 10.211.55.11 |  node11  | master |
| 10.211.55.12 |  node12  | master |

```sh title="node10"
hostnamectl set-hostname node10
```

```sh title="node11"
hostnamectl set-hostname node11
```

```sh title="node12"
hostnamectl set-hostname node12
```

```sh
cat << EOF > /etc/hosts
10.211.55.10  node10
10.211.55.11  node11
10.211.55.12  node12
EOF
```

安装`chrony`、`ipset`和`ipvsadm`
```shell
apt-get -y install chrony ipset ipvsadm
```

设置服务器时间

```sh
chronyc sources -v
timedatectl set-timezone Asia/Shanghai
```

关闭`swap`

```sh
swapoff -a
sed -ri 's/.*swap.*/#&/' /etc/fstab
```

开启容器运行时所需的内核模块

```sh
cat > /etc/modules-load.d/k8s.conf <<EOF
overlay
br_netfilter
EOF
```

使其生效

```sh
modprobe overlay
modprobe br_netfilter
```

创建/etc/sysctl.d/k8s.conf配置文件：

```shell
cat > /etc/sysctl.d/k8s.conf  <<EOF
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
EOF
```

使以上配置生效

```shell
sysctl --system
```

服务器支持`ipvs`

```shell
cat > /etc/modules-load.d/ipvs.conf << EOF
modprobe -- ip_vs
modprobe -- ip_vs_rr
modprobe -- ip_vs_wrr
modprobe -- ip_vs_sh
modprobe -- nf_conntrack
EOF
```

使以上配置立即生效

```shell
modprobe -- ip_vs
modprobe -- ip_vs_rr
modprobe -- ip_vs_wrr
modprobe -- ip_vs_sh
modprobe -- nf_conntrack
```

```shell
cat > /etc/modules << EOF
ip_vs_sh
ip_vs_wrr
ip_vs_rr
ip_vs
nf_conntrack
EOF
```

## 部署k8s

### 下载安装文件

```shell
mkdir /root/rke2-artifacts && cd /root/rke2-artifacts/
curl -OLs https://github.com/rancher/rke2/releases/download/v1.27.9%2Brke2r1/rke2-images.linux-amd64.tar.zst
curl -OLs https://github.com/rancher/rke2/releases/download/v1.27.9%2Brke2r1/rke2.linux-amd64.tar.gz
curl -OLs https://github.com/rancher/rke2/releases/download/v1.27.9%2Brke2r1/sha256sum-amd64.txt
curl -sfL https://get.rke2.io --output install.sh
```

### 安装RKE2

配置 rke2

```shell title="node10" {3}
mkdir -p /etc/rancher/rke2
cat > /etc/rancher/rke2/config.yaml <<EOF
tls-san: 10.211.55.10 # node10 的 IP 地址
system-default-registry: "registry.cn-hangzhou.aliyuncs.com"
EOF
```

安装 rke2

```shell title="node10"
chmod +x install.sh
INSTALL_RKE2_ARTIFACT_PATH=/root/rke2-artifacts sh install.sh
systemctl start rke2-server && systemctl enable rke2-server
```

查看集群状态

```shell title="node10"
mkdir ~/.kube
ln -s /etc/rancher/rke2/rke2.yaml ~/.kube/config
chmod 600 ~/.kube/config
ln -s /var/lib/rancher/rke2/agent/etc/crictl.yaml /etc/crictl.yaml
ln -s /var/lib/rancher/rke2/bin/kubectl /usr/bin/kubectl
ln -s /var/lib/rancher/rke2/bin/crictl /usr/bin/crictl

kubectl get node
crictl ps
crictl images
```

获取加入集群的`token`

```shell title="node10"
cat /var/lib/rancher/rke2/server/token
```

```text title="node10"
root@node10:~/rke2-artifacts# cat /var/lib/rancher/rke2/server/token
K107ac80c73d5f9b1b41cdf8964034f8e7ea2d5b9d6439914ef2ada1279f73e50a4::server:2630492423c420d92260253874e9b60b
```

`node11`、`node12`加入集群
```shell title="node11、node12" {3-5}
mkdir -p /etc/rancher/rke2
cat > /etc/rancher/rke2/config.yaml <<EOF
server: https://10.211.55.10:9345  # node10 的 IP 地址
token: "K107ac80c73d5f9b1b41cdf8964034f8e7ea2d5b9d6439914ef2ada1279f73e50a4::server:2630492423c420d92260253874e9b60b"
tls-san: 10.211.55.10  # node10 的 IP 地址
system-default-registry: "registry.cn-hangzhou.aliyuncs.com"  # 容器镜像地址
EOF
```

```shell title="node11、node12"
chmod +x install.sh
INSTALL_RKE2_ARTIFACT_PATH=/root/rke2-artifacts sh install.sh
systemctl start rke2-server && systemctl enable rke2-server
```

查看集群所有节点状态

```shell title="node10"
kubectl get node
```

```text title="node10"
root@node10:~/rke2-artifacts# kubectl get node
NAME     STATUS   ROLES                       AGE     VERSION
node10   Ready    control-plane,etcd,master   15m     v1.27.9+rke2r1
node11   Ready    control-plane,etcd,master   3m15s   v1.27.9+rke2r1
node12   Ready    control-plane,etcd,master   2m37s   v1.27.9+rke2r1
```

## 安装 Helm 包管理器

选择一台服务器安装或者本地安装均可，本地安装需要安装 kubectl 和添加管理的 k8s 集群配置。

```shell title="node10"
wget https://get.helm.sh/helm-v3.14.0-linux-amd64.tar.gz
tar -zxvf helm-v3.14.0-linux-amd64.tar.gz
install -m 755 linux-amd64/helm  /usr/local/bin/helm
```

验证安装是否成功

```shell
helm list
```

## 参考

[Ubuntu系统离线安装RKE2+Rancher2.7.5全过程记录](https://blog.csdn.net/u010438035/article/details/131684587)

[RKE2 离线安装](https://docs.rke2.io/zh/install/airgap)
