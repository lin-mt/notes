---
sidebar_position: 2
---

# 使用 Pulsar

## 添加 pulsar starter

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-pulsar</artifactId>
</dependency>
```

## 配置 pulsar

```yaml
spring:
  pulsar:
    client:
      operation-timeout: 30m
      service-url: pulsar://127.0.0.1:6650
      # pulsar 如果没有设置密码则不需要这个配置
      authentication:
        plugin-class-name: org.apache.pulsar.client.impl.auth.AuthenticationToken
        param:
          token: GeneratedTokenValue
    consumer:
      name: consumer-server
```

## 开启 Pulsar

启动类添加注解：`@EnablePulsar`。

### 简单封装下 `PulsarTemplate`

```java title="MessageTemplate.java"
@Slf4j
public class MessageTemplate<T> {

  private final PulsarTemplate<T> pulsarTemplate;

  public MessageTemplate(PulsarTemplate<T> pulsarTemplate) {
    this.pulsarTemplate = pulsarTemplate;
  }

  @SneakyThrows
  public void sendMsg(String topic, T message) {
    sendMsg(topic, message, Objects.toString(message));
  }

  @SneakyThrows
  public void sendMsg(String topic, T message, String key) {
    MessageId messageId =
        pulsarTemplate
            .newMessage(message)
            .withTopic(topic)
            .withMessageCustomizer(mb -> mb.key(key))
            .send();
    log.info("消息发送成功，Topic={}，message={}，messageId={}", topic, message, messageId);
  }
}
```

```java title="PulsarConfig.java"
@Slf4j
@Configuration
public class PulsarConfig {

  @Bean
  public MessageTemplate<?> messageTemplate(PulsarTemplate<?> pulsarTemplate) {
    return new MessageTemplate<>(pulsarTemplate);
  }
}
```

## 生产者发送消息

```java title="Producer.java"
@Service
@RequiredArgsConstructor
public class Producer {
  
  private final MessageTemplate<Long> messageTemplate;
  
  public void produce(Long id) {
    messageTemplate.sendMsg(Topic.MESSAGE_TOPIC, id);
  }
}
```

## 消费者消费消息

```java
@Slf4j
@Service
public class TopicConsumer {

  @SneakyThrows
  @PulsarListener(
      ackMode = AckMode.MANUAL,
      subscriptionType = SubscriptionType.Shared,
      subscriptionName = Subscription.PULSAR_CONSUMER,
      topics = Topic.PULSAR_TOPIC)
  public void consume(Message<Long> message, Consumer<Message<Long>> consumer) {
    log.info("消费消息: {}", message.getValue());
    consumer.acknowledge(message);
  }
}
```
