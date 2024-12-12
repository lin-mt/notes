# 借助 Redisson 访问 Redis

## 简介

Redisson是redis官方推荐的访问redis的工具。

官网：https://redisson.org/

## 目标

使用 redisson 简化访问 redis，统一管理项目中 redis 的 key 和 lock。

## 添加依赖

https://central.sonatype.com/artifact/org.redisson/redisson-spring-boot-starter

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://maven.apache.org/POM/4.0.0"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <properties>
        <java.version>17</java.version>
        <redisson.version>3.23.0</redisson.version>
    </properties>
    <dependencies>
        <dependency>
            <groupId>org.redisson</groupId>
            <artifactId>redisson-spring-boot-starter</artifactId>
            <version>${redisson.version}</version>
        </dependency>
    </dependencies>
</project>
```

## 配置 redisson

```yaml
spring:
  redis:
    redisson:
      # noinspection SpringBootApplicationYaml
      config: |
        singleServerConfig:
          idleConnectionTimeout: 10000
          connectTimeout: 10000
          timeout: 3000
          retryAttempts: 3
          retryInterval: 1500
          clientName: null
          subscriptionsPerConnection: 5
          subscriptionConnectionMinimumIdleSize: 1
          subscriptionConnectionPoolSize: 50
          connectionMinimumIdleSize: 24
          connectionPoolSize: 64
          database: 0
          dnsMonitoringInterval: 5000
        threads: 16
        nettyThreads: 32
        codec: !<org.redisson.codec.MarshallingCodec> {}
        transportMode: "NIO"
        singleServerConfig:
          address: "redis://${spring.data.redis.url}"
          password: password
  data:
    redis:
      url: 127.0.0.1:6379
      repositories:
        enabled: false
```

## 定义 RedisKey

```java
@Getter
public enum RedisKey {
  REDIS_KEY("redisKey", 7, TimeUnit.DAYS),
  ;
  private static final String FORMAT_SUFFIX = ":%s";
  private final String format;
  private final long timeToLive;
  private final TimeUnit timeUnit;

  RedisKey(String prefix, long timeToLive, TimeUnit timeUnit) {
    if (StringUtils.isEmpty(prefix)) {
      throw new IllegalArgumentException("key 的前缀不能为空");
    }
    if (prefix.contains(FORMAT_SUFFIX)) {
      throw new IllegalArgumentException("key 的 format 不能包含字符串 " + FORMAT_SUFFIX);
    }
    Objects.requireNonNull(timeUnit, "key 的过期时间单位不能为空");
    this.format = prefix + FORMAT_SUFFIX;
    this.timeToLive = timeToLive;
    this.timeUnit = timeUnit;
  }

  public <S> String getKeyName(S suffix) {
    return this.format.formatted(suffix);
  }
}
```

## 定义 RedisLock

```java
@Getter
public enum RedisLock {
  REDIS_LOCK("redisLock", 10, TimeUnit.SECONDS);
  private static final String FORMAT_SUFFIX = ":%s";
  private final String format;
  private final long tryLockTime;
  private final TimeUnit tryLockTimeUnit;

  RedisLock(String prefix, long tryLockTime, TimeUnit tryLockTimeUnit) {
    if (StringUtils.isEmpty(prefix)) {
      throw new IllegalArgumentException("lock 的前缀不能为空");
    }
    if (prefix.contains(FORMAT_SUFFIX)) {
      throw new IllegalArgumentException("lock 的 prefix 不能包含字符串 " + FORMAT_SUFFIX);
    }
    Objects.requireNonNull(tryLockTimeUnit, "lock 的过期时间单位不能为空");
    this.format = prefix + FORMAT_SUFFIX;
    this.tryLockTime = tryLockTime;
    this.tryLockTimeUnit = tryLockTimeUnit;
  }

  public <S> String getLockName(S suffix) {
    return this.format.formatted(suffix);
  }
}
```

## 封装 RedissonClient

```java
@Component
@RequiredArgsConstructor
public class RedissonTemplate {

  private final RedissonClient redissonClient;

  private static <S> String getKeyName(RedisKey key, S suffix) {
    Objects.requireNonNull(suffix, "key 的后缀不能为空");
    return key.getKeyName(suffix);
  }

  public <S> void lock(RedisLock lock, S suffix, Runnable runnable) throws InterruptedException {
    RLock rLock = redissonClient.getLock(lock.getLockName(suffix));
    try {
      if (rLock.tryLock(lock.getTryLockTime(), lock.getTryLockTimeUnit())) {
        runnable.run();
      }
    } catch (Exception e) {
      if (e instanceof InterruptedException) {
        throw e;
      }
      throw new RuntimeException(e);
    } finally {
      rLock.unlock();
    }
  }

  public <S> void lock(
      RedisLock lock, S suffix, Runnable runnable, Consumer<Exception> exceptionConsumer) {
    RLock rLock = redissonClient.getLock(lock.getLockName(suffix));
    try {
      if (rLock.tryLock(lock.getTryLockTime(), lock.getTryLockTimeUnit())) {
        runnable.run();
      }
    } catch (Exception e) {
      if (exceptionConsumer != null) {
        exceptionConsumer.accept(e);
      } else {
        throw new RuntimeException(e);
      }
    } finally {
      rLock.unlock();
    }
  }

  public <T, S> void setBucket(RedisKey key, S suffix, T value) {
    String name = getKeyName(key, suffix);
    RBucket<T> rBucket = redissonClient.getBucket(name);
    rBucket.set(value, key.getTimeToLive(), key.getTimeUnit());
  }

  public <T, S> T getBucket(RedisKey key, S suffix) {
    String name = getKeyName(key, suffix);
    RBucket<T> rBucket = redissonClient.getBucket(name);
    return rBucket.get();
  }

  public <K, V, S> void setMap(RedisKey key, S suffix, Map<K, V> value) {
    Objects.requireNonNull(suffix, "key 的后缀不能为空");
    String name = getKeyName(key, suffix);
    RMap<K, V> rMap = redissonClient.getMap(name);
    if (value != null) {
      rMap.putAll(value);
    }
    rMap.expire(Duration.of(key.getTimeToLive(), toChronoUnit(key.getTimeUnit())));
  }

  public <K, V, S> RMap<K, V> getMap(RedisKey key, S suffix) {
    String name = getKeyName(key, suffix);
    return redissonClient.getMap(name);
  }

  private ChronoUnit toChronoUnit(TimeUnit timeUnit) {
    if (timeUnit == null) {
      throw new IllegalArgumentException("timeUnit 不能为空");
    }
    return switch (timeUnit) {
      case NANOSECONDS -> ChronoUnit.NANOS;
      case MICROSECONDS -> ChronoUnit.MICROS;
      case MILLISECONDS -> ChronoUnit.MILLIS;
      case SECONDS -> ChronoUnit.SECONDS;
      case MINUTES -> ChronoUnit.MINUTES;
      case HOURS -> ChronoUnit.HOURS;
      case DAYS -> ChronoUnit.DAYS;
    };
  }
}
```
