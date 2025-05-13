---
tags: [RocketMQ, Spring Boot]
---

# 使用 RocketMQ

## 添加 RocketMQ starter

https://github.com/apache/rocketmq-spring

```xml
<dependency>
    <groupId>org.apache.rocketmq</groupId>
    <artifactId>rocketmq-spring-boot-starter</artifactId>
    <version>${rocketmq.version}</version>
</dependency>
```

## 配置 RocketMQ

```yaml
rocketmq:
  name-server: 192.168.1.191:9876
  producer:
    namespace: ${spring.profiles.active}
    group: smart-homework-producer
  consumer:
    namespace: ${spring.profiles.active}
    group: smart-homework-consumer
```

### 简单封装下 `RocketMQTemplate`

```java
public interface Rmq {

  interface Topic {
    String MQ_TOPIC = "mq-topic";
  }

  interface Tags {
    String MQ_TAGS = "mq_tags";
  }
}
```

```java
public interface Destination {

  MqDestination MQ_DESTINATION = () -> Rmq.Tags.MQ_TAGS;

  String getTopic();

  String getTags();

  default String getDestination() {
    return "%s:%s".formatted(getTopic(), getTags());
  }

  interface MqDestination extends Destination {
    @Override
    default String getTopic() {
      return Rmq.Topic.MQ_TOPIC;
    }
  }
}
```

```java title="MessageTemplate.java"
@Slf4j
public class MessageTemplate {

  private final RocketMQTemplate rocketMQTemplate;

  public MessageTemplate(RocketMQTemplate rocketMQTemplate) {
    this.rocketMQTemplate = rocketMQTemplate;
  }

  @SneakyThrows
  public <T> void sendMsg(Destination destination, T payload) {
    Message<T> message =
        MessageBuilder.withPayload(payload)
            .setHeader(MessageConst.PROPERTY_KEYS, Objects.toString(payload))
            .setHeader(MessageConst.PROPERTY_DELAY_TIME_LEVEL, 1)
            .build();
    rocketMQTemplate.asyncSend(
        destination.getDestination(),
        message,
        new SendCallback() {
          @Override
          public void onSuccess(SendResult sendResult) {
            log.info(
                "消息发送成功，destination：{}，message：{}, msgId：{}",
                destination.getDestination(),
                message.getPayload(),
                sendResult.getMsgId());
          }

          @Override
          public void onException(Throwable throwable) {
            log.error(
                "消息发送失败，destination：{}，message：{}",
                destination.getDestination(),
                message.getPayload(),
                throwable);
          }
        });
  }
}
```

```java title="RocketMQConfig.java"
@Slf4j
@Configuration
public class RocketMQConfig {

  @Bean
  public MessageTemplate<?> messageTemplate(RocketMQTemplate<?> RocketMQTemplate) {
    return new MessageTemplate<>(RocketMQTemplate);
  }
}
```

## 生产者发送消息

```java title="Producer.java"
@Service
@RequiredArgsConstructor
public class Producer {
  
  private final MessageTemplate messageTemplate;
  
  public void produce(Long id) {
    messageTemplate.sendMsg(Destination.MQ_DESTINATION, id);
  }
}
```

## 消费者消费消息

```java title="MessageConsumer.java"
@Slf4j
public abstract class MessageConsumer<T> implements RocketMQListener<MessageExt> {

  @Resource private ObjectMapper objectMapper;
  @Resource private ApplicationProperties properties;

  public abstract void consume(T message);

  @Override
  @SneakyThrows
  public void onMessage(MessageExt messageExt) {
    T value =
        objectMapper.readValue(
            new String(messageExt.getBody(), StandardCharsets.UTF_8), new TypeReference<>() {});
    int reconsumeTimes = messageExt.getReconsumeTimes();
    String msgLog =
        " topic：%s，tags:%s，msgId：%s，message：%s"
            .formatted(messageExt.getTopic(), messageExt.getTags(), messageExt.getMsgId(), value);
    String prefix = reconsumeTimes > 0 ? "第 %s 次重试".formatted(reconsumeTimes) : "";
    try {
      log.info("开始{}消费消息：{}", prefix, msgLog);
      consume(value);
      log.info("{}消费消息成功：{}", prefix, msgLog);
    } catch (Exception exception) {
      if (reconsumeTimes >= getMaxReconsumeTimes()) {
        try {
          log.info("开始处理消费失败的消息：{}", msgLog);
          afterRetryFailed(value, exception);
          log.info("成功处理消费失败的消息：{}", msgLog);
        } catch (Exception e) {
          // 保存数据库、发失败消息、告警等。
          log.error("处理消费失败的消息失败：{}", msgLog, exception);
        }
      } else {
        throw exception;
      }
    }
  }

  /**
   * 重试多次后处理消息
   *
   * @param message 消息
   * @param exception 失败的异常信息
   */
  public void afterRetryFailed(T message, Exception exception) {}

  protected int getMaxReconsumeTimes() {
    // 可以统一配置重试消费次数，每个消费者也可以自定义次数
    Integer maxReconsumeTimes = properties.getRocketmq().getMaxReconsumeTimes();
    return maxReconsumeTimes == null ? -1 : Math.max(maxReconsumeTimes, -1);
  }
}
```

```java title="Consumer.java"
@Slf4j
@Service
@RequiredArgsConstructor
@RocketMQMessageListener(
    topic = Rmq.Topic.MQ_TOPIC,
    selectorExpression = Rmq.Tags.MQ_TAGS,
    consumerGroup = CG.MQ_CONSUMER_GROUP)
public class Consumer extends MessageConsumer<Long> {

  @Override
  @Transactional(propagation = Propagation.SUPPORTS)
  public void consume(Long id) {
    log.info("消费消息：{}", id);
  }
}

```
