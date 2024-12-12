# 自定义消息消费失败处理

## 要解决的问题

根据官方文档 https://spring.io/projects/spring-pulsar 的消息消费失败后，配置消息重试次数，达到最大重试次数后，将消息发送到死信队列，实现消息消费失败的处理。

https://docs.spring.io/spring-pulsar/docs/1.2.0/reference/reference/pulsar/message-consumption.html#_using_dead_letter_topic_from_apache_pulsar_for_message_redelivery_and_error_handling

```java
@EnablePulsar
@Configuration
class DeadLetterPolicyConfig {

    @PulsarListener(id = "deadLetterPolicyListener", subscriptionName = "deadLetterPolicySubscription",
            topics = "topic-with-dlp", deadLetterPolicy = "deadLetterPolicy",
            subscriptionType = SubscriptionType.Shared, properties = { "ackTimeout=1s" })
    void listen(String msg) {
        throw new RuntimeException("fail " + msg);
    }

    @PulsarListener(id = "dlqListener", topics = "my-dlq-topic")
    void listenDlq(String msg) {
        System.out.println("From DLQ: " + msg);
    }

    @Bean
    DeadLetterPolicy deadLetterPolicy() {
        return DeadLetterPolicy.builder().maxRedeliverCount(10).deadLetterTopic("my-dlq-topic").build();
    }

}
```

每一个 Topic 都需要定义一个 DeadLetterPolicy Bean，定义一个死信队列，然后在死信队列处理消息，这都是重复性流程。无法实现整个服务的所有消费者配置重试次数，

如果不需要查看死信队列数据的情况下，也不需要区分死信消息和正常消息，那么可以借助 AOP 来简化流程。

## 实现方案

### 准备

1. 添加 AOP 依赖

    ```xml
    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-aop</artifactId>
        </dependency>
    </dependencies>
    ```

2. 开启 AOP 支持

在启动类添加注解：`@EnableAspectJAutoProxy(exposeProxy = true)`。

### 定义消息消费基类

```java title="MessageConsumer.java"
public interface MessageConsumer<T> {

  void consume(Message<T> message, Consumer<Message<T>> consumer);

  /**
   * 重试多次后处理消息
   *
   * @param message 消息
   * @param exception 失败的异常信息
   */
  void afterRetryFail(Message<T> message, Exception exception);

  /**
   * 消息消费失败重试次数，不包含原始消费
   *
   * @return 重试次数，默认 3 次
   */
  default int retryTime() {
    return 3;
  }
}
```

### 定义切面

```java
@Slf4j
@Aspect
@Component
public class MessageConsumerAspect<T> {

  /**
   * 最少会重试消费一次，如果以 retryTime 为准，可调整改方法的逻辑
   */
  @SuppressWarnings("unchecked")
  @Around("execution(* com.example..*MessageConsumer+.consume(..)) && target(messageConsumer)")
  public Object aroundPulsarListenerMethod(
      ProceedingJoinPoint joinPoint, MessageConsumer<T> messageConsumer) throws Throwable {
    Object result = null;
    Exception consumeException = null;
    Message<T> message = (Message<T>) joinPoint.getArgs()[0];
    Consumer<Message<T>> consumer = (Consumer<Message<T>>) joinPoint.getArgs()[1];
    int redeliveryCount = message.getRedeliveryCount();
    String messageLog =
        " [topic：%s，message：%s，messageId：%s ]"
            .formatted(message.getTopicName(), message.getValue(), message.getMessageId());
    String prefix = redeliveryCount > 0 ? "第 %s 次重试".formatted(redeliveryCount) : "";
    try {
      log.info("开始{}消费消息{}", prefix, messageLog);
      result = joinPoint.proceed();
      log.info("{}消费消息成功{}", prefix, messageLog);
    } catch (Exception exception) {
      consumeException = exception;
    }
    if (consumeException != null) {
      log.error("消息{}消费失败{}", prefix, messageLog, consumeException);
      if (redeliveryCount >= messageConsumer.retryTime()) {
        try {
          log.info("开始处理消费失败的消息{}", messageLog);
          messageConsumer.afterRetryFail(message, consumeException);
          log.info("成功处理消费失败的消息{}", messageLog);
        } catch (Exception exception) {
          log.error("处理消费失败的消息失败{}", messageLog, exception);
        }
        consumer.acknowledge(message);
      } else {
        consumer.negativeAcknowledge(message);
      }
    } else {
      consumer.acknowledge(message);
    }
    return result;
  }
}
```

## 消费者消费消息

```java
@Slf4j
@Service
public class TopicConsumer implements MessageConsumer<Long> {

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
  
  // 每个消费者可自定义消息重试次数
  @Override
  public int retryTime() {
    return 6;
  }
  
  @Override
  public void afterRetryFail(Message<Long> message, Exception exception) {
    // 消息达到重试次数后的处理逻辑
  }
}
```
