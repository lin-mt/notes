---
sidebar_position: 1
---

# Debian 12 部署 k8s

## 准备

### 服务器配置

三台服务器，每台服务器内存2GB或更多，CPU2核或更多，硬盘30GB或更多

### 服务器设置

|      ip      | hostname |  role  |
|:------------:|:--------:|:------:|
| 10.211.55.15 |  node15  | master |
| 10.211.55.16 |  node16  | worker |
| 10.211.55.17 |  node17  | worker |

```shell
hostnamectl set-hostname node15
```
```shell
hostnamectl set-hostname node16
```
```shell
hostnamectl set-hostname node17
```
```shell
cat << EOF > /etc/hosts
10.211.55.15  node15
10.211.55.16  node16
10.211.55.17  node17
EOF
```
#### 禁用`selinux`
服务器如果启用了 `selinux` 则禁用 `selinux`:
```shell
setenforce 0
```
```shell
vi /etc/selinux/config
```
将文件中 SELINUX 改为 disable：`SELINUX=disabled`
#### 开机自动加载内核模块
系统启动时自动加载所需的内核模块，以满足容器运行时的要求：
```shell
cat << EOF > /etc/modules-load.d/containerd.conf
overlay
br_netfilter
EOF
```
使以上配置生效
```shell cpoy
modprobe overlay
modprobe br_netfilter
```
创建/etc/sysctl.d/99-kubernetes-cri.conf配置文件：
```shell
cat << EOF > /etc/sysctl.d/99-kubernetes-cri.conf
net.bridge.bridge-nf-call-ip6tables = 1
net.bridge.bridge-nf-call-iptables = 1
net.ipv4.ip_forward = 1
user.max_user_namespaces=28633
EOF
```
使以上配置生效
```shell
sysctl -p /etc/sysctl.d/99-kubernetes-cri.conf
```
#### 服务器支持`ipvs`
```shell
cat > /etc/modules-load.d/ipvs.conf <<EOF
ip_vs
ip_vs_rr
ip_vs_wrr
ip_vs_sh
EOF
```
使以上配置立即生效：
```shell
modprobe ip_vs
modprobe ip_vs_rr
modprobe ip_vs_wrr
modprobe ip_vs_sh
```
#### 安装`ipset`和`ipvsadm`
```shell
apt install -y ipset ipvsadm
```

## 部署 K8S

### 部署容器运行时`Containerd`
```shell
wget https://github.com/containerd/containerd/releases/download/v1.7.11/containerd-1.7.11-linux-amd64.tar.gz
tar Cxzvf /usr/local containerd-1.7.11-linux-amd64.tar.gz
```
安装`runc`
```shell
wget https://github.com/opencontainers/runc/releases/download/v1.1.9/runc.amd64
install -m 755 runc.amd64 /usr/local/sbin/runc
```
生成`containerd`的配置文件:
```shell
mkdir -p /etc/containerd
containerd config default > /etc/containerd/config.toml
```
将文件`/etc/containerd/config.toml`中的`SystemdCgroup`配置改为`true`，`sandbox_image`改为`registry.aliyuncs.com/google_containers/pause:3.9`
```toml
[plugins."io.containerd.grpc.v1.cri".containerd.runtimes.runc]
  ...
  [plugins."io.containerd.grpc.v1.cri".containerd.runtimes.runc.options]
    SystemdCgroup = true
```
```toml
[plugins."io.containerd.grpc.v1.cri"]
  ...
  # sandbox_image = "registry.k8s.io/pause:3.8"
  sandbox_image = "registry.aliyuncs.com/google_containers/pause:3.9"
```
为了通过`systemd`启动`containerd`，需要从 `https://raw.githubusercontent.com/containerd/containerd/main/containerd.service` 下载`containerd.service`文件，并将其放置在`/etc/systemd/system/containerd.service`中。
```shell
cat << EOF > /etc/systemd/system/containerd.service
[Unit]
Description=containerd container runtime
Documentation=https://containerd.io
After=network.target local-fs.target

[Service]
ExecStartPre=-/sbin/modprobe overlay
ExecStart=/usr/local/bin/containerd

Type=notify
Delegate=yes
KillMode=process
Restart=always
RestartSec=5

# Having non-zero Limit*s causes performance problems due to accounting overhead
# in the kernel. We recommend using cgroups to do container-local accounting.
LimitNPROC=infinity
LimitCORE=infinity

# Comment TasksMax if your systemd version does not supports it.
# Only systemd 226 and above support this version.
TasksMax=infinity
OOMScoreAdjust=-999

[Install]
WantedBy=multi-user.target
EOF
```
配置`containerd`开机启动，并启动`containerd`：
```shell
systemctl daemon-reload
systemctl enable containerd --now
systemctl status containerd
```
下载安装`crictl`工具
```shell
wget https://github.com/kubernetes-sigs/cri-tools/releases/download/v1.29.0/crictl-v1.29.0-linux-amd64.tar.gz
tar -zxvf crictl-v1.29.0-linux-amd64.tar.gz
install -m 755 crictl /usr/local/bin/crictl
```
测试是否安装成功：
```shell
crictl --runtime-endpoint=unix:///run/containerd/containerd.sock  version
```
输出：
```text
Version:  0.1.0
RuntimeName:  containerd
RuntimeVersion:  v1.7.11
RuntimeApiVersion:  v1
```

### 安装`kubeadm`和`kubelet`
```shell
apt-get update

apt-get install -y apt-transport-https ca-certificates curl gpg gnupg

curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.29/deb/Release.key | sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg

echo 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.29/deb/ /' | sudo tee /etc/apt/sources.list.d/kubernetes.list

apt-get update

apt install kubelet kubeadm kubectl

apt-mark hold kubelet kubeadm kubectl
```
所有节点开启启动`kubelet`服务
```shell
systemctl enable kubelet.service
```

### 初始化集群
获取集群初始化的默认配置
```shell
kubeadm config print init-defaults --component-configs KubeletConfiguration >> kubeadm.yaml
```
修改集群默认配置
```yaml title="kubeadm.yaml" showLineNumbers {20,34,41,92-94}
apiVersion: kubeadm.k8s.io/v1beta3
bootstrapTokens:
- groups:
  - system:bootstrappers:kubeadm:default-node-token
  # token 可自定义
  token: abcdef.0123456789abcdef
  ttl: 24h0m0s
  usages:
  - signing
  - authentication
kind: InitConfiguration
localAPIEndpoint:
  # 主节点IP
  advertiseAddress: 10.211.55.15
  bindPort: 6443
nodeRegistration:
  criSocket: unix:///var/run/containerd/containerd.sock
  imagePullPolicy: IfNotPresent
  # 主节点 hostname
  name: node15
  taints: null
---
apiServer:
  timeoutForControlPlane: 4m0s
apiVersion: kubeadm.k8s.io/v1beta3
certificatesDir: /etc/kubernetes/pki
clusterName: kubernetes
controllerManager: {}
dns: {}
etcd:
  local:
    dataDir: /var/lib/etcd
# 使用阿里镜像，避免因 gcr 被墙无法下载镜像
imageRepository: registry.aliyuncs.com/google_containers
kind: ClusterConfiguration
kubernetesVersion: 1.29.0
networking:
  dnsDomain: cluster.local
  serviceSubnet: 10.96.0.0/12
  # Calico（Pod网络组件）默认的子网
  podSubnet: 192.168.0.0/16
scheduler: {}
---
apiVersion: kubelet.config.k8s.io/v1beta1
authentication:
  anonymous:
    enabled: false
  webhook:
    cacheTTL: 0s
    enabled: true
  x509:
    clientCAFile: /etc/kubernetes/pki/ca.crt
authorization:
  mode: Webhook
  webhook:
    cacheAuthorizedTTL: 0s
    cacheUnauthorizedTTL: 0s
cgroupDriver: systemd
failSwapOn: false
clusterDNS:
- 10.96.0.10
clusterDomain: cluster.local
containerRuntimeEndpoint: ""
cpuManagerReconcilePeriod: 0s
evictionPressureTransitionPeriod: 0s
fileCheckFrequency: 0s
healthzBindAddress: 127.0.0.1
healthzPort: 10248
httpCheckFrequency: 0s
imageMaximumGCAge: 0s
imageMinimumGCAge: 0s
kind: KubeletConfiguration
logging:
  flushFrequency: 0
  options:
    json:
      infoBufferSize: "0"
  verbosity: 0
memorySwap: {}
nodeStatusReportFrequency: 0s
nodeStatusUpdateFrequency: 0s
rotateCertificates: true
runtimeRequestTimeout: 0s
shutdownGracePeriod: 0s
shutdownGracePeriodCriticalPods: 0s
staticPodPath: /etc/kubernetes/manifests
streamingConnectionIdleTimeout: 0s
syncFrequency: 0s
volumeStatsAggPeriod: 0s
---
# 设置kube-proxy代理模式为ipvs
apiVersion: kubeproxy.config.k8s.io/v1alpha1
kind: KubeProxyConfiguration
mode: ipvs
```
在各个节点预先拉取镜像
```shell
kubeadm config images pull --config kubeadm.yaml
```
使用`kubeadm`在主节点初始化集群
```shell title="master"
kubeadm init --config kubeadm.yaml
```
根据初始化集群命令的输出内容可以设置`kubectl`工具访问集群的配置
```shell title="master"
mkdir -p $HOME/.kube
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config
```
根据初始化集群命令的输出内容，后续可以在其他服务器执行以下命令加入集群
```shell
kubeadm join 10.211.55.15:6443 --token abcdef.0123456789abcdef \
 --discovery-token-ca-cert-hash sha256:9c0eb6268da17c2ca1394adc31fd0a1bd0adf4f0f59e1610a274d4c3dbe33a44
```
> 集群初始化如果遇到问题，可以使用`kubeadm reset`命令进行清理

### 安装包管理器`Helm`
可以先在 master 节点安装
```shell title="master"
wget https://get.helm.sh/helm-v3.13.3-linux-amd64.tar.gz
tar -zxvf helm-v3.13.3-linux-amd64.tar.gz
install -m 755 linux-amd64/helm  /usr/local/bin/helm
```
验证`helm`是否安装成功
```shell title="master"
helm list
```

### 部署Pod Network组件`Calico`
下载`tigera-operator`的helm chart:
```shell title="master"
wget https://github.com/projectcalico/calico/releases/download/v3.27.0/tigera-operator-v3.27.0.tgz
```
导出安装`Calico`的默认配置
```shell title="master"
helm show values tigera-operator-v3.27.0.tgz >> values.yaml
```
使用`helm`安装`calico`
```shell title="master"
helm install calico tigera-operator-v3.27.0.tgz -n kube-system  --create-namespace -f values.yaml
```
等待`calico`相关的所有`Pod`处于`Running`状态
```shell title="master"
kubectl get pod -n kube-system | grep tigera-operator
```
```text
root@node15:~# kubectl get pod -n kube-system | grep tigera-operator
tigera-operator-55585899bf-c8fnt   1/1     Running   1 (37m ago)   23h
```
```shell title="master"
kubectl get pods -n calico-system
```
```text
root@node15:~# kubectl get pods -n calico-system
NAME                                       READY   STATUS    RESTARTS      AGE
calico-kube-controllers-799f47b4c9-lzfhq   1/1     Running   1 (37m ago)   23h
calico-node-6w4g5                          1/1     Running   1 (37m ago)   23h
calico-node-gprgp                          1/1     Running   1 (37m ago)   23h
calico-node-ks5bm                          1/1     Running   1 (37m ago)   23h
calico-typha-6fbccccb4b-kfs44              1/1     Running   1 (37m ago)   23h
calico-typha-6fbccccb4b-rfbrd              1/1     Running   1 (37m ago)   23h
csi-node-driver-9lqsn                      2/2     Running   2 (37m ago)   23h
csi-node-driver-q75s5                      2/2     Running   2 (37m ago)   23h
csi-node-driver-qtz27                      2/2     Running   2 (37m ago)   23h
```
将`calicoctl`安装为`kubectl`的插件，使用`calicoctl`管理`calico`向k8s中添加的api资源:
```shell title="master"
cd /usr/local/bin
curl -o kubectl-calico -O -L  "https://github.com/projectcalico/calico/releases/download/v3.27.0/calicoctl-linux-amd64"
chmod +x kubectl-calico
```
验证安装是否成功
```shell title="master"
kubectl calico -h
```
### 验证k8s DNS是否可用
```shell title="master"
kubectl run curl --image=radial/busyboxplus:curl -it
```
```text
root@node15:~# kubectl run curl --image=radial/busyboxplus:curl -it
If you don't see a command prompt, try pressing enter.
[ root@curl:/ ]$
```
执行`nslookup kubernetes.default`确认解析正常
```shell title="master"
nslookup kubernetes.default
```
```text
[ root@curl:/ ]$ nslookup kubernetes.default
Server:    10.96.0.10
Address 1: 10.96.0.10 kube-dns.kube-system.svc.cluster.local

Name:      kubernetes.default
Address 1: 10.96.0.1 kubernetes.default.svc.cluster.local
```
### 其他节点加入集群
```shell title="worker"
kubeadm join 10.211.55.15:6443 --token abcdef.0123456789abcdef \
 --discovery-token-ca-cert-hash sha256:9c0eb6268da17c2ca1394adc31fd0a1bd0adf4f0f59e1610a274d4c3dbe33a44
```
在`master`节点查看集群节点信息
```shell title="master"
kubectl get node
```
```text
root@node15:~# kubectl get node
NAME     STATUS   ROLES           AGE   VERSION
node15   Ready    control-plane   23h   v1.29.0
node16   Ready    <none>          23h   v1.29.0
node17   Ready    <none>          23h   v1.29.0
```

## 常用组件部署

### 部署`ingress-nginx`
将 node16 作为边缘节点，打上Label：
```shell title="master"
kubectl label node node16 node-role.kubernetes.io/edge=
```

:::tip
具有 node-role.kubernetes.io/control-plane 标记的节点不可用于调度。这可能是控制平面节点，通常不应该用于调度工作负载。
:::

下载ingress-nginx的helm chart:
```shell title="master"
wget https://github.com/kubernetes/ingress-nginx/releases/download/helm-chart-4.9.0/ingress-nginx-4.9.0.tgz
```
导出默认配置
```shell title="master"
helm show values ingress-nginx-4.9.0.tgz >> values.yaml
```
自定义`ingress-nginx`配置
```yaml title="values.yaml" showLineNumbers {11-15,18,20}
controller:
  ingressClassResource:
    name: nginx
    enabled: true
    default: true
    controllerValue: "k8s.io/ingress-nginx"
  admissionWebhooks:
    enabled: false
  replicaCount: 1
  image:
    # registry: registry.k8s.io
    # image: ingress-nginx/controller
    # tag: "v1.9.5"
    registry: docker.io
    image: unreachableg/registry.k8s.io_ingress-nginx_controller
    tag: "v1.9.5"
    digest: sha256:bdc54c3e73dcec374857456559ae5757e8920174483882b9e8ff1a9052f96a35
  hostNetwork: true
  nodeSelector:
    node-role.kubernetes.io/edge: ''
  affinity:
    podAntiAffinity:
        requiredDuringSchedulingIgnoredDuringExecution:
        - labelSelector:
            matchExpressions:
            - key: app
              operator: In
              values:
              - nginx-ingress
            - key: component
              operator: In
              values:
              - controller
          topologyKey: kubernetes.io/hostname
  tolerations:
      - key: node-role.kubernetes.io/master
        operator: Exists
        effect: NoSchedule
      - key: node-role.kubernetes.io/master
        operator: Exists
```
拉取镜像
```shell title="master"
crictl --runtime-endpoint=unix:///run/containerd/containerd.sock pull unreachableg/registry.k8s.io_ingress-nginx_controller:v1.9.5
```
安装`ingress-nginx`
```shell title="master"
helm install ingress-nginx ingress-nginx-4.9.0.tgz --create-namespace -n ingress-nginx -f ingress-nginx-values.yaml
```
访问 http://10.211.55.16 返回默认的 nginx 404 页，则部署完成。

## 问题

### 安装 kubeadm 和 kubectl 时无法生成 `kubernetes-apt-keyring.gpg`

安装`gnupg`
```shell
apt install -y gnupg
```

### 安装 Calico 后没有看到`calico-system`相关的 pod

在初始化集群的时候需要指定 pod 的子网：`podSubnet: 192.168.0.0/16`

### 部署ingress-nginx时，pod 一直处于 Pending 状态

查看 pod 信息：
```shell
kubectl describe pod <pod-name> -n <namespace>
```
```text
0/3 nodes are available: 1 node(s) had untolerated taint {node-role.kubernetes.io/control-plane: }, 2 node(s) didn't match Pod's node affinity/selector. preemption: 0/3 nodes are available: 3 Preemption is not helpful for scheduling.
```
1. Untolerated Taint： 具有 node-role.kubernetes.io/control-plane 标记的节点不可用于调度。这可能是控制平面节点，通常不应该用于调度工作负载。

2. Node Affinity/Selector： Pod 的 node affinity 或 selector 要求没有与任何节点匹配。

解决 Untolerated Taint 问题：

a. 不使用控制平面节点：
如果你的集群中有控制平面节点，并且它们有 taint，你可以选择不在这些节点上调度工作负载。你可以使用 nodeSelector 或 nodeAffinity 来选择非控制平面节点。
```yaml
affinity:
  nodeAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
      nodeSelectorTerms:
      - matchExpressions:
        - key: node-role.kubernetes.io/control-plane
          operator: NotIn
          values:
          - "true"
```
b. 容忍控制平面节点：
如果你确实需要使用控制平面节点，你可以尝试在 Pod 的调度规则中容忍这些节点的 taint。
```yaml
tolerations:
- key: node-role.kubernetes.io/control-plane
  effect: NoSchedule
```
解决 Node Affinity/Selector 问题：
检查 Pod 的定义文件，确保 nodeAffinity 或 nodeSelector 部分没有限制太严格，导致没有可用节点。
```yaml
affinity:
  nodeAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
      nodeSelectorTerms:
      - matchExpressions:
        - key: <key>
          operator: In
          values:
          - <value>
```
或者
```yaml
nodeSelector:
<key>: <value>
```

## 参考

[使用kubeadm部署Kubernetes 1.29](https://blog.frognew.com/2023/12/kubeadm-install-kubernetes-1.29.html)

[Quickstart for Calico on Kubernetes](https://docs.tigera.io/calico/latest/getting-started/kubernetes/quickstart)

[K8s安装](https://juejin.cn/post/7305328476562522152)

## 其他

### 不使用 Calico 默认的 pod 子网 192.168.0.0/16

[kubernetes安装使用calico作为集群cni](https://cloud.tencent.com/developer/article/2255721)

[云原生 | k8s网络之calico组件多方式快速部署及使用calicoctl管理维护网络](https://cloud.tencent.com/developer/article/2353434)

https://raw.githubusercontent.com/projectcalico/calico/v3.27.0/manifests/tigera-operator.yaml

https://raw.githubusercontent.com/projectcalico/calico/v3.27.0/manifests/calico.yaml

https://raw.githubusercontent.com/projectcalico/calico/v3.27.0/manifests/custom-resources.yaml