# 一个注解实现Redis分布式锁

借助 [Redisson](access-redis-with-redisson.md) 简化实现分布式锁。

## 实现效果

1. 在方法上添加自定义注解，当借助 SpringBoot 代理调用该方法的时候自动加锁和释放锁。
2. 注解的 key 支持 SpEL

## 实现原理

借助 Spring 的 AOP 实现。

## 实现过程及关键代码

### 添加 AOP 依赖

部分 spring boot starter 已经添加了该依赖，如果找不到相关注解则并未添加 AOP 相关依赖，需自行添加。

```xml
<dependencies>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-aop</artifactId>
    </dependency>
</dependencies>
```

### 自定义锁注解

```java
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface Lock {

  /** redis 锁 */
  RedisLock lock();

  /** redis 锁的 key 后缀（支持 SpEL） */
  String suffix();
}
```

### 定义 AOP 切面

```java
@Slf4j
@Aspect
@Component
@RequiredArgsConstructor
public class RedisLockAspect {
  private final ApplicationContext applicationContext;
  private final SpelExpressionParser parser = new SpelExpressionParser();
  private final ParameterNameDiscoverer parameterNameDiscoverer =
      new DefaultParameterNameDiscoverer();
  private final RedissonTemplate redissonTemplate;

  @Around("@annotation(lock)")
  public Object lock(ProceedingJoinPoint joinPoint, Lock lock) throws Throwable {
    RedisLock redisLock = lock.lock();
    String suffix = parseSpel(lock.suffix(), joinPoint);
    AtomicReference<Object> result = new AtomicReference<>();
    redissonTemplate.lock(
        redisLock,
        suffix,
        () -> {
          try {
            Object proceed = joinPoint.proceed();
            result.set(proceed);
          } catch (Throwable e) {
            throw new RuntimeException(e);
          }
        });
    return result.get();
  }

  private String parseSpel(String spel, ProceedingJoinPoint joinPoint)
      throws NoSuchMethodException {
    var method = ((org.aspectj.lang.reflect.MethodSignature) joinPoint.getSignature()).getMethod();
    var context =
        new MethodBasedEvaluationContext(
            joinPoint.getTarget(), method, joinPoint.getArgs(), parameterNameDiscoverer);
    // 注册方法，可以使用 #concatSuffix 调用 ConcatUtil 类中的 concat 方法
    context.registerFunction("concatSuffix", ConcatUtil.class.getMethod("concat", Object[].class));
    // 注册 bean 的处理器，可以在 suffix 中调用 bean 的相关方法
    context.setBeanResolver(new BeanFactoryResolver(applicationContext));
    return parser.parseExpression(spel).getValue(context, String.class);
  }
}
```

```java title="ConcatUtil.java"
public class ConcatUtil {
  public static String concat(Object... args) {
    StringBuilder sb = new StringBuilder();
    for (Object arg : args) {
      sb.append(ObjectUtil.isEmpty(arg) ? "null" : arg);
    }
    return sb.toString();
  }
}
```

### 启用 AOP

在启动类上添加注解：`@EnableAspectJAutoProxy(exposeProxy = true)`

## 使用示例

:::tip
在同一个 Bean 里面调用加锁的方法的时候需要获取当前bean的代理对象，通过代理对象调用加锁的方法才能自动加分布式锁：
```java
DistributedLockService service = (DistributedLockService) AopContext.currentProxy();
service.distributedLock(1L);
```
:::

```java
@Service
public class DistributedLockService {

  @Lock(lock = RedisLock.REDIS_LOCK, suffix = "#id")
  public void distributedLock(Long id) {
  }
  
  @Lock(lock = RedisLock.REDIS_LOCK, suffix = "#concatSuffix(#left, #right)")
  public void distributedLockConcat(String left, String right) {
  }
  
  @Lock(lock = RedisLock.REDIS_LOCK, suffix = "#entity.getId()")
  public void distributedLockGetId(Entity entity) {
  }
  
  @Lock(lock = RedisLock.REDIS_LOCK, suffix = "@entityService.getDistributedLockKeyById(#entity.getId())")
  public void distributedLockBean(Entity entity) {
  }
}
```
